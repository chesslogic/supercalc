#!/usr/bin/env python3
"""
Fetch and normalize wiki.gg stratagem attack data for comparison against weapons\weapondata.csv.

Prototype scope:
- Reads the stratagems attack module plus optional companion weapons/status modules.
- Resolves nested weapon -> attack -> damage chains into CSV-like attack records.
- Captures provenance for each normalized record.
- Summarizes wiki coverage versus current Type=Stratagem rows in weapondata.csv.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.request import Request, urlopen


DEFAULT_STRATAGEMS_URL = (
    "https://helldivers.wiki.gg/wiki/"
    "Module:Decodedata-Attacks/stratagems%20data.json?action=raw"
)
DEFAULT_WEAPONS_URL = (
    "https://helldivers.wiki.gg/wiki/"
    "Module:Decodedata-Attacks/weapons%20data.json?action=raw"
)
DEFAULT_STATUS_URL = (
    "https://helldivers.wiki.gg/wiki/"
    "Module:Decodedata-Attacks/status%20data.json?action=raw"
)
DEFAULT_CSV_PATH = Path(r"weapons\weapondata.csv")
DEFAULT_OUTPUT_PATH = Path(r"tools\issues\wikigg-stratagem-attacks.json")
REQUEST_HEADERS = {
    "User-Agent": "supercalc-wikigg-attack-ingest/1.0",
    "Accept": "application/json,text/plain,*/*",
}
ATTACK_SECTIONS = {"projectile", "explosion", "beam", "arc", "spray"}


@dataclass(frozen=True)
class LoadedModule:
    label: str
    origin: str
    locator: str
    data: dict[str, Any]


@dataclass(frozen=True)
class CsvRow:
    line_number: int
    row: dict[str, str]
    code_key: str
    name_key: str
    attack_type_key: str
    attack_name_key: str


class ModuleRegistry:
    def __init__(self, modules: list[LoadedModule]) -> None:
        self.modules = modules
        self.by_label = {module.label: module for module in modules}

    def lookup(
        self,
        section: str,
        name: str | None,
        preferred_labels: Iterable[str] | None = None,
    ) -> tuple[LoadedModule, dict[str, Any]] | None:
        if not name:
            return None

        ordered: list[LoadedModule] = []
        seen: set[str] = set()

        for label in preferred_labels or []:
            module = self.by_label.get(label)
            if module is not None and module.label not in seen:
                ordered.append(module)
                seen.add(module.label)

        for module in self.modules:
            if module.label not in seen:
                ordered.append(module)
                seen.add(module.label)

        for module in ordered:
            section_map = module.data.get(section)
            if not isinstance(section_map, dict):
                continue
            value = section_map.get(name)
            if isinstance(value, dict):
                return module, value

        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch and normalize wiki.gg stratagem attack data into a JSON report "
            "that can be compared against weapons\\weapondata.csv."
        )
    )
    parser.add_argument(
        "--csv",
        default=str(DEFAULT_CSV_PATH),
        help="Path to the local weapondata.csv file (comparison scope is Type=Stratagem).",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Path to write the normalized JSON report.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help=(
            "Disable default live companion fetches. Only explicitly provided JSON paths/URLs "
            "will be loaded."
        ),
    )

    stratagems_group = parser.add_mutually_exclusive_group()
    stratagems_group.add_argument(
        "--stratagems-json",
        help="Local raw JSON export for Module:Decodedata-Attacks/stratagems data.json.",
    )
    stratagems_group.add_argument(
        "--stratagems-url",
        help="Override URL for Module:Decodedata-Attacks/stratagems data.json.",
    )

    weapons_group = parser.add_mutually_exclusive_group()
    weapons_group.add_argument(
        "--weapons-json",
        help="Optional local raw JSON export for Module:Decodedata-Attacks/weapons data.json.",
    )
    weapons_group.add_argument(
        "--weapons-url",
        help="Override URL for Module:Decodedata-Attacks/weapons data.json.",
    )

    status_group = parser.add_mutually_exclusive_group()
    status_group.add_argument(
        "--status-json",
        help="Optional local raw JSON export for Module:Decodedata-Attacks/status data.json.",
    )
    status_group.add_argument(
        "--status-url",
        help="Override URL for Module:Decodedata-Attacks/status data.json.",
    )

    args = parser.parse_args()
    if args.offline and not args.stratagems_json and not args.stratagems_url:
        parser.error("--offline requires --stratagems-json or --stratagems-url.")
    return args


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_json_with_bom(path: Path) -> Any:
    raw = path.read_bytes()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-8")
    return json.loads(text)


def load_json_from_url(url: str) -> Any:
    request = Request(url, headers=REQUEST_HEADERS)
    with urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def load_module(
    *,
    label: str,
    json_path: str | None,
    url: str | None,
    default_url: str | None,
    offline: bool,
) -> LoadedModule | None:
    if json_path:
        path = Path(json_path).resolve()
        data = load_json_with_bom(path)
        locator = str(path)
        origin = "file"
    elif url:
        data = load_json_from_url(url)
        locator = url
        origin = "url"
    elif not offline and default_url:
        data = load_json_from_url(default_url)
        locator = default_url
        origin = "url"
    else:
        return None

    if not isinstance(data, dict):
        raise SystemExit(f"Loaded {label} module is not a JSON object: {locator}")

    return LoadedModule(label=label, origin=origin, locator=locator, data=data)


def unique_list(values: Iterable[Any]) -> list[Any]:
    seen: set[str] = set()
    result: list[Any] = []
    for value in values:
        marker = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def normalize_number(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None

    if not math.isfinite(number):
        return None
    if number.is_integer():
        return int(number)
    return number


def compact_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = (
        text.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    return re.sub(r"[^a-z0-9]+", "", text)


def normalize_code_key(value: Any) -> str:
    text = str(value or "").strip()
    if not text or text == "-":
        return ""
    return compact_text(text)


def normalize_name_key(value: Any) -> str:
    return compact_text(value)


def normalize_attack_name_key(value: Any) -> str:
    text = re.sub(r"guard\s*dog", "", str(value or ""), flags=re.IGNORECASE)
    key = compact_text(text)
    return re.sub(r"x\d+$", "", key)


def build_path_frame(
    module_label: str,
    section: str,
    name: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    frame = {
        "module": module_label,
        "section": section,
        "name": name,
    }
    if extra:
        for key, value in extra.items():
            if value not in (None, "", [], {}):
                frame[key] = value
    return frame


def should_include_stratagem(entity_name: str, entity_obj: dict[str, Any]) -> bool:
    del entity_name
    tags = {
        str(tag or "").strip().upper()
        for tag in (entity_obj.get("tags") or [])
        if str(tag or "").strip()
    }
    return "SUPPORT WEAPON" not in tags


def extract_status_pairs(damage_obj: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(damage_obj, dict):
        return []

    pairs: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index in range(1, 9):
        name = str(damage_obj.get(f"Status_Name_{index}") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        pairs.append(
            {
                "name": name,
                "value": normalize_number(damage_obj.get(f"Status_Value_{index}")),
            }
        )

    for raw_name in damage_obj.get("statuses") or []:
        name = str(raw_name or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        pairs.append({"name": name, "value": None})

    return pairs


def build_damage_summary(damage_obj: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(damage_obj, dict):
        return None

    ap = {
        "ap1": normalize_number(damage_obj.get("ap1")) or 0,
        "ap2": normalize_number(damage_obj.get("ap2")) or 0,
        "ap3": normalize_number(damage_obj.get("ap3")) or 0,
        "ap4": normalize_number(damage_obj.get("ap4")) or 0,
    }
    status_pairs = extract_status_pairs(damage_obj)

    return {
        "damage": normalize_number(damage_obj.get("dmg")),
        "durable_damage": normalize_number(damage_obj.get("dmg2")),
        "hits_per_second": normalize_number(damage_obj.get("hits_per_second")),
        "armor_penetration": {
            **ap,
            "max": max(ap.values()) if ap else None,
        },
        "demolition": normalize_number(damage_obj.get("demo")),
        "stagger": normalize_number(damage_obj.get("stun")),
        "push": normalize_number(damage_obj.get("push")),
        "element": str(damage_obj.get("element_name") or "").strip() or None,
        "element_sub": str(damage_obj.get("element_name_sub") or "").strip() or None,
        "statuses": status_pairs,
    }


def resolve_status_details(
    status_names: list[str],
    registry: ModuleRegistry,
) -> list[dict[str, Any]]:
    details: list[dict[str, Any]] = []
    for status_name in status_names:
        entry: dict[str, Any] = {"key": status_name}
        status_match = registry.lookup("status", status_name, preferred_labels=["status"])
        if status_match is not None:
            status_module, status_obj = status_match
            entry.update(
                {
                    "module": status_module.label,
                    "name": str(status_obj.get("name") or status_name),
                    "strength": normalize_number(status_obj.get("strength")),
                    "duration": normalize_number(status_obj.get("duration")),
                    "damage_ignore_armor": normalize_number(
                        status_obj.get("damage_ignore_armor")
                    ),
                }
            )
            damage_id = str(status_obj.get("damage_id") or "").strip()
            if damage_id:
                entry["damage_id"] = damage_id
                damage_match = registry.lookup(
                    "damage",
                    damage_id,
                    preferred_labels=[status_module.label, "status"],
                )
                if damage_match is not None:
                    _damage_module, damage_obj = damage_match
                    entry["damage"] = build_damage_summary(damage_obj)
        details.append(entry)
    return details


def build_attack_model(attack_obj: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in attack_obj.items()
        if key not in {"damage_id", "id", "name"}
    }


def load_csv_rows(csv_path: Path) -> list[CsvRow]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows: list[CsvRow] = []
        for line_number, row in enumerate(reader, start=2):
            if str(row.get("Type") or "").strip() != "Stratagem":
                continue
            rows.append(
                CsvRow(
                    line_number=line_number,
                    row=row,
                    code_key=normalize_code_key(row.get("Code")),
                    name_key=normalize_name_key(row.get("Name")),
                    attack_type_key=str(row.get("Atk Type") or "").strip().lower(),
                    attack_name_key=normalize_attack_name_key(row.get("Atk Name")),
                )
            )
        return rows


def build_csv_indexes(csv_rows: list[CsvRow]) -> dict[str, Any]:
    by_code_attack: dict[tuple[str, str, str], list[CsvRow]] = defaultdict(list)
    by_name_attack: dict[tuple[str, str, str], list[CsvRow]] = defaultdict(list)
    by_code_any: dict[str, list[CsvRow]] = defaultdict(list)
    by_name_any: dict[str, list[CsvRow]] = defaultdict(list)

    for csv_row in csv_rows:
        if csv_row.code_key:
            by_code_attack[
                (
                    csv_row.code_key,
                    csv_row.attack_type_key,
                    csv_row.attack_name_key,
                )
            ].append(csv_row)
            by_code_any[csv_row.code_key].append(csv_row)
        if csv_row.name_key:
            by_name_attack[
                (
                    csv_row.name_key,
                    csv_row.attack_type_key,
                    csv_row.attack_name_key,
                )
            ].append(csv_row)
            by_name_any[csv_row.name_key].append(csv_row)

    return {
        "rows": csv_rows,
        "by_code_attack": by_code_attack,
        "by_name_attack": by_name_attack,
        "by_code_any": by_code_any,
        "by_name_any": by_name_any,
    }


def entity_identity(name: str, entity_id: str | None) -> str:
    return f"{normalize_code_key(entity_id)}|{normalize_name_key(name)}"


def compare_record_to_csv(
    record: dict[str, Any],
    csv_indexes: dict[str, Any],
) -> dict[str, Any]:
    projection = record["csv_projection"]
    code_key = normalize_code_key(projection.get("Code"))
    name_key = normalize_name_key(projection.get("Name"))
    attack_type_key = str(projection.get("Atk Type") or "").strip().lower()
    attack_name_key = normalize_attack_name_key(projection.get("Atk Name"))

    matches: list[CsvRow] = []
    match_kind: str | None = None

    if code_key:
        matches = csv_indexes["by_code_attack"].get(
            (code_key, attack_type_key, attack_name_key),
            [],
        )
        if matches:
            match_kind = "code+attack"

    if not matches and name_key:
        matches = csv_indexes["by_name_attack"].get(
            (name_key, attack_type_key, attack_name_key),
            [],
        )
        if matches:
            match_kind = "name+attack"

    candidate_rows: list[CsvRow] = []
    if code_key:
        candidate_rows.extend(csv_indexes["by_code_any"].get(code_key, []))
    if name_key:
        candidate_rows.extend(csv_indexes["by_name_any"].get(name_key, []))
    candidate_rows = sorted(
        {row.line_number: row for row in candidate_rows}.values(),
        key=lambda row: row.line_number,
    )

    return {
        "matched": bool(matches),
        "match_kind": match_kind,
        "csv_row_numbers": [row.line_number for row in matches],
        "candidate_row_numbers": [row.line_number for row in candidate_rows],
        "comparison_code_key": code_key or None,
        "comparison_name_key": name_key or None,
        "comparison_attack_key": attack_name_key or None,
    }


def attach_csv_comparison(
    records: list[dict[str, Any]],
    csv_indexes: dict[str, Any],
) -> set[int]:
    matched_line_numbers: set[int] = set()
    for record in records:
        comparison = compare_record_to_csv(record, csv_indexes)
        record["comparison"] = comparison
        matched_line_numbers.update(comparison["csv_row_numbers"])
    return matched_line_numbers


def get_primary_code(entity_obj: dict[str, Any], weapon_contexts: list[dict[str, Any]]) -> str | None:
    entity_id = str(entity_obj.get("id") or "").strip()
    if entity_id:
        return entity_id

    for context in reversed(weapon_contexts):
        weapon_id = str(context.get("id") or "").strip()
        if weapon_id:
            return weapon_id

    return None


def build_rpm_sources(
    entity_name: str,
    entity_obj: dict[str, Any],
    weapon_contexts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rpm_sources: list[dict[str, Any]] = []
    entity_rpm = normalize_number(entity_obj.get("rpm"))
    if entity_rpm is not None:
        rpm_sources.append(
            {
                "section": "stratagems",
                "name": entity_name,
                "rpm": entity_rpm,
            }
        )

    for context in weapon_contexts:
        rpm = normalize_number(context.get("rpm"))
        if rpm is None:
            continue
        rpm_sources.append(
            {
                "section": "weapons",
                "name": context["name"],
                "rpm": rpm,
            }
        )

    return unique_list(rpm_sources)


def build_csv_projection(
    *,
    entity_name: str,
    entity_obj: dict[str, Any],
    attack_type: str,
    attack_name: str,
    damage_summary: dict[str, Any] | None,
    projection_code: str | None,
    rpm: int | float | None,
    status_names: list[str],
) -> dict[str, Any]:
    armor_penetration = (
        damage_summary.get("armor_penetration", {}).get("max")
        if isinstance(damage_summary, dict)
        else None
    )
    return {
        "Type": "Stratagem",
        "Code": projection_code or "-",
        "Name": entity_name,
        "RPM": rpm,
        "Atk Type": attack_type,
        "Atk Name": attack_name,
        "DMG": damage_summary.get("damage") if damage_summary else None,
        "DUR": damage_summary.get("durable_damage") if damage_summary else None,
        "AP": armor_penetration,
        "DF": damage_summary.get("demolition") if damage_summary else None,
        "ST": damage_summary.get("stagger") if damage_summary else None,
        "PF": damage_summary.get("push") if damage_summary else None,
        "Status": " • ".join(status_names),
    }


def merge_record(existing: dict[str, Any], incoming: dict[str, Any]) -> None:
    existing["occurrence_count"] += incoming["occurrence_count"]

    existing["entity"]["resolved_ids"] = unique_list(
        [
            *existing["entity"].get("resolved_ids", []),
            *incoming["entity"].get("resolved_ids", []),
        ]
    )

    existing["weapon_context"]["resolved_weapon_names"] = unique_list(
        [
            *existing["weapon_context"].get("resolved_weapon_names", []),
            *incoming["weapon_context"].get("resolved_weapon_names", []),
        ]
    )
    existing["weapon_context"]["resolved_weapon_ids"] = unique_list(
        [
            *existing["weapon_context"].get("resolved_weapon_ids", []),
            *incoming["weapon_context"].get("resolved_weapon_ids", []),
        ]
    )
    existing["weapon_context"]["mount_names"] = unique_list(
        [
            *existing["weapon_context"].get("mount_names", []),
            *incoming["weapon_context"].get("mount_names", []),
        ]
    )
    existing["weapon_context"]["mount_sides"] = unique_list(
        [
            *existing["weapon_context"].get("mount_sides", []),
            *incoming["weapon_context"].get("mount_sides", []),
        ]
    )
    existing["weapon_context"]["rpm_sources"] = unique_list(
        [
            *existing["weapon_context"].get("rpm_sources", []),
            *incoming["weapon_context"].get("rpm_sources", []),
        ]
    )
    if existing["weapon_context"].get("rpm") is None and incoming["weapon_context"].get("rpm") is not None:
        existing["weapon_context"]["rpm"] = incoming["weapon_context"]["rpm"]
    if existing["csv_projection"].get("RPM") is None and incoming["csv_projection"].get("RPM") is not None:
        existing["csv_projection"]["RPM"] = incoming["csv_projection"]["RPM"]

    existing["statuses"]["names"] = unique_list(
        [
            *existing["statuses"].get("names", []),
            *incoming["statuses"].get("names", []),
        ]
    )
    existing["statuses"]["details"] = unique_list(
        [
            *existing["statuses"].get("details", []),
            *incoming["statuses"].get("details", []),
        ]
    )
    existing["csv_projection"]["Status"] = " • ".join(existing["statuses"]["names"])

    existing["provenance"]["paths"] = unique_list(
        [
            *existing["provenance"].get("paths", []),
            *incoming["provenance"].get("paths", []),
        ]
    )
    existing["provenance"]["source_modules"] = unique_list(
        [
            *existing["provenance"].get("source_modules", []),
            *incoming["provenance"].get("source_modules", []),
        ]
    )


def normalize_stratagem_records(
    stratagems_module: LoadedModule,
    modules: list[LoadedModule],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    registry = ModuleRegistry(modules)
    grouped_records: dict[str, dict[str, Any]] = {}
    unresolved: list[dict[str, Any]] = []
    stratagems = stratagems_module.data.get("stratagems")

    if not isinstance(stratagems, dict):
        raise SystemExit("Stratagems module is missing a top-level 'stratagems' object.")

    def add_unresolved(
        *,
        entity_name: str,
        entity_obj: dict[str, Any],
        reason: str,
        ref_type: str | None,
        ref_name: str | None,
        parent: str | None,
        path_frames: list[dict[str, Any]],
        preferred_modules: list[str] | None = None,
    ) -> None:
        unresolved.append(
            {
                "entity_name": entity_name,
                "entity_id": str(entity_obj.get("id") or "").strip() or None,
                "loadout_wep": str(entity_obj.get("loadout_wep") or "").strip() or None,
                "reason": reason,
                "ref_type": ref_type,
                "ref_name": ref_name,
                "parent": parent,
                "preferred_modules": preferred_modules or [],
                "path": path_frames,
            }
        )

    def walk_ref_list(
        *,
        entity_name: str,
        entity_obj: dict[str, Any],
        root_name: str,
        refs: list[dict[str, Any]],
        path_frames: list[dict[str, Any]],
        weapon_contexts: list[dict[str, Any]],
        preferred_label: str,
        active_weapon_names: list[str],
    ) -> None:
        children_by_parent: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            parent = str(ref.get("parent") or root_name)
            children_by_parent[parent].append(ref)

        for parent_name in list(children_by_parent):
            children_by_parent[parent_name].sort(
                key=lambda ref: (
                    normalize_number(ref.get("level")) or 0,
                    str(ref.get("type") or ""),
                    str(ref.get("name") or ""),
                )
            )

        def visit_parent(
            current_parent: str,
            current_path: list[dict[str, Any]],
            current_weapon_contexts: list[dict[str, Any]],
            current_preferred_label: str,
            current_active_weapon_names: list[str],
        ) -> None:
            for ref in children_by_parent.get(current_parent, []):
                ref_type = str(ref.get("type") or "").strip()
                ref_name = str(ref.get("name") or "").strip()
                if not ref_type or not ref_name:
                    add_unresolved(
                        entity_name=entity_name,
                        entity_obj=entity_obj,
                        reason="invalid-ref",
                        ref_type=ref_type or None,
                        ref_name=ref_name or None,
                        parent=current_parent,
                        path_frames=current_path,
                        preferred_modules=[current_preferred_label],
                    )
                    continue

                if ref_type == "status":
                    continue

                if ref_type == "weapons":
                    if ref_name in current_active_weapon_names:
                        add_unresolved(
                            entity_name=entity_name,
                            entity_obj=entity_obj,
                            reason="weapon-cycle",
                            ref_type=ref_type,
                            ref_name=ref_name,
                            parent=current_parent,
                            path_frames=current_path,
                            preferred_modules=[current_preferred_label],
                        )
                        continue

                    weapon_match = registry.lookup(
                        "weapons",
                        ref_name,
                        preferred_labels=[current_preferred_label],
                    )
                    weapon_frame = build_path_frame(
                        module_label=weapon_match[0].label if weapon_match else current_preferred_label,
                        section="weapons",
                        name=ref_name,
                        extra={
                            "level": normalize_number(ref.get("level")),
                            "mount_name": ref.get("mount_name"),
                            "mount_side": ref.get("mount_side"),
                            "synthetic": ref.get("_synthetic"),
                        },
                    )
                    if weapon_match is None:
                        add_unresolved(
                            entity_name=entity_name,
                            entity_obj=entity_obj,
                            reason="missing-weapons-node",
                            ref_type=ref_type,
                            ref_name=ref_name,
                            parent=current_parent,
                            path_frames=[*current_path, weapon_frame],
                            preferred_modules=[current_preferred_label],
                        )
                        continue

                    weapon_module, weapon_obj = weapon_match
                    weapon_context = {
                        "name": ref_name,
                        "module": weapon_module.label,
                        "id": str(weapon_obj.get("id") or "").strip() or None,
                        "rpm": normalize_number(weapon_obj.get("rpm")),
                        "mount_name": str(ref.get("mount_name") or "").strip() or None,
                        "mount_side": str(ref.get("mount_side") or "").strip() or None,
                    }
                    nested_refs = [
                        child
                        for child in weapon_obj.get("attacks") or []
                        if isinstance(child, dict)
                    ]
                    if not nested_refs:
                        add_unresolved(
                            entity_name=entity_name,
                            entity_obj=entity_obj,
                            reason="weapon-without-attacks",
                            ref_type=ref_type,
                            ref_name=ref_name,
                            parent=current_parent,
                            path_frames=[*current_path, weapon_frame],
                            preferred_modules=[weapon_module.label],
                        )
                        continue

                    walk_ref_list(
                        entity_name=entity_name,
                        entity_obj=entity_obj,
                        root_name=ref_name,
                        refs=nested_refs,
                        path_frames=[*current_path, weapon_frame],
                        weapon_contexts=[*current_weapon_contexts, weapon_context],
                        preferred_label=weapon_module.label,
                        active_weapon_names=[*current_active_weapon_names, ref_name],
                    )
                    continue

                if ref_type not in ATTACK_SECTIONS:
                    add_unresolved(
                        entity_name=entity_name,
                        entity_obj=entity_obj,
                        reason="unsupported-ref-type",
                        ref_type=ref_type,
                        ref_name=ref_name,
                        parent=current_parent,
                        path_frames=current_path,
                        preferred_modules=[current_preferred_label],
                    )
                    continue

                attack_match = registry.lookup(
                    ref_type,
                    ref_name,
                    preferred_labels=[current_preferred_label],
                )
                attack_frame = build_path_frame(
                    module_label=attack_match[0].label if attack_match else current_preferred_label,
                    section=ref_type,
                    name=ref_name,
                    extra={"level": normalize_number(ref.get("level"))},
                )
                if attack_match is None:
                    add_unresolved(
                        entity_name=entity_name,
                        entity_obj=entity_obj,
                        reason="missing-attack-node",
                        ref_type=ref_type,
                        ref_name=ref_name,
                        parent=current_parent,
                        path_frames=[*current_path, attack_frame],
                        preferred_modules=[current_preferred_label],
                    )
                    continue

                attack_module, attack_obj = attack_match
                full_path = [*current_path, attack_frame]
                damage_id = str(attack_obj.get("damage_id") or "").strip() or None
                damage_frame: dict[str, Any] | None = None
                damage_summary: dict[str, Any] | None = None
                if damage_id:
                    damage_match = registry.lookup(
                        "damage",
                        damage_id,
                        preferred_labels=[attack_module.label, current_preferred_label],
                    )
                    damage_frame = build_path_frame(
                        module_label=damage_match[0].label if damage_match else attack_module.label,
                        section="damage",
                        name=damage_id,
                    )
                    if damage_match is None:
                        add_unresolved(
                            entity_name=entity_name,
                            entity_obj=entity_obj,
                            reason="missing-damage-node",
                            ref_type="damage",
                            ref_name=damage_id,
                            parent=ref_name,
                            path_frames=[*full_path, damage_frame],
                            preferred_modules=[attack_module.label, current_preferred_label],
                        )
                    else:
                        _damage_module, damage_obj = damage_match
                        damage_summary = build_damage_summary(damage_obj)

                immediate_status_names = [
                    str(child.get("name") or "").strip()
                    for child in children_by_parent.get(ref_name, [])
                    if str(child.get("type") or "").strip() == "status"
                    and str(child.get("name") or "").strip()
                ]
                damage_status_names = [
                    entry["name"]
                    for entry in (damage_summary or {}).get("statuses", [])
                    if entry.get("name")
                ]
                status_names = unique_list([*damage_status_names, *immediate_status_names])
                status_details = resolve_status_details(status_names, registry)
                status_frames = [
                    build_path_frame(
                        module_label="status",
                        section="status",
                        name=status_name,
                    )
                    for status_name in immediate_status_names
                ]

                projection_code = get_primary_code(entity_obj, current_weapon_contexts)
                rpm_sources = build_rpm_sources(
                    entity_name=entity_name,
                    entity_obj=entity_obj,
                    weapon_contexts=current_weapon_contexts,
                )
                rpm = rpm_sources[-1]["rpm"] if rpm_sources else None
                record_id_source = projection_code or entity_name
                record_id = f"{record_id_source}::{ref_type}::{ref_name}"
                group_key = "|".join(
                    [
                        normalize_code_key(projection_code),
                        normalize_name_key(entity_name),
                        ref_type.lower(),
                        normalize_attack_name_key(ref_name),
                    ]
                )

                raw_record = {
                    "_group_key": group_key,
                    "record_id": record_id,
                    "occurrence_count": 1,
                    "entity": {
                        "name": entity_name,
                        "id": str(entity_obj.get("id") or "").strip() or None,
                        "resolved_ids": unique_list(
                            [
                                value
                                for value in [
                                    str(entity_obj.get("id") or "").strip() or None,
                                    *[
                                        str(context.get("id") or "").strip() or None
                                        for context in current_weapon_contexts
                                    ],
                                ]
                                if value
                            ]
                        ),
                        "type": str(entity_obj.get("type") or "").strip() or None,
                        "tags": [str(tag) for tag in (entity_obj.get("tags") or [])],
                        "cooldown": normalize_number(entity_obj.get("cooldown")),
                        "uses": normalize_number(entity_obj.get("uses")),
                        "health": normalize_number(entity_obj.get("health")),
                        "armor": normalize_number(entity_obj.get("armor")),
                        "loadout_wep": str(entity_obj.get("loadout_wep") or "").strip() or None,
                    },
                    "attack": {
                        "type": ref_type,
                        "name": ref_name,
                        "parent": str(ref.get("parent") or "").strip() or None,
                        "level": normalize_number(ref.get("level")),
                        "damage_id": damage_id,
                        "model": build_attack_model(attack_obj),
                    },
                    "damage": damage_summary,
                    "statuses": {
                        "names": status_names,
                        "details": status_details,
                    },
                    "weapon_context": {
                        "resolved_weapon_names": unique_list(
                            [context["name"] for context in current_weapon_contexts if context.get("name")]
                        ),
                        "resolved_weapon_ids": unique_list(
                            [context["id"] for context in current_weapon_contexts if context.get("id")]
                        ),
                        "mount_names": unique_list(
                            [context["mount_name"] for context in current_weapon_contexts if context.get("mount_name")]
                        ),
                        "mount_sides": unique_list(
                            [context["mount_side"] for context in current_weapon_contexts if context.get("mount_side")]
                        ),
                        "rpm": rpm,
                        "rpm_sources": rpm_sources,
                    },
                    "csv_projection": build_csv_projection(
                        entity_name=entity_name,
                        entity_obj=entity_obj,
                        attack_type=ref_type,
                        attack_name=ref_name,
                        damage_summary=damage_summary,
                        projection_code=projection_code,
                        rpm=rpm,
                        status_names=status_names,
                    ),
                    "provenance": {
                        "source_modules": unique_list(
                            [
                                *[frame["module"] for frame in full_path],
                                *(["damage"] if damage_frame and damage_frame["module"] == "damage" else []),
                                *(["status"] if status_frames else []),
                            ]
                        ),
                        "paths": [
                            {
                                "frames": full_path,
                                "damage": damage_frame,
                                "status_refs": status_frames,
                            }
                        ],
                    },
                }

                existing = grouped_records.get(group_key)
                if existing is None:
                    grouped_records[group_key] = raw_record
                else:
                    merge_record(existing, raw_record)

                visit_parent(
                    current_parent=ref_name,
                    current_path=full_path,
                    current_weapon_contexts=current_weapon_contexts,
                    current_preferred_label=attack_module.label,
                    current_active_weapon_names=current_active_weapon_names,
                )

        visit_parent(
            current_parent=root_name,
            current_path=path_frames,
            current_weapon_contexts=weapon_contexts,
            current_preferred_label=preferred_label,
            current_active_weapon_names=active_weapon_names,
        )

    for entity_name, entity_obj in sorted(stratagems.items()):
        if not isinstance(entity_obj, dict):
            continue
        if not should_include_stratagem(entity_name, entity_obj):
            continue

        root_path = [
            build_path_frame(
                module_label=stratagems_module.label,
                section="stratagems",
                name=entity_name,
            )
        ]
        refs = [
            ref
            for ref in entity_obj.get("attacks") or []
            if isinstance(ref, dict)
        ]
        if not refs:
            loadout_wep = str(entity_obj.get("loadout_wep") or "").strip()
            if loadout_wep:
                refs = [
                    {
                        "type": "weapons",
                        "name": loadout_wep,
                        "parent": entity_name,
                        "level": 1,
                        "_synthetic": "loadout_wep",
                    }
                ]
            else:
                add_unresolved(
                    entity_name=entity_name,
                    entity_obj=entity_obj,
                    reason="no-attacks-or-loadout",
                    ref_type=None,
                    ref_name=None,
                    parent=None,
                    path_frames=root_path,
                )
                continue

        walk_ref_list(
            entity_name=entity_name,
            entity_obj=entity_obj,
            root_name=entity_name,
            refs=refs,
            path_frames=root_path,
            weapon_contexts=[],
            preferred_label=stratagems_module.label,
            active_weapon_names=[],
        )

    records = sorted(
        grouped_records.values(),
        key=lambda record: (
            normalize_name_key(record["entity"]["name"]),
            str(record["attack"]["type"]),
            normalize_attack_name_key(record["attack"]["name"]),
        ),
    )
    for record in records:
        record.pop("_group_key", None)
    return records, unresolved


def build_entity_csv_rows(
    *,
    entity_name: str,
    entity_id: str | None,
    resolved_ids: list[str],
    csv_indexes: dict[str, Any],
) -> list[CsvRow]:
    rows_by_line: dict[int, CsvRow] = {}
    for candidate_id in unique_list([entity_id, *resolved_ids]):
        code_key = normalize_code_key(candidate_id)
        if not code_key:
            continue
        for csv_row in csv_indexes["by_code_any"].get(code_key, []):
            rows_by_line[csv_row.line_number] = csv_row

    name_key = normalize_name_key(entity_name)
    for csv_row in csv_indexes["by_name_any"].get(name_key, []):
        rows_by_line[csv_row.line_number] = csv_row

    return sorted(rows_by_line.values(), key=lambda row: row.line_number)


def simplify_csv_row(csv_row: CsvRow) -> dict[str, Any]:
    return {
        "line_number": csv_row.line_number,
        "row": csv_row.row,
    }


def build_entity_summaries(
    *,
    stratagems_module: LoadedModule,
    records: list[dict[str, Any]],
    unresolved: list[dict[str, Any]],
    csv_indexes: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    records_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unresolved_by_entity: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for record in records:
        key = entity_identity(record["entity"]["name"], record["entity"].get("id"))
        records_by_entity[key].append(record)

    for item in unresolved:
        key = entity_identity(item["entity_name"], item.get("entity_id"))
        unresolved_by_entity[key].append(item)

    summaries: list[dict[str, Any]] = []
    unresolved_entities: list[dict[str, Any]] = []
    stratagems = stratagems_module.data.get("stratagems")
    if not isinstance(stratagems, dict):
        return summaries, unresolved_entities

    for entity_name, entity_obj in sorted(stratagems.items()):
        if not isinstance(entity_obj, dict):
            continue
        if not should_include_stratagem(entity_name, entity_obj):
            continue

        key = entity_identity(entity_name, str(entity_obj.get("id") or "").strip() or None)
        entity_records = records_by_entity.get(key, [])
        entity_unresolved = unresolved_by_entity.get(key, [])
        resolved_ids = unique_list(
            [
                *[
                    resolved_id
                    for record in entity_records
                    for resolved_id in record["entity"].get("resolved_ids", [])
                ],
                str(entity_obj.get("id") or "").strip() or None,
            ]
        )
        csv_rows = build_entity_csv_rows(
            entity_name=entity_name,
            entity_id=str(entity_obj.get("id") or "").strip() or None,
            resolved_ids=[value for value in resolved_ids if value],
            csv_indexes=csv_indexes,
        )
        matched_csv_rows = sorted(
            {
                line_number
                for record in entity_records
                for line_number in record.get("comparison", {}).get("csv_row_numbers", [])
            }
        )
        matched_record_count = sum(
            1 for record in entity_records if record.get("comparison", {}).get("matched")
        )

        if entity_records and csv_rows:
            status = (
                "covered"
                if matched_record_count == len(entity_records)
                and len(matched_csv_rows) == len(csv_rows)
                else "partial"
            )
        elif entity_records:
            status = "wiki-only"
        elif csv_rows and entity_unresolved:
            status = "unresolved"
        elif csv_rows:
            status = "csv-only"
        elif entity_unresolved:
            status = "no-attack-data"
        else:
            status = "empty"

        summary = {
            "name": entity_name,
            "id": str(entity_obj.get("id") or "").strip() or None,
            "resolved_ids": [value for value in resolved_ids if value],
            "loadout_wep": str(entity_obj.get("loadout_wep") or "").strip() or None,
            "wiki_record_count": len(entity_records),
            "matched_record_count": matched_record_count,
            "csv_row_count": len(csv_rows),
            "matched_csv_row_count": len(matched_csv_rows),
            "csv_row_numbers": [csv_row.line_number for csv_row in csv_rows],
            "record_ids": [record["record_id"] for record in entity_records],
            "status": status,
            "unresolved_reasons": unique_list(
                [item["reason"] for item in entity_unresolved if item.get("reason")]
            ),
            "unresolved_reference_count": len(entity_unresolved),
        }
        summaries.append(summary)

        if len(entity_records) == 0:
            unresolved_entities.append(
                {
                    "name": entity_name,
                    "id": summary["id"],
                    "loadout_wep": summary["loadout_wep"],
                    "reason": summary["unresolved_reasons"][0]
                    if summary["unresolved_reasons"]
                    else None,
                    "csv_row_count": len(csv_rows),
                    "csv_row_numbers": summary["csv_row_numbers"],
                }
            )

    return summaries, unresolved_entities


def build_report(
    *,
    modules: list[LoadedModule],
    stratagems_module: LoadedModule,
    csv_path: Path,
    records: list[dict[str, Any]],
    unresolved: list[dict[str, Any]],
    csv_indexes: dict[str, Any],
    matched_line_numbers: set[int],
) -> dict[str, Any]:
    entity_summaries, unresolved_entities = build_entity_summaries(
        stratagems_module=stratagems_module,
        records=records,
        unresolved=unresolved,
        csv_indexes=csv_indexes,
    )
    csv_unmatched_rows = [
        simplify_csv_row(csv_row)
        for csv_row in csv_indexes["rows"]
        if csv_row.line_number not in matched_line_numbers
    ]
    wiki_missing_records = [
        {
            "record_id": record["record_id"],
            "csv_projection": record["csv_projection"],
            "comparison": record["comparison"],
        }
        for record in records
        if not record.get("comparison", {}).get("matched")
    ]

    summary = {
        "stratagem_entities_total": len(entity_summaries),
        "stratagem_entities_with_records": sum(
            1 for summary in entity_summaries if summary["wiki_record_count"] > 0
        ),
        "stratagem_entities_without_records": sum(
            1 for summary in entity_summaries if summary["wiki_record_count"] == 0
        ),
        "wiki_records_total": len(records),
        "wiki_records_matched": sum(
            1 for record in records if record.get("comparison", {}).get("matched")
        ),
        "wiki_records_unmatched": sum(
            1 for record in records if not record.get("comparison", {}).get("matched")
        ),
        "csv_rows_total": len(csv_indexes["rows"]),
        "csv_rows_matched": len(matched_line_numbers),
        "csv_rows_unmatched": len(csv_unmatched_rows),
        "unresolved_references": len(unresolved),
        "unresolved_entities": len(unresolved_entities),
    }

    return {
        "metadata": {
            "tool": r"tools\ingest_wikigg_attacks.py",
            "generated_at": datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
            "comparison_scope": {
                "csv_path": str(csv_path),
                "csv_type_filter": "Stratagem",
                "excluded_stratagem_tags": ["SUPPORT WEAPON"],
            },
            "sources": {
                module.label: {
                    "origin": module.origin,
                    "locator": module.locator,
                    "sections": sorted(module.data.keys()),
                }
                for module in modules
            },
        },
        "records": records,
        "coverage": {
            "summary": summary,
            "by_stratagem": entity_summaries,
            "csv_rows_unmatched": csv_unmatched_rows,
            "wiki_records_missing_from_csv": wiki_missing_records,
        },
        "unresolved_references": unresolved,
        "unresolved_entities": unresolved_entities,
    }


def print_summary(report: dict[str, Any], output_path: Path) -> None:
    summary = report["coverage"]["summary"]
    print(
        f"Wrote {output_path} with "
        f"{summary['wiki_records_total']} normalized attack records across "
        f"{summary['stratagem_entities_total']} stratagem entries."
    )
    print(
        f"Matched {summary['csv_rows_matched']} of {summary['csv_rows_total']} "
        f"existing stratagem CSV rows."
    )
    print(
        f"Unmatched wiki records: {summary['wiki_records_unmatched']}; "
        f"unmatched CSV rows: {summary['csv_rows_unmatched']}; "
        f"unresolved references: {summary['unresolved_references']}."
    )

    csv_samples = report["coverage"]["csv_rows_unmatched"][:5]
    if csv_samples:
        sample_text = ", ".join(
            f"{item['row'].get('Name')}::{item['row'].get('Atk Type')}::{item['row'].get('Atk Name')}"
            for item in csv_samples
        )
        print(f"CSV-unmatched samples: {sample_text}")

    wiki_samples = report["coverage"]["wiki_records_missing_from_csv"][:5]
    if wiki_samples:
        sample_text = ", ".join(
            f"{item['csv_projection'].get('Name')}::{item['csv_projection'].get('Atk Type')}::{item['csv_projection'].get('Atk Name')}"
            for item in wiki_samples
        )
        print(f"Wiki-only samples: {sample_text}")


def main() -> None:
    args = parse_args()

    csv_path = Path(args.csv.strip()).resolve()
    output_path = Path(args.output.strip()).resolve()
    if not csv_path.exists():
        raise SystemExit(f"CSV file not found: {csv_path}")

    stratagems_module = load_module(
        label="stratagems",
        json_path=args.stratagems_json,
        url=args.stratagems_url,
        default_url=DEFAULT_STRATAGEMS_URL,
        offline=args.offline,
    )
    if stratagems_module is None:
        raise SystemExit("Unable to load stratagems module.")

    modules = [
        stratagems_module,
        *[
            module
            for module in [
                load_module(
                    label="weapons",
                    json_path=args.weapons_json,
                    url=args.weapons_url,
                    default_url=DEFAULT_WEAPONS_URL,
                    offline=args.offline,
                ),
                load_module(
                    label="status",
                    json_path=args.status_json,
                    url=args.status_url,
                    default_url=DEFAULT_STATUS_URL,
                    offline=args.offline,
                ),
            ]
            if module is not None
        ],
    ]

    csv_indexes = build_csv_indexes(load_csv_rows(csv_path))
    records, unresolved = normalize_stratagem_records(stratagems_module, modules)
    matched_line_numbers = attach_csv_comparison(records, csv_indexes)
    report = build_report(
        modules=modules,
        stratagems_module=stratagems_module,
        csv_path=csv_path,
        records=records,
        unresolved=unresolved,
        csv_indexes=csv_indexes,
        matched_line_numbers=matched_line_numbers,
    )

    ensure_parent_dir(output_path)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write("\n")

    print_summary(report, output_path)


if __name__ == "__main__":
    main()
