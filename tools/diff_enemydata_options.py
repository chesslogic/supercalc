#!/usr/bin/env python3
"""
Diff two enemydata-like JSON files.

This is intended for comparing the checked-in `enemies\\enemydata.json` against
curated alternatives such as `enemies\\diversdex-enemydata.json`, where the two
sources differ in structure and verbosity:

- grouped sheet zones may be represented with `source_zone_count`
- curated sources may add `status_effects`, `default_stats`, descriptions, notes,
  and nested `child_profiles`
- source/provenance fields should not drown out gameplay differences

The report focuses on:

- units present only on one side
- top-level metadata differences
- damageable-zone stat differences
- zone-name differences where stats match after normalization
- status/default-stat record differences
- nested child/inline profile differences
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable


PROVENANCE_UNIT_KEYS = {
    "source_csv",
    "source_line",
    "source_note",
    "source_profile_name",
    "source_provenance",
    "shared_profile_names",
}
NESTED_PROFILE_KEYS = ("child_profiles", "inline_enemies")
NESTED_UNIT_MAP_KEYS = {"damageable_zones", "status_effects", "default_stats", *NESTED_PROFILE_KEYS}
ZONE_NOISE_KEYS = {"zone_name", "source_zone_name", "source_zone_count", "zone_id"}
ORDER_INSENSITIVE_UNIT_KEYS = {"scope_tags"}
ORDER_INSENSITIVE_RECORD_KEYS = {"notes"}
RECORD_LABEL_KEYS = {"label"}


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected top-level object in {path}")
    return data


def ensure_parent_dir(path: Path) -> None:
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def canonicalize_value(value: Any, *, sort_list_values: bool = False) -> Any:
    if isinstance(value, dict):
        return {
            key: canonicalize_value(subvalue, sort_list_values=sort_list_values)
            for key, subvalue in sorted(value.items())
        }
    if isinstance(value, list):
        items = [canonicalize_value(item, sort_list_values=sort_list_values) for item in value]
        if sort_list_values:
            return sorted(items, key=lambda item: json.dumps(item, sort_keys=True, ensure_ascii=False))
        return items
    return value


def is_main_zone(zone: Dict[str, Any]) -> bool:
    raw_name = zone.get("source_zone_name")
    if not isinstance(raw_name, str) or not raw_name.strip():
        raw_name = zone.get("zone_name")
    return str(raw_name or "").strip().lower() == "main"


def normalize_zone_signature(zone: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    main_zone = is_main_zone(zone)

    for key, value in zone.items():
        if key in ZONE_NOISE_KEYS or value is None:
            continue
        if key == "MainCap":
            bool_value = bool(value)
            if main_zone and bool_value:
                continue
            normalized[key] = bool_value
            continue
        if key == "Con":
            if value == 0:
                continue
            normalized[key] = value
            continue
        if key == "ConRate":
            if value == 0:
                continue
            normalized[key] = value
            continue
        if key == "ConNoBleed":
            if not value:
                continue
            normalized[key] = True
            continue
        if key == "IsFatal":
            if main_zone and bool(value):
                continue
            normalized[key] = bool(value)
            continue
        if key == "ExMult":
            if value == 1 or value == 1.0:
                continue
            normalized[key] = value
            continue
        if key == "ToMain%":
            if main_zone and (value == 1 or value == 1.0):
                continue
            normalized[key] = value
            continue
        if key == "ExTarget":
            text = str(value).strip()
            if main_zone and text == "Main":
                continue
            if text:
                normalized[key] = text
            continue
        if key == "on_death":
            text = str(value).strip()
            if not text or text == "-":
                continue
            if text.lower() == "fatal" and bool(zone.get("IsFatal")):
                continue
            normalized["OnDeath"] = text
            continue
        normalized[key] = value

    normalized.setdefault("MainCap", False)
    return normalized


def full_zone_signature(zone: Dict[str, Any]) -> str:
    return json.dumps(normalize_zone_signature(zone), sort_keys=True, separators=(",", ":"))


def get_zone_weight(zone: Dict[str, Any]) -> int:
    weight = zone.get("source_zone_count")
    if isinstance(weight, int) and weight > 0:
        return weight
    return 1


def get_zone_display_name(zone: Dict[str, Any]) -> str:
    source_name = zone.get("source_zone_name")
    if isinstance(source_name, str) and source_name.strip():
        text = source_name.strip()
        return "Main" if text.lower() == "main" else text
    zone_name = zone.get("zone_name")
    if isinstance(zone_name, str) and zone_name.strip():
        text = zone_name.strip()
        return "Main" if text.lower() == "main" else text
    return "[unknown]"


def group_zones(zones: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    for zone in zones:
        if not isinstance(zone, dict):
            continue
        signature = full_zone_signature(zone)
        bucket = grouped.setdefault(
            signature,
            {
                "signature": json.loads(signature),
                "weighted_count": 0,
                "zone_names": [],
            },
        )
        bucket["weighted_count"] += get_zone_weight(zone)
        bucket["zone_names"].append(get_zone_display_name(zone))

    for bucket in grouped.values():
        bucket["zone_names"] = sorted(bucket["zone_names"])

    return grouped


def diff_zone_groups(left_unit: Dict[str, Any], right_unit: Dict[str, Any]) -> Dict[str, Any]:
    left_groups = group_zones(left_unit.get("damageable_zones") or [])
    right_groups = group_zones(right_unit.get("damageable_zones") or [])

    left_counts = Counter({signature: bucket["weighted_count"] for signature, bucket in left_groups.items()})
    right_counts = Counter({signature: bucket["weighted_count"] for signature, bucket in right_groups.items()})

    removed_groups = []
    added_groups = []
    renamed_groups = []

    for signature, count in sorted(left_counts.items()):
        delta = count - right_counts.get(signature, 0)
        if delta > 0:
            bucket = left_groups[signature]
            removed_groups.append(
                {
                    "count_delta": delta,
                    "signature": bucket["signature"],
                    "zone_names": bucket["zone_names"],
                }
            )

    for signature, count in sorted(right_counts.items()):
        delta = count - left_counts.get(signature, 0)
        if delta > 0:
            bucket = right_groups[signature]
            added_groups.append(
                {
                    "count_delta": delta,
                    "signature": bucket["signature"],
                    "zone_names": bucket["zone_names"],
                }
            )

    for signature in sorted(set(left_groups) & set(right_groups)):
        left_bucket = left_groups[signature]
        right_bucket = right_groups[signature]
        if left_bucket["weighted_count"] != right_bucket["weighted_count"]:
            continue
        if left_bucket["zone_names"] == right_bucket["zone_names"]:
            continue
        renamed_groups.append(
            {
                "weighted_count": left_bucket["weighted_count"],
                "signature": left_bucket["signature"],
                "left_zone_names": left_bucket["zone_names"],
                "right_zone_names": right_bucket["zone_names"],
            }
        )

    if not removed_groups and not added_groups and not renamed_groups:
        return {}

    return {
        "left_zone_weight": sum(left_counts.values()),
        "right_zone_weight": sum(right_counts.values()),
        "removed_zone_groups": removed_groups,
        "added_zone_groups": added_groups,
        "renamed_zone_groups": renamed_groups,
    }


def normalize_unit_metadata(unit: Dict[str, Any]) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    for key, value in unit.items():
        if key in PROVENANCE_UNIT_KEYS or key in NESTED_UNIT_MAP_KEYS:
            continue
        if value is None:
            continue
        if key in ORDER_INSENSITIVE_UNIT_KEYS and isinstance(value, list):
            metadata[key] = canonicalize_value(value, sort_list_values=True)
            continue
        if key in ORDER_INSENSITIVE_RECORD_KEYS and isinstance(value, list):
            metadata[key] = canonicalize_value(value, sort_list_values=True)
            continue
        metadata[key] = canonicalize_value(value)
    return metadata


def diff_field_map(left_fields: Dict[str, Any], right_fields: Dict[str, Any]) -> Dict[str, Any]:
    changes: Dict[str, Any] = {}
    for key in sorted(set(left_fields) | set(right_fields)):
        left_value = left_fields.get(key)
        right_value = right_fields.get(key)
        if left_value == right_value:
            continue
        changes[key] = {
            "left": left_value,
            "right": right_value,
        }
    return changes


def diff_named_records(
    left_records: Any,
    right_records: Any,
    *,
    ignore_fields: set[str] | None = None,
) -> Dict[str, Any]:
    ignore_fields = ignore_fields or set()
    left_map = left_records if isinstance(left_records, dict) else {}
    right_map = right_records if isinstance(right_records, dict) else {}

    left_only = sorted(set(left_map) - set(right_map))
    right_only = sorted(set(right_map) - set(left_map))
    changed_records: Dict[str, Any] = {}

    for name in sorted(set(left_map) & set(right_map)):
        left_record = left_map[name]
        right_record = right_map[name]
        if not isinstance(left_record, dict) or not isinstance(right_record, dict):
            if canonicalize_value(left_record) != canonicalize_value(right_record):
                changed_records[name] = {
                    "left": left_record,
                    "right": right_record,
                }
            continue

        left_fields = {
            key: canonicalize_value(value)
            for key, value in left_record.items()
            if key not in ignore_fields
        }
        right_fields = {
            key: canonicalize_value(value)
            for key, value in right_record.items()
            if key not in ignore_fields
        }
        field_changes = diff_field_map(left_fields, right_fields)
        if field_changes:
            changed_records[name] = field_changes

    if not left_only and not right_only and not changed_records:
        return {}

    return {
        "left_only": left_only,
        "right_only": right_only,
        "changed": changed_records,
    }


def extract_child_profiles(unit: Dict[str, Any]) -> Dict[str, Any]:
    children: Dict[str, Any] = {}
    for key in NESTED_PROFILE_KEYS:
        raw_children = unit.get(key)
        if not isinstance(raw_children, dict):
            continue
        for child_name, child_profile in raw_children.items():
            if isinstance(child_profile, dict):
                children[str(child_name)] = child_profile
    return children


def count_nested_profiles_in_unit(unit: Dict[str, Any]) -> int:
    total = 0
    for child_profile in extract_child_profiles(unit).values():
        total += 1
        total += count_nested_profiles_in_unit(child_profile)
    return total


def diff_profile_maps(left_profiles: Dict[str, Any], right_profiles: Dict[str, Any]) -> Dict[str, Any]:
    left_only = sorted(set(left_profiles) - set(right_profiles))
    right_only = sorted(set(right_profiles) - set(left_profiles))
    changed_profiles: Dict[str, Any] = {}

    for name in sorted(set(left_profiles) & set(right_profiles)):
        left_profile = left_profiles[name]
        right_profile = right_profiles[name]
        if not isinstance(left_profile, dict) or not isinstance(right_profile, dict):
            if canonicalize_value(left_profile) != canonicalize_value(right_profile):
                changed_profiles[name] = {
                    "left": left_profile,
                    "right": right_profile,
                }
            continue

        diff = diff_unit(left_profile, right_profile)
        if diff:
            changed_profiles[name] = diff

    if not left_only and not right_only and not changed_profiles:
        return {}

    return {
        "left_only_profiles": left_only,
        "right_only_profiles": right_only,
        "changed_profiles": changed_profiles,
    }


def diff_unit(left_unit: Dict[str, Any], right_unit: Dict[str, Any]) -> Dict[str, Any]:
    metadata_changes = diff_field_map(
        normalize_unit_metadata(left_unit),
        normalize_unit_metadata(right_unit),
    )
    zone_changes = diff_zone_groups(left_unit, right_unit)
    status_effect_changes = diff_named_records(
        left_unit.get("status_effects"),
        right_unit.get("status_effects"),
        ignore_fields=set(RECORD_LABEL_KEYS),
    )
    default_stat_changes = diff_named_records(
        left_unit.get("default_stats"),
        right_unit.get("default_stats"),
        ignore_fields=set(RECORD_LABEL_KEYS),
    )
    child_profile_changes = diff_profile_maps(
        extract_child_profiles(left_unit),
        extract_child_profiles(right_unit),
    )

    if not (
        metadata_changes
        or zone_changes
        or status_effect_changes
        or default_stat_changes
        or child_profile_changes
    ):
        return {}

    unit_diff: Dict[str, Any] = {}
    if metadata_changes:
        unit_diff["metadata_field_changes"] = metadata_changes
    if zone_changes:
        unit_diff["zone_changes"] = zone_changes
    if status_effect_changes:
        unit_diff["status_effect_changes"] = status_effect_changes
    if default_stat_changes:
        unit_diff["default_stat_changes"] = default_stat_changes
    if child_profile_changes:
        unit_diff["child_profile_changes"] = child_profile_changes
    return unit_diff


def count_top_level_units(data: Dict[str, Any]) -> int:
    total = 0
    for units in data.values():
        if isinstance(units, dict):
            total += len(units)
    return total


def count_nested_profiles(data: Dict[str, Any]) -> int:
    total = 0
    for units in data.values():
        if not isinstance(units, dict):
            continue
        for unit in units.values():
            if isinstance(unit, dict):
                total += count_nested_profiles_in_unit(unit)
    return total


def compare_datasets(
    left: Dict[str, Any],
    right: Dict[str, Any],
    *,
    left_label: str,
    right_label: str,
) -> Dict[str, Any]:
    faction_report: Dict[str, Any] = {}
    total_left_only = 0
    total_right_only = 0
    total_changed = 0
    total_overlap = 0

    for faction in sorted(set(left) | set(right)):
        left_units = left.get(faction)
        right_units = right.get(faction)
        if not isinstance(left_units, dict):
            left_units = {}
        if not isinstance(right_units, dict):
            right_units = {}

        left_only = sorted(set(left_units) - set(right_units))
        right_only = sorted(set(right_units) - set(left_units))
        overlap = sorted(set(left_units) & set(right_units))
        changed_units: Dict[str, Any] = {}

        for unit_name in overlap:
            left_unit = left_units[unit_name]
            right_unit = right_units[unit_name]
            if not isinstance(left_unit, dict) or not isinstance(right_unit, dict):
                if canonicalize_value(left_unit) != canonicalize_value(right_unit):
                    changed_units[unit_name] = {
                        "left": left_unit,
                        "right": right_unit,
                    }
                continue

            unit_diff = diff_unit(left_unit, right_unit)
            if unit_diff:
                changed_units[unit_name] = unit_diff

        if left_only or right_only or changed_units:
            faction_report[faction] = {
                "summary": {
                    f"{left_label}_unit_count": len(left_units),
                    f"{right_label}_unit_count": len(right_units),
                    "overlapping_unit_count": len(overlap),
                    f"{left_label}_only_unit_count": len(left_only),
                    f"{right_label}_only_unit_count": len(right_only),
                    "changed_unit_count": len(changed_units),
                }
            }
            if left_only:
                faction_report[faction][f"{left_label}_only_units"] = left_only
            if right_only:
                faction_report[faction][f"{right_label}_only_units"] = right_only
            if changed_units:
                faction_report[faction]["changed_units"] = changed_units

        total_left_only += len(left_only)
        total_right_only += len(right_only)
        total_changed += len(changed_units)
        total_overlap += len(overlap)

    return {
        "summary": {
            "left_top_level_unit_count": count_top_level_units(left),
            "right_top_level_unit_count": count_top_level_units(right),
            "left_nested_profile_count": count_nested_profiles(left),
            "right_nested_profile_count": count_nested_profiles(right),
            "overlapping_top_level_unit_count": total_overlap,
            "left_only_top_level_unit_count": total_left_only,
            "right_only_top_level_unit_count": total_right_only,
            "changed_top_level_unit_count": total_changed,
        },
        "factions": faction_report,
    }


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_left = repo_root / "enemies" / "enemydata.json"
    default_right = repo_root / "enemies" / "diversdex-enemydata.json"

    parser = argparse.ArgumentParser(
        description="Diff two enemydata-like JSON files.",
    )
    parser.add_argument(
        "--left",
        default=str(default_left),
        help=f"Left-hand enemydata-like JSON path. Default: {default_left}",
    )
    parser.add_argument(
        "--right",
        default=str(default_right),
        help=f"Right-hand enemydata-like JSON path. Default: {default_right}",
    )
    parser.add_argument(
        "--report",
        help="Optional path to write the JSON diff report.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    left_path = Path(args.left.strip())
    right_path = Path(args.right.strip())
    report_path = Path(args.report.strip()) if args.report else None

    if not left_path.exists():
        raise SystemExit(f"Left enemydata file not found: {left_path}")
    if not right_path.exists():
        raise SystemExit(f"Right enemydata file not found: {right_path}")

    left = load_json(left_path)
    right = load_json(right_path)
    report = compare_datasets(left, right, left_label="left", right_label="right")
    report["left_path"] = str(left_path)
    report["right_path"] = str(right_path)

    if report_path is not None:
        ensure_parent_dir(report_path)
        with report_path.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(report, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")

    print(
        "Summary:",
        f"left={report['summary']['left_top_level_unit_count']}",
        f"right={report['summary']['right_top_level_unit_count']}",
        f"left_nested={report['summary']['left_nested_profile_count']}",
        f"right_nested={report['summary']['right_nested_profile_count']}",
        f"overlap={report['summary']['overlapping_top_level_unit_count']}",
        f"left_only={report['summary']['left_only_top_level_unit_count']}",
        f"right_only={report['summary']['right_only_top_level_unit_count']}",
        f"changed={report['summary']['changed_top_level_unit_count']}",
    )

    if report_path is None:
        print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))
    else:
        print(f"Wrote report to {report_path}")


if __name__ == "__main__":
    main()
