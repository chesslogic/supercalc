#!/usr/bin/env python3
"""
Enumerate Helldivers 2 enemy pages on wiki.gg and extract anatomy sidecar data.

Enumeration strategy:
- enumerate units from the three faction overview pages
- only collect gallery links from the enemy list section on each page
- ignore broad category pages because they include structures, missions, and other noise

Extraction strategy:
- pull page wikitext through the MediaWiki parse API
- read structured {{Anatomy Table}} / {{Anatomy Row}} template invocations
- normalize the result into an enemydata-like sidecar shape that preserves provenance

The output is intended for review and comparison, not direct production merges.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, MutableMapping, Optional
from urllib.parse import quote, urlencode, urljoin
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_PATH = REPO_ROOT / "enemies" / "wikigg-enemy-anatomy-sidecar.json"
WIKIGG_BASE_URL = "https://helldivers.wiki.gg"
WIKIGG_API_URL = f"{WIKIGG_BASE_URL}/api.php"
SOURCE_PROVENANCE = "wikigg-parse-api-wikitext"
SCHEMA_VERSION = 1
HTTP_USER_AGENT = "supercalc-wikigg-enemy-ingest/1.0"

H2_HEADLINE_RE = re.compile(
    r'(?is)<h2[^>]*>.*?<span[^>]*class="[^"]*\bmw-headline\b[^"]*"[^>]*>(.*?)</span>.*?</h2>'
)
H3_HEADLINE_RE = re.compile(
    r'(?is)<h3[^>]*>.*?<span[^>]*class="[^"]*\bmw-headline\b[^"]*"[^>]*>(.*?)</span>.*?</h3>'
)
GALLERY_LINK_RE = re.compile(
    r'(?is)<div[^>]*class="[^"]*\bgallerytext\b[^"]*"[^>]*>\s*'
    r'<a[^>]*href="(?P<href>/wiki/[^"#?]+)"[^>]*?(?:title="(?P<title>[^"]+)")?[^>]*>'
    r'(?P<text>.*?)</a>'
)

PREFERRED_STATE_LABELS = ("intact", "default", "base", "standard")


@dataclass(frozen=True)
class FactionPageSpec:
    faction: str
    page_title: str
    list_heading: str
    default_subsection: str


FACTION_PAGE_SPECS = (
    FactionPageSpec(
        faction="Automaton",
        page_title="Automatons",
        list_heading="List of Automatons",
        default_subsection="Standard Automatons",
    ),
    FactionPageSpec(
        faction="Terminid",
        page_title="Terminids",
        list_heading="List of Terminids",
        default_subsection="Standard Terminids",
    ),
    FactionPageSpec(
        faction="Illuminate",
        page_title="Illuminate",
        list_heading="List of Illuminate Units",
        default_subsection="Standard Illuminate",
    ),
)


def collapse_whitespace(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def strip_html_tags(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"(?i)<br\s*/?>", " ", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text)


def normalize_markup_text(value: Any) -> str:
    return collapse_whitespace(strip_html_tags(value))


def normalize_key(text: Any) -> str:
    normalized = normalize_markup_text(text).replace("&", " and ")
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", normalized.lower()).strip("_")
    return normalized or "unknown"


def normalize_number(value: float) -> int | float:
    rounded = round(float(value), 6)
    if float(rounded).is_integer():
        return int(rounded)
    return rounded


def parse_numeric_value(value: Any) -> Any:
    text = normalize_markup_text(value)
    if not text or text in {"-", "None"}:
        return None

    text = text.replace("−", "-")

    if re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?", text):
        normalized = text.replace(",", "")
    elif "," in text and "." not in text and re.fullmatch(r"-?\d+(?:,\d+)?", text):
        if re.fullmatch(r"-?\d+,\d{3}", text) and not text.startswith(("0,", "-0,")):
            normalized = text.replace(",", "")
        else:
            normalized = text.replace(",", ".")
    elif text.count(",") > 1 and "." not in text:
        normalized = text.replace(",", "")
    else:
        normalized = text

    if re.fullmatch(r"-?\d+(?:\.\d+)?", normalized):
        return normalize_number(float(normalized))

    return text


def parse_percent_value(value: Any) -> Any:
    text = normalize_markup_text(value)
    if not text or text in {"-", "None"}:
        return None
    if text.endswith("%"):
        numeric = parse_numeric_value(text[:-1])
        if isinstance(numeric, (int, float)):
            return normalize_number(float(numeric) / 100)
    return parse_numeric_value(text)


def parse_boolean_flag(value: Any) -> bool | None:
    text = normalize_markup_text(value)
    if not text or text in {"-", "None"}:
        return None
    lowered = text.lower()
    if lowered in {"yes", "true", "y", "1"}:
        return True
    if lowered in {"no", "false", "n", "0"}:
        return False
    return None


def parse_constitution_value(value: Any) -> tuple[Any, Any]:
    text = normalize_markup_text(value)
    if not text or text in {"-", "None"}:
        return None, None

    match = re.fullmatch(r"(.+?)\s*\[\s*(.+?)\s*/\s*s\s*\]", text)
    if match:
        base = parse_numeric_value(match.group(1))
        rate = parse_numeric_value(match.group(2))
        return base, rate

    return parse_numeric_value(text), None


def extract_numeric_values(value: Any) -> list[int | float]:
    text = normalize_markup_text(value)
    numbers: list[int | float] = []
    for token in re.findall(r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:[.,]\d+)?", text):
        parsed = parse_numeric_value(token)
        if isinstance(parsed, (int, float)):
            numbers.append(parsed)
    return numbers


def normalize_zone_name(label: Any) -> tuple[str, int | None, str]:
    source_label = normalize_markup_text(label)
    zone_count = None
    match = re.search(r"\((\d+)\)\s*$", source_label)
    base_label = source_label
    if match:
        zone_count = int(match.group(1))
        base_label = source_label[: match.start()].strip()

    normalized = normalize_key(base_label)
    if normalized == "main":
        return "Main", zone_count, source_label

    return normalized, zone_count, source_label


def ensure_parent_dir(path: Path) -> None:
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def current_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_page_url(page_title: str) -> str:
    return f"{WIKIGG_BASE_URL}/wiki/{quote(page_title.replace(' ', '_'), safe='()/:%')}"


def build_parse_api_url(page_title: str, prop: str) -> str:
    query = urlencode(
        {
            "action": "parse",
            "page": page_title,
            "prop": prop,
            "format": "json",
        }
    )
    return f"{WIKIGG_API_URL}?{query}"


def strip_heading_text(value: str) -> str:
    return collapse_whitespace(strip_html_tags(value))


def find_h2_section_html(html_text: str, heading_text: str) -> str:
    matches = list(H2_HEADLINE_RE.finditer(html_text))
    for index, match in enumerate(matches):
        text = strip_heading_text(match.group(1))
        if text != heading_text:
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(html_text)
        return html_text[start:end]
    return ""


def extract_gallery_page_entries(section_html: str, default_subsection: str) -> list[dict[str, str]]:
    subsection_chunks: list[tuple[str, str]] = []
    h3_matches = list(H3_HEADLINE_RE.finditer(section_html))

    if not h3_matches:
        subsection_chunks.append((default_subsection, section_html))
    else:
        preamble = section_html[: h3_matches[0].start()]
        if GALLERY_LINK_RE.search(preamble):
            subsection_chunks.append((default_subsection, preamble))
        for index, match in enumerate(h3_matches):
            subsection = strip_heading_text(match.group(1)) or default_subsection
            start = match.end()
            end = h3_matches[index + 1].start() if index + 1 < len(h3_matches) else len(section_html)
            subsection_chunks.append((subsection, section_html[start:end]))

    entries: list[dict[str, str]] = []
    seen_titles: set[str] = set()

    for subsection, chunk in subsection_chunks:
        for match in GALLERY_LINK_RE.finditer(chunk):
            href = html.unescape(match.group("href") or "")
            if not href.startswith("/wiki/") or href.startswith("/wiki/File:"):
                continue
            title = strip_heading_text(match.group("title") or match.group("text"))
            if not title or title in seen_titles:
                continue
            seen_titles.add(title)
            entries.append(
                {
                    "page_title": title,
                    "page_url": urljoin(WIKIGG_BASE_URL, href),
                    "subsection": subsection,
                }
            )

    return entries


def enumerate_enemy_pages_from_faction_html(
    html_text: str,
    faction_spec: FactionPageSpec,
) -> list[dict[str, str]]:
    section_html = find_h2_section_html(html_text, faction_spec.list_heading)
    if not section_html:
        return []

    entries = extract_gallery_page_entries(section_html, faction_spec.default_subsection)
    for entry in entries:
        entry["faction"] = faction_spec.faction
        entry["faction_page_title"] = faction_spec.page_title
        entry["faction_page_url"] = build_page_url(faction_spec.page_title)
        entry["list_heading"] = faction_spec.list_heading
    return entries


def extract_named_section(wikitext: str, section_name: str) -> str:
    pattern = re.compile(
        rf"(?ms)^\s*==\s*{re.escape(section_name)}\s*==\s*(.*?)(?=^\s*==\s*[^=].*?==\s*$|\Z)"
    )
    match = pattern.search(wikitext)
    if not match:
        return ""
    return match.group(1).strip()


def extract_tabber_states(section_text: str) -> "OrderedDict[str, str]":
    tabber_match = re.search(r"(?is)<tabber>(.*?)</tabber>", section_text)
    if not tabber_match:
        return OrderedDict([("default", section_text)])

    inner = tabber_match.group(1).strip()
    states: "OrderedDict[str, str]" = OrderedDict()

    for match in re.finditer(
        r"(?ms)^\s*\|-\|(?P<label>[^=\n]+?)\s*=\s*(?P<body>.*?)(?=^\s*\|-\||\Z)",
        inner,
    ):
        label = normalize_markup_text(match.group("label")) or "default"
        body = match.group("body").strip()
        states[label] = body

    if states:
        return states
    return OrderedDict([("default", section_text)])


def find_matching_template_end(text: str, start_index: int) -> int:
    depth = 0
    index = start_index
    length = len(text)

    while index < length - 1:
        token = text[index : index + 2]
        if token == "{{":
            depth += 1
            index += 2
            continue
        if token == "}}":
            depth -= 1
            index += 2
            if depth == 0:
                return index
            continue
        index += 1

    return -1


def normalize_template_name(name: str) -> str:
    return collapse_whitespace(name).replace("_", " ").lower()


def get_template_name(template_source: str) -> str:
    inner = template_source[2:]
    characters: list[str] = []
    index = 0
    while index < len(inner):
        token = inner[index : index + 2]
        if token in {"{{", "}}"}:
            break
        if inner[index] in {"|", "}"}:
            break
        characters.append(inner[index])
        index += 1
    return collapse_whitespace("".join(characters))


def extract_named_templates(text: str, template_name: str) -> list[str]:
    normalized_target = normalize_template_name(template_name)
    matches: list[str] = []
    index = 0

    while True:
        start = text.find("{{", index)
        if start == -1:
            break
        end = find_matching_template_end(text, start)
        if end == -1:
            break
        template_source = text[start:end]
        if normalize_template_name(get_template_name(template_source)) == normalized_target:
            matches.append(template_source)
        index = start + 2

    return matches


def split_top_level(text: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    curly_depth = 0
    square_depth = 0
    index = 0

    while index < len(text):
        token = text[index : index + 2]
        if token == "{{":
            curly_depth += 1
            current.append(token)
            index += 2
            continue
        if token == "}}" and curly_depth > 0:
            curly_depth -= 1
            current.append(token)
            index += 2
            continue
        if token == "[[":
            square_depth += 1
            current.append(token)
            index += 2
            continue
        if token == "]]" and square_depth > 0:
            square_depth -= 1
            current.append(token)
            index += 2
            continue
        if text[index] == delimiter and curly_depth == 0 and square_depth == 0:
            parts.append("".join(current))
            current = []
            index += 1
            continue
        current.append(text[index])
        index += 1

    parts.append("".join(current))
    return parts


def split_top_level_once(text: str, delimiter: str) -> tuple[str, str] | None:
    curly_depth = 0
    square_depth = 0
    index = 0

    while index < len(text):
        token = text[index : index + 2]
        if token == "{{":
            curly_depth += 1
            index += 2
            continue
        if token == "}}" and curly_depth > 0:
            curly_depth -= 1
            index += 2
            continue
        if token == "[[":
            square_depth += 1
            index += 2
            continue
        if token == "]]" and square_depth > 0:
            square_depth -= 1
            index += 2
            continue
        if text[index] == delimiter and curly_depth == 0 and square_depth == 0:
            return text[:index], text[index + 1 :]
        index += 1

    return None


def parse_template_invocation(template_source: str) -> tuple[str, "OrderedDict[str, str]", list[str]]:
    inner = template_source[2:-2].strip()
    parts = split_top_level(inner, "|")
    name = collapse_whitespace(parts[0]) if parts else ""
    named_params: "OrderedDict[str, str]" = OrderedDict()
    positional_params: list[str] = []

    for part in parts[1:]:
        stripped = part.strip()
        if not stripped:
            continue
        named_param = split_top_level_once(stripped, "=")
        if named_param is not None:
            key, value = named_param
            named_params[collapse_whitespace(key)] = value.strip()
        else:
            positional_params.append(stripped)

    return name, named_params, positional_params


def pick_primary_state_label(state_labels: Iterable[str]) -> str | None:
    labels = list(state_labels)
    if not labels:
        return None

    def sort_key(item: tuple[int, str]) -> tuple[int, int]:
        index, label = item
        normalized = normalize_key(label)
        for priority, preferred in enumerate(PREFERRED_STATE_LABELS):
            if normalized == preferred:
                return priority, index
        return len(PREFERRED_STATE_LABELS), index

    return min(enumerate(labels), key=sort_key)[1]


def extract_infobox_enemy_metadata(wikitext: str) -> dict[str, Any]:
    for infobox_template in extract_named_templates(wikitext, "Infobox Enemy"):
        _, params, _ = parse_template_invocation(infobox_template)
        if not params:
            continue

        metadata: dict[str, Any] = {}
        health = parse_numeric_value(params.get("health"))
        if isinstance(health, (int, float)):
            metadata["health"] = health
        else:
            health_values = extract_numeric_values(params.get("health"))
            if health_values:
                metadata["health"] = max(health_values)

        faction = normalize_markup_text(params.get("faction"))
        if faction:
            metadata["faction"] = faction

        enemy_class = normalize_markup_text(params.get("class"))
        if enemy_class:
            metadata["class"] = enemy_class

        description = normalize_markup_text(params.get("description"))
        if description:
            metadata["description"] = description

        return metadata

    return {}


def get_main_health(row_params_list: Iterable[Mapping[str, str]]) -> Any:
    for row_params in row_params_list:
        zone_name, _, _ = normalize_zone_name(row_params.get("part_name"))
        if zone_name != "Main":
            continue
        health = parse_numeric_value(row_params.get("health"))
        if isinstance(health, (int, float)):
            return health

    for row_params in row_params_list:
        health = parse_numeric_value(row_params.get("health"))
        if isinstance(health, (int, float)):
            return health

    return None


def build_zone_record(row_params: Mapping[str, str]) -> dict[str, Any] | None:
    source_zone_name = normalize_markup_text(row_params.get("part_name"))
    if not source_zone_name:
        return None

    zone_name, zone_count, source_zone_name = normalize_zone_name(source_zone_name)
    record: "OrderedDict[str, Any]" = OrderedDict()
    record["zone_name"] = zone_name
    record["source_zone_name"] = source_zone_name
    if zone_count is not None:
        record["source_zone_count"] = zone_count

    raw_health = normalize_markup_text(row_params.get("health"))
    if raw_health:
        if raw_health.lower().startswith("main"):
            record["health"] = "Main"
        else:
            parsed_health = parse_numeric_value(raw_health)
            if parsed_health is not None:
                record["health"] = parsed_health

    armor = parse_numeric_value(row_params.get("av"))
    if armor is not None:
        record["AV"] = armor

    durable = parse_percent_value(row_params.get("durability"))
    if durable is not None:
        record["Dur%"] = durable

    to_main = parse_percent_value(row_params.get("percent_to_main"))
    if to_main is not None:
        record["ToMain%"] = to_main
    elif zone_name == "Main":
        record["ToMain%"] = 1

    main_cap = parse_boolean_flag(row_params.get("dmg_cap_main"))
    if main_cap is not None:
        record["MainCap"] = main_cap
    elif zone_name == "Main":
        record["MainCap"] = True

    constitution, constitution_rate = parse_constitution_value(row_params.get("bleed"))
    if isinstance(constitution, (int, float)) and constitution != 0:
        record["Con"] = constitution
        if isinstance(constitution_rate, (int, float)):
            record["ConRate"] = constitution_rate
            if constitution_rate == 0:
                record["ConNoBleed"] = True

    fatal = parse_boolean_flag(row_params.get("fatal"))
    if fatal and record.get("health") not in {"Main", None} and zone_name != "Main":
        record["IsFatal"] = True

    exdr = parse_percent_value(row_params.get("exdr"))
    if zone_name == "Main":
        record["ExTarget"] = "Main"
        if isinstance(exdr, (int, float)):
            ex_mult = normalize_number(1 - float(exdr))
            if ex_mult != 1:
                record["ExMult"] = ex_mult
    elif isinstance(exdr, (int, float)):
        if float(exdr) >= 1:
            record["ExTarget"] = "Main"
        else:
            record["ExTarget"] = "Part"
            ex_mult = normalize_number(1 - float(exdr))
            if ex_mult != 1:
                record["ExMult"] = ex_mult

    return record


def build_state_payload(row_params_list: list[Mapping[str, str]]) -> dict[str, Any]:
    zones = [zone for zone in (build_zone_record(row_params) for row_params in row_params_list) if zone]
    payload: "OrderedDict[str, Any]" = OrderedDict()
    health = get_main_health(row_params_list)
    if health is not None:
        payload["health"] = health
    payload["damageable_zones"] = zones
    return payload


def extract_anatomy_payload_from_wikitext(wikitext: str) -> dict[str, Any]:
    anatomy_section = extract_named_section(wikitext, "Anatomy")
    if not anatomy_section:
        return {
            "status": "missing-anatomy-section",
            "selected_state": None,
            "states": OrderedDict(),
            "health": None,
            "damageable_zones": [],
        }

    state_texts = extract_tabber_states(anatomy_section)
    states: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()

    for label, state_text in state_texts.items():
        row_params_list: list[Mapping[str, str]] = []

        table_templates = extract_named_templates(state_text, "Anatomy Table")
        if table_templates:
            for table_template in table_templates:
                _, _, positional_params = parse_template_invocation(table_template)
                table_body = "\n".join(positional_params)
                for row_template in extract_named_templates(table_body, "Anatomy Row"):
                    _, row_params, _ = parse_template_invocation(row_template)
                    if row_params:
                        row_params_list.append(row_params)
        else:
            for row_template in extract_named_templates(state_text, "Anatomy Row"):
                _, row_params, _ = parse_template_invocation(row_template)
                if row_params:
                    row_params_list.append(row_params)

        if row_params_list:
            states[label] = build_state_payload(row_params_list)

    if not states:
        return {
            "status": "missing-anatomy-rows",
            "selected_state": None,
            "states": OrderedDict(),
            "health": None,
            "damageable_zones": [],
        }

    selected_state = pick_primary_state_label(states.keys())
    primary_state = states[selected_state] if selected_state else {"health": None, "damageable_zones": []}

    return {
        "status": "ok",
        "selected_state": selected_state,
        "states": states,
        "health": primary_state.get("health"),
        "damageable_zones": primary_state.get("damageable_zones", []),
    }


def make_warning(
    message: str,
    warnings: list[str],
    *,
    strict: bool,
    prefix: str = "Warning",
) -> None:
    warnings.append(message)
    if strict:
        raise SystemExit(f"Strict mode: {message}")
    print(f"{prefix}: {message}", file=sys.stderr)


def build_unit_entry(
    page_entry: Mapping[str, str],
    anatomy_payload: Mapping[str, Any],
    *,
    fetched_at: str,
    unit_health: Any = None,
    error: str | None = None,
) -> dict[str, Any]:
    unit_entry: "OrderedDict[str, Any]" = OrderedDict()
    if unit_health is None:
        unit_health = anatomy_payload.get("health")
    if unit_health is not None:
        unit_entry["health"] = unit_health
    unit_entry["damageable_zones"] = list(anatomy_payload.get("damageable_zones") or [])
    unit_entry["source_profile_name"] = page_entry["page_title"]

    if error:
        unit_entry["source_note"] = error
    elif anatomy_payload.get("status") != "ok":
        unit_entry["source_note"] = str(anatomy_payload.get("status"))

    provenance: "OrderedDict[str, Any]" = OrderedDict()
    provenance["dataset"] = "wikigg-enemy-anatomy-sidecar"
    provenance["fetch_timestamp"] = fetched_at
    provenance["source_page_title"] = page_entry["page_title"]
    provenance["source_page_url"] = page_entry["page_url"]
    provenance["source_parse_wikitext_url"] = build_parse_api_url(page_entry["page_title"], "wikitext")
    provenance["source_faction_page_title"] = page_entry["faction_page_title"]
    provenance["source_faction_page_url"] = page_entry["faction_page_url"]
    provenance["source_faction_parse_url"] = build_parse_api_url(page_entry["faction_page_title"], "text")
    provenance["enumeration_method"] = "faction-page-gallery"
    provenance["enumeration_section"] = page_entry["list_heading"]
    provenance["source_subfaction"] = page_entry["subsection"]
    provenance["anatomy_extraction_method"] = "parse-api-wikitext-templates"
    provenance["selected_anatomy_state"] = anatomy_payload.get("selected_state")
    provenance["anatomy_states"] = anatomy_payload.get("states", OrderedDict())
    provenance["status"] = anatomy_payload.get("status")
    unit_entry["source_provenance"] = provenance

    return unit_entry


def fetch_parse_prop(page_title: str, prop: str, *, timeout: int) -> str:
    url = build_parse_api_url(page_title, prop)
    request = Request(url, headers={"User-Agent": HTTP_USER_AGENT})
    with urlopen(request, timeout=timeout) as response:
        data = json.load(response)

    if "error" in data:
        error_info = data["error"]
        raise ValueError(
            f"wiki.gg API error for {page_title!r} ({prop}): "
            f"{error_info.get('code')} {error_info.get('info')}"
        )

    parse = data.get("parse") or {}
    prop_payload = parse.get(prop)
    if isinstance(prop_payload, Mapping):
        return str(prop_payload.get("*") or "")
    return str(prop_payload or "")


def build_wikigg_enemy_sidecar(
    fetch_faction_html: Callable[[str], str],
    fetch_unit_wikitext: Callable[[str], str],
    *,
    fetched_at: str | None = None,
    faction_specs: Iterable[FactionPageSpec] = FACTION_PAGE_SPECS,
    strict: bool = False,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    timestamp = fetched_at or current_timestamp()
    faction_specs = list(faction_specs)
    warnings: list[str] = []
    dataset: "OrderedDict[str, Any]" = OrderedDict()
    dataset["__schema_version"] = SCHEMA_VERSION
    dataset["__generated_at"] = timestamp
    dataset["__source_provenance"] = SOURCE_PROVENANCE
    dataset["__enumeration_strategy"] = "faction-overview-gallery-sections"
    dataset["__anatomy_extraction"] = "parse-api-wikitext-anatomy-templates"

    enumerated_unit_count = 0
    scraped_unit_count = 0
    missing_anatomy_unit_count = 0

    for faction_spec in faction_specs:
        faction_html = fetch_faction_html(faction_spec.page_title)
        page_entries = enumerate_enemy_pages_from_faction_html(faction_html, faction_spec)
        if not page_entries:
            make_warning(
                f"No enemy pages were enumerated from '{faction_spec.page_title}' using '{faction_spec.list_heading}'.",
                warnings,
                strict=strict,
            )

        units: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
        dataset[faction_spec.faction] = units

        seen_titles: set[str] = set()
        for page_entry in page_entries:
            page_title = page_entry["page_title"]
            if page_title in seen_titles:
                make_warning(
                    f"Duplicate enumerated unit '{faction_spec.faction}/{page_title}' was skipped.",
                    warnings,
                    strict=strict,
                )
                continue
            seen_titles.add(page_title)
            enumerated_unit_count += 1

            error = None
            try:
                wikitext = fetch_unit_wikitext(page_title)
                page_metadata = extract_infobox_enemy_metadata(wikitext)
                anatomy_payload = extract_anatomy_payload_from_wikitext(wikitext)
                if anatomy_payload["status"] == "ok":
                    scraped_unit_count += 1
                else:
                    missing_anatomy_unit_count += 1
                    make_warning(
                        f"Could not extract anatomy rows for '{faction_spec.faction}/{page_title}' "
                        f"({anatomy_payload['status']}).",
                        warnings,
                        strict=strict,
                    )
            except Exception as exc:  # pragma: no cover - exercised by live runs, not unit fixtures
                page_metadata = {}
                anatomy_payload = {
                    "status": "fetch-error",
                    "selected_state": None,
                    "states": OrderedDict(),
                    "health": None,
                    "damageable_zones": [],
                }
                missing_anatomy_unit_count += 1
                error = str(exc)
                make_warning(
                    f"Failed to fetch or parse '{faction_spec.faction}/{page_title}': {exc}",
                    warnings,
                    strict=strict,
                )

            units[page_title] = build_unit_entry(
                page_entry,
                anatomy_payload,
                fetched_at=timestamp,
                unit_health=page_metadata.get("health"),
                error=error,
            )

    dataset["__unit_count"] = enumerated_unit_count
    dataset["__scraped_unit_count"] = scraped_unit_count
    dataset["__missing_anatomy_unit_count"] = missing_anatomy_unit_count
    dataset["__warning_count"] = len(warnings)
    if warnings:
        dataset["__warnings"] = list(warnings)

    summary = {
        "faction_count": len(faction_specs),
        "enumerated_unit_count": enumerated_unit_count,
        "scraped_unit_count": scraped_unit_count,
        "missing_anatomy_unit_count": missing_anatomy_unit_count,
        "warning_count": len(warnings),
    }
    return dataset, summary, warnings


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enumerate wiki.gg Helldivers 2 enemy pages and extract anatomy sidecar data.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Path to write the sidecar JSON output.",
    )
    parser.add_argument(
        "--faction",
        action="append",
        choices=[spec.faction for spec in FACTION_PAGE_SPECS],
        help="Optional faction filter. May be supplied multiple times.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="HTTP timeout in seconds per request.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit on enumeration or anatomy warnings instead of continuing.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output.strip())
    selected_factions = set(args.faction or [])
    selected_specs = [
        spec for spec in FACTION_PAGE_SPECS if not selected_factions or spec.faction in selected_factions
    ]

    if not selected_specs:
        raise SystemExit("No faction pages selected.")

    def fetch_faction_html(page_title: str) -> str:
        return fetch_parse_prop(page_title, "text", timeout=args.timeout)

    def fetch_unit_wikitext(page_title: str) -> str:
        return fetch_parse_prop(page_title, "wikitext", timeout=args.timeout)

    dataset, summary, _warnings = build_wikigg_enemy_sidecar(
        fetch_faction_html,
        fetch_unit_wikitext,
        faction_specs=selected_specs,
        strict=args.strict,
    )

    ensure_parent_dir(output_path)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(dataset, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(
        "Summary:",
        f"factions={summary['faction_count']}",
        f"enumerated={summary['enumerated_unit_count']}",
        f"scraped={summary['scraped_unit_count']}",
        f"missing={summary['missing_anatomy_unit_count']}",
        f"warnings={summary['warning_count']}",
    )
    print(f"Wrote sidecar to {output_path}")


if __name__ == "__main__":
    main()
