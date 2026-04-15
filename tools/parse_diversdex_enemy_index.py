#!/usr/bin/env python3
"""
Transform DiversDex enemy index CSV exports into structured JSON closer to Supercalc's
enemydata format.

The source sheets are still presentation-oriented and include grouped unit names,
decorative spacing, inline child profiles, and format differences between factions.
This script normalizes those exports into nested JSON with:

- faction -> unit maps
- normalized damageable_zones
- normalized status_effects
- optional default_stats / descriptions / notes
- nested child_profiles for sub-entities such as backpacks, shields, pilots, and
  mounted weapons

By default the script reads the CSV exports from enemies\\ and writes
enemies\\diversdex-enemydata.json.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_DIR = REPO_ROOT / "enemies"
DEFAULT_OUTPUT_PATH = DEFAULT_INPUT_DIR / "diversdex-enemydata.json"
SOURCE_PROVENANCE = "diversdex-sheet"

TITLECASE_ACRONYMS = {
    "AA",
    "AP",
    "EMS",
    "HMG",
    "LMG",
    "MG",
    "N.O.K.I.A",
    "VOX",
}
IGNORED_HEADER_TEXTS = {
    "CORE",
    "Glossary ! READ ME FIRST !",
}
PROFILE_NAME_GROUP_OVERRIDES = {
    "JET BRIGADE ASSAULT RAIDER / COMMISSAR / MG RAIDER / TROOPER": [
        "Jet Brigade Assault Raider",
        "Jet Brigade Commissar",
        "Jet Brigade MG Raider",
        "Jet Brigade Trooper",
    ],
}

AUTOMATON_TERMINID_ZONE_COLUMNS = {
    3: "source_zone_name",
    5: "health",
    6: "constitution",
    8: "durable",
    9: "armor",
    10: "on_death",
    11: "to_main",
    12: "main_cap",
    13: "explosive_target",
    14: "explosive_multiplier",
    15: "explosive_verification",
}
AUTOMATON_TERMINID_STATUS_COLUMNS = {
    3: "label",
    4: "minimum",
    5: "maximum",
    6: "damage_multiplier",
    8: "react_event",
    9: "threshold",
    10: "interrupts",
    11: "staggers",
    12: "duration",
}
ILLUMINATE_DEFAULT_COLUMNS = {
    6: "label",
    8: "value",
    10: "react_event",
    11: "threshold",
    12: "interrupts",
    13: "staggers",
    14: "duration",
}
ILLUMINATE_ZONE_COLUMNS = {
    1: "zone_id",
    2: "source_zone_name",
    3: "health",
    4: "constitution",
    6: "durable",
    7: "armor",
    8: "on_death",
    10: "to_main",
    11: "main_cap",
    12: "explosive_target",
    13: "explosive_multiplier",
    14: "explosive_verification",
}
ILLUMINATE_STATUS_COLUMNS = {
    1: "label",
    2: "minimum",
    3: "maximum",
    4: "damage_multiplier",
    6: "ability",
    7: "damage",
    8: "ap",
    10: "stagger",
    11: "push",
    12: "special",
}


@dataclass
class SheetConfig:
    faction: str
    parent_indent: int
    child_indent: Optional[int]
    supports_description: bool
    default_columns: Dict[int, str]
    zone_columns: Dict[int, str]
    status_columns: Dict[int, str]
    titlecase_headers: bool


@dataclass
class ProfileBlock:
    block_id: int
    source_file: str
    faction: str
    line_number: int
    header_indent: int
    header_text: str
    description: str = ""
    parent_block_id: Optional[int] = None
    notes: list[str] = field(default_factory=list)
    default_stats: "OrderedDict[str, Dict[str, Any]]" = field(default_factory=OrderedDict)
    damageable_zones: list[Dict[str, Any]] = field(default_factory=list)
    status_effects: "OrderedDict[str, Dict[str, Any]]" = field(default_factory=OrderedDict)


def collapse_whitespace(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def iter_nonempty_cells(row: list[str]) -> list[tuple[int, str]]:
    nonempty: list[tuple[int, str]] = []
    for index, cell in enumerate(row):
        text = collapse_whitespace(cell)
        if text:
            nonempty.append((index, text))
    return nonempty


def get_sheet_config(path: Path) -> SheetConfig:
    lowered_name = path.name.lower()
    if "automatons" in lowered_name:
        return SheetConfig(
            faction="Automaton",
            parent_indent=1,
            child_indent=3,
            supports_description=False,
            default_columns={},
            zone_columns=AUTOMATON_TERMINID_ZONE_COLUMNS,
            status_columns=AUTOMATON_TERMINID_STATUS_COLUMNS,
            titlecase_headers=True,
        )
    if "terminids" in lowered_name:
        return SheetConfig(
            faction="Terminid",
            parent_indent=1,
            child_indent=3,
            supports_description=False,
            default_columns={},
            zone_columns=AUTOMATON_TERMINID_ZONE_COLUMNS,
            status_columns=AUTOMATON_TERMINID_STATUS_COLUMNS,
            titlecase_headers=True,
        )
    if "illuminate" in lowered_name:
        return SheetConfig(
            faction="Illuminate",
            parent_indent=1,
            child_indent=None,
            supports_description=True,
            default_columns=ILLUMINATE_DEFAULT_COLUMNS,
            zone_columns=ILLUMINATE_ZONE_COLUMNS,
            status_columns=ILLUMINATE_STATUS_COLUMNS,
            titlecase_headers=False,
        )
    raise ValueError(f"Unrecognized DiversDex sheet filename: {path}")


def is_intro_or_navigation_row(nonempty_cells: list[tuple[int, str]]) -> bool:
    texts = [text for _, text in nonempty_cells]
    lowered_texts = [text.lower() for text in texts]
    joined = " ".join(lowered_texts)
    if "tribute to the currently deprecated" in joined or "current version" in joined:
        return True
    if any("▶" in text for text in texts):
        return True
    if all(
        text in {"index", "terminids stats", "automatons stats", "super earth stats"}
        for text in lowered_texts
    ):
        return True
    return any(text in IGNORED_HEADER_TEXTS for text in texts)


def is_note_row(nonempty_cells: list[tuple[int, str]]) -> bool:
    return bool(nonempty_cells) and nonempty_cells[0][1].startswith("*")


def is_zone_header(nonempty_cells: list[tuple[int, str]]) -> bool:
    if not nonempty_cells:
        return False
    first = nonempty_cells[0][1].lower()
    return first in {"zone", "id"} and any(text.lower() == "health" for _, text in nonempty_cells)


def is_status_header(nonempty_cells: list[tuple[int, str]]) -> bool:
    return bool(nonempty_cells) and nonempty_cells[0][1].lower() == "status"


def is_default_header(nonempty_cells: list[tuple[int, str]]) -> bool:
    return any(text.lower() == "default stats" for _, text in nonempty_cells)


def looks_like_profile_header(
    nonempty_cells: list[tuple[int, str]],
    config: SheetConfig,
) -> bool:
    if not nonempty_cells:
        return False
    if is_intro_or_navigation_row(nonempty_cells) or is_note_row(nonempty_cells):
        return False
    if is_zone_header(nonempty_cells) or is_status_header(nonempty_cells) or is_default_header(nonempty_cells):
        return False

    first_index, first_text = nonempty_cells[0]
    if first_index not in {config.parent_indent, config.child_indent}:
        return False
    if first_text in IGNORED_HEADER_TEXTS:
        return False
    if config.supports_description:
        if first_index != config.parent_indent or len(nonempty_cells) > 2:
            return False
        return not first_text[:1].isdigit()
    return len(nonempty_cells) == 1


def parse_boolean_flag(value: str) -> Any:
    text = collapse_whitespace(value)
    if not text or text == "-":
        return None
    lowered = text.lower()
    if lowered == "yes":
        return True
    if lowered == "no":
        return False
    return text


def parse_numeric_value(value: str) -> Any:
    text = collapse_whitespace(value)
    if not text or text == "-":
        return None
    normalized = text.replace(",", ".")
    if re.fullmatch(r"-?\d+(?:\.\d+)?", normalized):
        numeric = float(normalized)
        if numeric.is_integer():
            return int(numeric)
        return numeric
    return text


def parse_percent_value(value: str) -> Any:
    text = collapse_whitespace(value)
    if not text or text == "-":
        return None
    if text.endswith("%"):
        numeric = parse_numeric_value(text[:-1])
        if isinstance(numeric, (int, float)):
            return numeric / 100
    return parse_numeric_value(text)


def parse_constitution_value(value: str) -> tuple[Any, Any]:
    text = collapse_whitespace(value)
    if not text or text == "-":
        return None, None
    match = re.fullmatch(
        r"(-?\d+(?:[.,]\d+)?)\s*\[\s*(-?\d+(?:[.,]\d+)?)\s*/\s*s\s*\]",
        text,
    )
    if match:
        base = parse_numeric_value(match.group(1))
        rate = parse_numeric_value(match.group(2))
        return base, rate
    return parse_numeric_value(text), None


def normalize_key(text: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", collapse_whitespace(text).lower()).strip("_")
    return normalized or "unknown"


def normalize_status_key(label: str) -> str:
    return normalize_key(label)


def normalize_zone_name(label: str) -> tuple[str, Optional[int], str]:
    source_label = collapse_whitespace(label)
    zone_count = None
    match = re.search(r"\((\d+)\)\s*$", source_label)
    base_label = source_label
    if match:
        zone_count = int(match.group(1))
        base_label = source_label[:match.start()].strip()
    normalized = normalize_key(base_label)
    if normalized == "main":
        return "Main", zone_count, source_label
    return normalized, zone_count, source_label


def normalize_titlecase_word(word: str) -> str:
    stripped = word.strip('"')
    upper = stripped.upper()
    if upper in TITLECASE_ACRONYMS or "." in stripped:
        return upper
    if "-" in stripped:
        return "-".join(normalize_titlecase_word(part) for part in stripped.split("-"))
    if stripped.isupper():
        return stripped.capitalize()
    return stripped[:1].upper() + stripped[1:]


def normalize_profile_name(text: str, *, titlecase_headers: bool) -> str:
    collapsed = collapse_whitespace(text).replace('"', "")
    collapsed = re.sub(r"\s*\(TIER [^)]+\)", "", collapsed, flags=re.IGNORECASE)
    collapsed = collapse_whitespace(collapsed)
    if not titlecase_headers:
        return collapsed
    return " ".join(normalize_titlecase_word(part) for part in collapsed.split())


def split_profile_names(text: str, *, titlecase_headers: bool) -> list[str]:
    normalized_source = collapse_whitespace(text).replace('"', "")
    override_names = PROFILE_NAME_GROUP_OVERRIDES.get(normalized_source)
    if override_names:
        return list(override_names)

    names: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"\s*/\s*", collapse_whitespace(text)):
        normalized = normalize_profile_name(part, titlecase_headers=titlecase_headers)
        if normalized and normalized not in seen:
            names.append(normalized)
            seen.add(normalized)
    return names


def extract_row_data(row: list[str], column_map: Dict[int, str]) -> Dict[str, str]:
    data: Dict[str, str] = {}
    for index, key in column_map.items():
        if index < len(row):
            data[key] = collapse_whitespace(row[index])
        else:
            data[key] = ""
    return data


def extract_extra_notes(nonempty_cells: list[tuple[int, str]], column_map: Dict[int, str]) -> list[str]:
    known_indices = set(column_map)
    return [
        text
        for index, text in nonempty_cells
        if index not in known_indices and text
    ]


def build_zone_record(row_data: Dict[str, str]) -> Optional[Dict[str, Any]]:
    source_zone_name = collapse_whitespace(row_data.get("source_zone_name"))
    if not source_zone_name:
        return None

    zone_name, zone_count, source_zone_name = normalize_zone_name(source_zone_name)
    record: "OrderedDict[str, Any]" = OrderedDict()
    record["zone_name"] = zone_name
    record["source_zone_name"] = source_zone_name
    if zone_count is not None:
        record["source_zone_count"] = zone_count

    zone_id = parse_numeric_value(row_data.get("zone_id", ""))
    if zone_id is not None:
        record["zone_id"] = zone_id

    health = parse_numeric_value(row_data.get("health", ""))
    if health is not None:
        record["health"] = health

    constitution, constitution_rate = parse_constitution_value(row_data.get("constitution", ""))
    if constitution is not None:
        record["Con"] = constitution
    if constitution_rate is not None:
        record["ConRate"] = constitution_rate

    durable = parse_percent_value(row_data.get("durable", ""))
    if durable is not None:
        record["Dur%"] = durable

    armor = parse_numeric_value(row_data.get("armor", ""))
    if armor is not None:
        record["AV"] = armor

    on_death = collapse_whitespace(row_data.get("on_death"))
    if on_death and on_death != "-":
        record["on_death"] = on_death
        if on_death.lower() == "fatal":
            record["IsFatal"] = True

    to_main = parse_percent_value(row_data.get("to_main", ""))
    if to_main is not None:
        record["ToMain%"] = to_main

    main_cap = parse_boolean_flag(row_data.get("main_cap", ""))
    if main_cap is not None:
        record["MainCap"] = main_cap

    explosive_target = collapse_whitespace(row_data.get("explosive_target"))
    if explosive_target and explosive_target != "-":
        record["ExTarget"] = explosive_target

    explosive_multiplier = parse_percent_value(row_data.get("explosive_multiplier", ""))
    if explosive_multiplier is not None:
        record["ExMult"] = explosive_multiplier

    explosive_verification = collapse_whitespace(row_data.get("explosive_verification"))
    if explosive_verification and explosive_verification != "-":
        record["ExVerif"] = explosive_verification

    return record


def build_status_record(row_data: Dict[str, str]) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    label = collapse_whitespace(row_data.get("label"))
    if not label:
        return None, None

    key = normalize_status_key(label)
    record: "OrderedDict[str, Any]" = OrderedDict()
    record["label"] = label

    for field_name in (
        "minimum",
        "maximum",
        "damage_multiplier",
        "react_event",
        "threshold",
        "interrupts",
        "staggers",
        "duration",
        "ability",
        "damage",
        "ap",
        "stagger",
        "push",
        "special",
    ):
        raw_value = row_data.get(field_name, "")
        if field_name == "damage_multiplier":
            value = parse_percent_value(raw_value)
        elif field_name in {"minimum", "maximum", "threshold", "duration", "stagger", "push"}:
            value = parse_numeric_value(raw_value)
        elif field_name in {"interrupts", "staggers"}:
            value = parse_boolean_flag(raw_value)
        else:
            value = collapse_whitespace(raw_value) or None
            if value == "-":
                value = None
        if value is not None:
            record[field_name] = value

    return key, record


def build_default_stat_record(row_data: Dict[str, str]) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    label = collapse_whitespace(row_data.get("label"))
    if not label:
        return None, None

    key = normalize_key(label)
    record: "OrderedDict[str, Any]" = OrderedDict()
    record["label"] = label

    value = parse_numeric_value(row_data.get("value", ""))
    if value is not None:
        record["value"] = value

    react_event = collapse_whitespace(row_data.get("react_event"))
    if react_event and react_event != "-":
        record["react_event"] = react_event

    threshold = parse_numeric_value(row_data.get("threshold", ""))
    if threshold is not None:
        record["threshold"] = threshold

    interrupts = parse_boolean_flag(row_data.get("interrupts", ""))
    if interrupts is not None:
        record["interrupts"] = interrupts

    staggers = parse_boolean_flag(row_data.get("staggers", ""))
    if staggers is not None:
        record["staggers"] = staggers

    duration = parse_numeric_value(row_data.get("duration", ""))
    if duration is not None:
        record["duration"] = duration

    return key, record


def dedupe_preserve_order(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = collapse_whitespace(value)
        if not text or text in seen:
            continue
        result.append(text)
        seen.add(text)
    return result


def get_main_health(zones: list[Dict[str, Any]]) -> Any:
    for zone in zones:
        if zone.get("zone_name") == "Main" and "health" in zone:
            return zone["health"]
    for zone in zones:
        if "health" in zone:
            return zone["health"]
    return None


def build_profile_entry(
    block: ProfileBlock,
    *,
    shared_profile_names: list[str],
    child_blocks: list[ProfileBlock],
) -> Dict[str, Any]:
    entry: "OrderedDict[str, Any]" = OrderedDict()
    health = get_main_health(block.damageable_zones)
    if health is not None:
        entry["health"] = health
    if block.description:
        entry["description"] = block.description
    if block.default_stats:
        entry["default_stats"] = block.default_stats
    if block.damageable_zones:
        entry["damageable_zones"] = block.damageable_zones
    if block.status_effects:
        entry["status_effects"] = block.status_effects
    notes = dedupe_preserve_order(block.notes)
    if notes:
        entry["notes"] = notes
    if len(shared_profile_names) > 1:
        entry["shared_profile_names"] = shared_profile_names

    child_profiles: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()
    for child_block in child_blocks:
        child_names = split_profile_names(
            child_block.header_text,
            titlecase_headers=True,
        )
        child_key = child_names[0] if child_names else normalize_profile_name(
            child_block.header_text,
            titlecase_headers=True,
        )
        child_profiles[child_key] = build_profile_entry(
            child_block,
            shared_profile_names=child_names or [child_key],
            child_blocks=[],
        )
    if child_profiles:
        entry["child_profiles"] = child_profiles

    entry["source_profile_name"] = block.header_text
    entry["source_csv"] = block.source_file
    entry["source_line"] = block.line_number
    entry["source_provenance"] = SOURCE_PROVENANCE
    return entry


def parse_sheet(path: Path) -> tuple[SheetConfig, list[ProfileBlock]]:
    config = get_sheet_config(path)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    blocks: list[ProfileBlock] = []
    current_block: Optional[ProfileBlock] = None
    current_parent_block_id: Optional[int] = None
    current_section: Optional[str] = None
    next_block_id = 1

    for line_number, row in enumerate(rows, start=1):
        nonempty_cells = iter_nonempty_cells(row)
        if not nonempty_cells or is_intro_or_navigation_row(nonempty_cells):
            continue

        if is_note_row(nonempty_cells):
            if current_block is not None:
                current_block.notes.extend(dedupe_preserve_order(text for _, text in nonempty_cells))
            continue

        if looks_like_profile_header(nonempty_cells, config):
            if current_block is not None:
                blocks.append(current_block)

            header_indent, header_text = nonempty_cells[0]
            header_text = collapse_whitespace(header_text).replace('"', "")
            description = ""
            if config.supports_description and len(nonempty_cells) > 1:
                description = nonempty_cells[1][1]

            parent_block_id = None
            if header_indent == config.parent_indent:
                current_parent_block_id = next_block_id
            elif config.child_indent is not None and header_indent == config.child_indent:
                parent_block_id = current_parent_block_id

            current_block = ProfileBlock(
                block_id=next_block_id,
                source_file=path.name,
                faction=config.faction,
                line_number=line_number,
                header_indent=header_indent,
                header_text=header_text,
                description=description,
                parent_block_id=parent_block_id,
            )
            next_block_id += 1
            current_section = None
            continue

        if current_block is None:
            continue

        if is_default_header(nonempty_cells):
            current_section = "default"
            current_block.notes.extend(extract_extra_notes(nonempty_cells, config.default_columns))
            continue
        if is_zone_header(nonempty_cells):
            current_section = "zones"
            current_block.notes.extend(extract_extra_notes(nonempty_cells, config.zone_columns))
            continue
        if is_status_header(nonempty_cells):
            current_section = "statuses"
            current_block.notes.extend(extract_extra_notes(nonempty_cells, config.status_columns))
            continue

        if current_section == "default":
            key, record = build_default_stat_record(extract_row_data(row, config.default_columns))
            if key and record:
                current_block.default_stats[key] = record
            continue

        if current_section == "zones":
            zone_record = build_zone_record(extract_row_data(row, config.zone_columns))
            if zone_record:
                current_block.damageable_zones.append(zone_record)
            continue

        if current_section == "statuses":
            key, record = build_status_record(extract_row_data(row, config.status_columns))
            if key and record:
                current_block.status_effects[key] = record

    if current_block is not None:
        blocks.append(current_block)

    return config, blocks


def parse_diversdex_enemy_index(input_paths: list[Path]) -> Dict[str, Any]:
    parsed: "OrderedDict[str, OrderedDict[str, Dict[str, Any]]]" = OrderedDict(
        (faction, OrderedDict())
        for faction in ("Automaton", "Terminid", "Illuminate")
    )

    for input_path in input_paths:
        config, blocks = parse_sheet(input_path)
        child_blocks_by_parent_id: dict[int, list[ProfileBlock]] = {}
        top_level_blocks: list[ProfileBlock] = []
        for block in blocks:
            if block.parent_block_id is None:
                top_level_blocks.append(block)
                continue
            child_blocks_by_parent_id.setdefault(block.parent_block_id, []).append(block)

        for block in top_level_blocks:
            shared_profile_names = split_profile_names(
                block.header_text,
                titlecase_headers=config.titlecase_headers,
            )
            child_blocks = child_blocks_by_parent_id.get(block.block_id, [])
            for unit_name in shared_profile_names:
                parsed[config.faction][unit_name] = build_profile_entry(
                    block,
                    shared_profile_names=shared_profile_names,
                    child_blocks=child_blocks,
                )

    return parsed


def resolve_input_paths(explicit_inputs: Optional[list[str]]) -> list[Path]:
    if explicit_inputs:
        input_paths = [Path(path).resolve() for path in explicit_inputs]
    else:
        input_paths = sorted(
            path
            for path in DEFAULT_INPUT_DIR.iterdir()
            if path.is_file()
            and path.suffix.lower() == ".csv"
            and path.name.startswith("ONGOING UPDATE - Helldivers II Enemies Index [UNOFFICIAL] - ")
        )
    if not input_paths:
        raise FileNotFoundError(
            "No DiversDex CSV inputs found. Pass --input or place the CSV exports in "
            f"{DEFAULT_INPUT_DIR}."
        )
    missing = [path for path in input_paths if not path.exists()]
    if missing:
        missing_text = ", ".join(str(path) for path in missing)
        raise FileNotFoundError(f"Missing input CSV files: {missing_text}")
    return input_paths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Normalize DiversDex enemy index CSV exports into structured JSON."
    )
    parser.add_argument(
        "--input",
        nargs="+",
        help="One or more CSV input paths. Defaults to the downloaded DiversDex exports in enemies\\.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"Output JSON path. Default: {DEFAULT_OUTPUT_PATH}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_paths = resolve_input_paths(args.input)
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    parsed = parse_diversdex_enemy_index(input_paths)
    output_path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    faction_counts = {
        faction: len(units)
        for faction, units in parsed.items()
        if units
    }
    total_units = sum(faction_counts.values())
    print(
        f"Wrote {output_path} with {total_units} unit entries across "
        f"{len(faction_counts)} factions."
    )
    for faction, count in faction_counts.items():
        print(f"- {faction}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
