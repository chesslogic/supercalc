#!/usr/bin/env python3
"""
Build machine-readable validation reports for wiki.gg-derived ingest outputs.

This is a reporting layer only: it compares ingest artifacts against the
checked-in datasets and writes categorized discrepancy reports that later review
tools can consume.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

try:
    from ingest_wikigg_attacks import (
        build_csv_indexes,
        build_entity_csv_rows,
        compare_record_to_csv,
        entity_identity,
        load_csv_rows,
        normalize_attack_name_key,
        normalize_code_key,
        normalize_name_key,
    )
    from enemy_refresh_rules import (
        DEFAULT_RULES_PATH as DEFAULT_ENEMY_RULES_PATH,
        classify_unit_refresh_changes,
        get_unit_refresh_rule,
        load_enemy_refresh_rules,
    )
    from weapon_refresh_rules import (
        DEFAULT_RULES_PATH as DEFAULT_WEAPON_RULES_PATH,
        WeaponRefreshRules,
        load_weapon_refresh_rules,
    )
except ModuleNotFoundError:  # pragma: no cover - fallback for package-style imports
    from tools.ingest_wikigg_attacks import (
        build_csv_indexes,
        build_entity_csv_rows,
        compare_record_to_csv,
        entity_identity,
        load_csv_rows,
        normalize_attack_name_key,
        normalize_code_key,
        normalize_name_key,
    )
    from tools.enemy_refresh_rules import (
        DEFAULT_RULES_PATH as DEFAULT_ENEMY_RULES_PATH,
        classify_unit_refresh_changes,
        get_unit_refresh_rule,
        load_enemy_refresh_rules,
    )
    from tools.weapon_refresh_rules import (
        DEFAULT_RULES_PATH as DEFAULT_WEAPON_RULES_PATH,
        WeaponRefreshRules,
        load_weapon_refresh_rules,
    )


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENEMY_SIDECAR_PATH = REPO_ROOT / "enemies" / "wikigg-enemy-anatomy-sidecar.json"
DEFAULT_CURRENT_ENEMY_PATH = REPO_ROOT / "enemies" / "enemydata.json"
DEFAULT_ATTACK_INGEST_PATH = REPO_ROOT / "tools" / "issues" / "wikigg-stratagem-attacks.json"
DEFAULT_ATTACK_CSV_PATH = REPO_ROOT / "weapons" / "weapondata.csv"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "tools" / "artifacts" / "wiki_validation"
DEFAULT_ENEMY_OUTPUT_NAME = "enemy-anatomy-validation.json"
DEFAULT_ATTACK_OUTPUT_NAME = "stratagem-attack-validation.json"
DEFAULT_INDEX_OUTPUT_NAME = "index.json"

ZONE_NOISE_KEYS = {"zone_name", "source_zone_name", "source_zone_count", "zone_id"}
PASSTHROUGH_FIELDS = {"ExMult", "ExTarget", "MainCap", "ToMain%"}
ATTACK_VALIDATION_FIELDS = [
    "Code",
    "Name",
    "RPM",
    "Atk Type",
    "Atk Name",
    "DMG",
    "DUR",
    "AP",
    "DF",
    "ST",
    "PF",
    "Status",
]
ATTACK_IDENTIFIER_FIELDS = {"Code", "Name", "Atk Type", "Atk Name"}
ATTACK_NUMERIC_FIELDS = {"RPM", "DMG", "DUR", "AP", "DF", "ST", "PF"}
ATTACK_ENTITY_STATUS_ORDER = [
    "covered",
    "partial",
    "wiki-only",
    "csv-only",
    "unresolved",
    "no-attack-data",
    "empty",
]
REVIEW_QUEUE_BUCKETS = ("safe_sync", "curated_review", "source_gap", "blocked")


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected top-level object in {path}")
    return data


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    ensure_parent_dir(path)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def unique_list(values: Iterable[Any]) -> list[Any]:
    seen: set[str] = set()
    result: list[Any] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, (dict, list)):
            marker = json.dumps(value, sort_keys=True, ensure_ascii=False)
        else:
            marker = str(value)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def compact_unit_ref(faction: str, unit_name: str) -> Dict[str, str]:
    return {
        "faction": faction,
        "unit_name": unit_name,
    }


def compact_entity_ref(summary: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": summary["name"],
        "id": summary.get("id"),
        "status": summary["status"],
        "wiki_record_count": summary["wiki_record_count"],
        "matched_record_count": summary["matched_record_count"],
        "csv_row_count": summary["csv_row_count"],
        "matched_csv_row_count": summary["matched_csv_row_count"],
        "unresolved_reference_count": summary["unresolved_reference_count"],
    }


def create_review_queue(domain: str) -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "domain": domain,
        "bucket_order": list(REVIEW_QUEUE_BUCKETS),
        "description": (
            "Report-first review buckets. safe_sync entries are narrow candidates "
            "for reviewed syncing; curated_review requires human judgement; "
            "source_gap points at missing/stale upstream data; blocked must not be "
            "auto-applied."
        ),
        "buckets": {bucket: [] for bucket in REVIEW_QUEUE_BUCKETS},
        "summary": {
            "total": 0,
            "buckets": {bucket: 0 for bucket in REVIEW_QUEUE_BUCKETS},
        },
    }


def add_review_queue_item(queue: Dict[str, Any], bucket: str, item: Dict[str, Any]) -> None:
    if bucket not in REVIEW_QUEUE_BUCKETS:
        raise ValueError(f"Unknown review queue bucket: {bucket}")
    clean_item = {
        key: canonicalize_value(value, sort_list_values=True)
        for key, value in item.items()
        if value not in (None, [], {})
    }
    queue["buckets"][bucket].append(clean_item)


def finalize_review_queue(queue: Dict[str, Any]) -> Dict[str, Any]:
    total = 0
    for bucket in REVIEW_QUEUE_BUCKETS:
        items = queue["buckets"][bucket]
        items.sort(key=lambda item: json.dumps(item, sort_keys=True, ensure_ascii=False, default=str))
        queue["summary"]["buckets"][bucket] = len(items)
        total += len(items)
    queue["summary"]["total"] = total
    return queue


def review_queue_summary(queue: Mapping[str, Any] | None) -> Dict[str, Any]:
    if not queue:
        return {
            "total": 0,
            "buckets": {bucket: 0 for bucket in REVIEW_QUEUE_BUCKETS},
        }
    summary = queue.get("summary") or {}
    buckets = summary.get("buckets") or {}
    return {
        "total": int(summary.get("total") or 0),
        "buckets": {
            bucket: int(buckets.get(bucket) or 0)
            for bucket in REVIEW_QUEUE_BUCKETS
        },
    }


def aggregate_review_queue_summaries(reports: Mapping[str, Any]) -> Dict[str, Any]:
    aggregate = {
        "total": 0,
        "buckets": {bucket: 0 for bucket in REVIEW_QUEUE_BUCKETS},
        "reports": {},
    }
    for report_name in sorted(reports):
        report = reports[report_name] or {}
        summary = review_queue_summary(report.get("review_queue"))
        aggregate["reports"][report_name] = summary
        aggregate["total"] += summary["total"]
        for bucket in REVIEW_QUEUE_BUCKETS:
            aggregate["buckets"][bucket] += summary["buckets"][bucket]
    return aggregate


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
    return json.dumps(
        normalize_zone_signature(zone),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def get_zone_weight(zone: Dict[str, Any]) -> int:
    raw_weight = zone.get("source_zone_count")
    if isinstance(raw_weight, (int, float)) and not isinstance(raw_weight, bool) and raw_weight > 0:
        return int(raw_weight)
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


def group_zones_by_signature(zones: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
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
        bucket["zone_names"] = sorted(unique_list(bucket["zone_names"]))

    return grouped


def group_zones_by_name(zones: Iterable[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}

    for zone in zones:
        if not isinstance(zone, dict):
            continue
        display_name = get_zone_display_name(zone)
        name_key = normalize_name_key(display_name) or display_name.strip().lower()
        signature = full_zone_signature(zone)
        bucket = grouped.setdefault(
            name_key,
            {
                "zone_name_key": name_key,
                "zone_names": [],
                "weighted_count": 0,
                "signature_map": {},
            },
        )
        bucket["zone_names"].append(display_name)
        bucket["weighted_count"] += get_zone_weight(zone)
        signature_bucket = bucket["signature_map"].setdefault(
            signature,
            {
                "count": 0,
                "signature": json.loads(signature),
            },
        )
        signature_bucket["count"] += get_zone_weight(zone)

    for bucket in grouped.values():
        bucket["zone_names"] = sorted(unique_list(bucket["zone_names"]))
        bucket["signatures"] = [
            bucket["signature_map"][signature_key]
            for signature_key in sorted(bucket["signature_map"])
        ]
        bucket.pop("signature_map", None)

    return grouped


def build_zone_name_keys(names: Iterable[str]) -> list[str]:
    keys = [
        normalize_name_key(name) or str(name).strip().lower()
        for name in names
        if str(name).strip()
    ]
    return sorted(unique_list(keys))


def build_field_mismatches(current_fields: Dict[str, Any], wiki_fields: Dict[str, Any]) -> Dict[str, Any]:
    changes: Dict[str, Any] = {}
    for key in sorted(set(current_fields) | set(wiki_fields)):
        current_value = current_fields.get(key)
        wiki_value = wiki_fields.get(key)
        if current_value == wiki_value:
            continue
        changes[key] = {
            "current": current_value,
            "wiki": wiki_value,
        }
    return changes


def summarize_enemy_unit(unit: Dict[str, Any], *, wiki_side: bool) -> Dict[str, Any]:
    zones = [zone for zone in unit.get("damageable_zones") or [] if isinstance(zone, dict)]
    summary: Dict[str, Any] = {
        "health": unit.get("health"),
        "zone_count": len(zones),
        "zone_weight": sum(get_zone_weight(zone) for zone in zones),
    }
    if wiki_side:
        summary["source_profile_name"] = unit.get("source_profile_name")
        if "source_provenance" in unit:
            summary["source_provenance"] = unit.get("source_provenance")
    elif unit.get("scope_tags"):
        summary["scope_tags"] = canonicalize_value(unit.get("scope_tags"), sort_list_values=True)
    return summary


def build_zone_field_mismatches(
    current_unit: Dict[str, Any],
    wiki_unit: Dict[str, Any],
) -> tuple[list[Dict[str, Any]], list[Dict[str, Any]]]:
    current_by_name = group_zones_by_name(current_unit.get("damageable_zones") or [])
    wiki_by_name = group_zones_by_name(wiki_unit.get("damageable_zones") or [])

    field_mismatches: list[Dict[str, Any]] = []
    passthrough_mismatches: list[Dict[str, Any]] = []

    for name_key in sorted(set(current_by_name) & set(wiki_by_name)):
        current_bucket = current_by_name[name_key]
        wiki_bucket = wiki_by_name[name_key]

        current_signatures = {
            json.dumps(entry["signature"], sort_keys=True, separators=(",", ":"), ensure_ascii=False): entry
            for entry in current_bucket["signatures"]
        }
        wiki_signatures = {
            json.dumps(entry["signature"], sort_keys=True, separators=(",", ":"), ensure_ascii=False): entry
            for entry in wiki_bucket["signatures"]
        }

        if set(current_signatures) == set(wiki_signatures):
            continue

        entry: Dict[str, Any] = {
            "zone_name_key": name_key,
            "current_zone_names": current_bucket["zone_names"],
            "wiki_zone_names": wiki_bucket["zone_names"],
            "current_weighted_count": current_bucket["weighted_count"],
            "wiki_weighted_count": wiki_bucket["weighted_count"],
            "current_signatures": current_bucket["signatures"],
            "wiki_signatures": wiki_bucket["signatures"],
        }

        if len(current_bucket["signatures"]) == 1 and len(wiki_bucket["signatures"]) == 1:
            changes = build_field_mismatches(
                current_bucket["signatures"][0]["signature"],
                wiki_bucket["signatures"][0]["signature"],
            )
            if changes:
                entry["field_mismatches"] = changes
                entry["changed_fields"] = sorted(changes)
                passthrough_fields = sorted(set(changes) & PASSTHROUGH_FIELDS)
                if passthrough_fields:
                    passthrough_mismatches.append(
                        {
                            "zone_name_key": name_key,
                            "current_zone_names": current_bucket["zone_names"],
                            "wiki_zone_names": wiki_bucket["zone_names"],
                            "passthrough_fields": passthrough_fields,
                            "field_mismatches": {
                                field: changes[field]
                                for field in passthrough_fields
                            },
                        }
                    )

        field_mismatches.append(entry)

    return field_mismatches, passthrough_mismatches


def build_enemy_unit_difference(
    current_unit: Dict[str, Any],
    wiki_unit: Dict[str, Any],
) -> Dict[str, Any]:
    current_groups = group_zones_by_signature(current_unit.get("damageable_zones") or [])
    wiki_groups = group_zones_by_signature(wiki_unit.get("damageable_zones") or [])

    missing_zone_groups: list[Dict[str, Any]] = []
    extra_zone_groups: list[Dict[str, Any]] = []
    zone_name_differences: list[Dict[str, Any]] = []
    zone_group_count_differences: list[Dict[str, Any]] = []

    for signature in sorted(set(current_groups) | set(wiki_groups)):
        current_bucket = current_groups.get(signature)
        wiki_bucket = wiki_groups.get(signature)
        if current_bucket and wiki_bucket:
            if current_bucket["weighted_count"] != wiki_bucket["weighted_count"]:
                zone_group_count_differences.append(
                    {
                        "signature": current_bucket["signature"],
                        "current_weighted_count": current_bucket["weighted_count"],
                        "wiki_weighted_count": wiki_bucket["weighted_count"],
                        "current_zone_names": current_bucket["zone_names"],
                        "wiki_zone_names": wiki_bucket["zone_names"],
                    }
                )
            if current_bucket["zone_names"] != wiki_bucket["zone_names"]:
                zone_name_differences.append(
                    {
                        "signature": current_bucket["signature"],
                        "weighted_count": current_bucket["weighted_count"],
                        "current_zone_names": current_bucket["zone_names"],
                        "wiki_zone_names": wiki_bucket["zone_names"],
                    }
                )
            continue

        if current_bucket:
            missing_zone_groups.append(
                {
                    "weighted_count": current_bucket["weighted_count"],
                    "signature": current_bucket["signature"],
                    "zone_names": current_bucket["zone_names"],
                }
            )
            continue

        if wiki_bucket:
            extra_zone_groups.append(
                {
                    "weighted_count": wiki_bucket["weighted_count"],
                    "signature": wiki_bucket["signature"],
                    "zone_names": wiki_bucket["zone_names"],
                }
            )

    zone_field_mismatches, zone_passthrough_mismatches = build_zone_field_mismatches(
        current_unit,
        wiki_unit,
    )
    field_mismatch_name_keys = {
        entry["zone_name_key"]
        for entry in zone_field_mismatches
    }
    if field_mismatch_name_keys:
        missing_zone_groups = [
            entry
            for entry in missing_zone_groups
            if not set(build_zone_name_keys(entry["zone_names"])) & field_mismatch_name_keys
        ]
        extra_zone_groups = [
            entry
            for entry in extra_zone_groups
            if not set(build_zone_name_keys(entry["zone_names"])) & field_mismatch_name_keys
        ]

    categories: list[str] = []
    difference: Dict[str, Any] = {
        "categories": categories,
        "current": summarize_enemy_unit(current_unit, wiki_side=False),
        "wiki": summarize_enemy_unit(wiki_unit, wiki_side=True),
    }

    if current_unit.get("health") != wiki_unit.get("health"):
        categories.append("unit-health-mismatch")
        difference["unit_health_mismatch"] = {
            "current": current_unit.get("health"),
            "wiki": wiki_unit.get("health"),
        }
    if missing_zone_groups:
        categories.append("missing-zone-groups")
        difference["missing_zone_groups"] = missing_zone_groups
    if extra_zone_groups:
        categories.append("extra-zone-groups")
        difference["extra_zone_groups"] = extra_zone_groups
    if zone_name_differences:
        categories.append("zone-name-differences")
        difference["zone_name_differences"] = zone_name_differences
    if zone_field_mismatches:
        categories.append("zone-field-mismatches")
        difference["zone_field_mismatches"] = zone_field_mismatches
    if zone_passthrough_mismatches:
        categories.append("zone-passthrough-mismatches")
        difference["zone_passthrough_mismatches"] = zone_passthrough_mismatches
    if zone_group_count_differences:
        categories.append("zone-group-count-differences")
        difference["zone_group_count_differences"] = zone_group_count_differences

    return difference if categories else {}


def enemy_refresh_classification_bucket(classification: str) -> str:
    if classification == "safe_sync":
        return "safe_sync"
    if classification == "known_source_lag":
        return "source_gap"
    if classification == "locked":
        return "blocked"
    return "curated_review"


def add_enemy_refresh_queue_entries(
    review_queue: Dict[str, Any],
    *,
    faction: str,
    unit_name: str,
    refresh_classification: Dict[str, Any],
) -> None:
    for change in refresh_classification.get("field_changes") or []:
        if not isinstance(change, dict):
            continue
        classification = str(change.get("classification") or "manual_review")
        bucket = enemy_refresh_classification_bucket(classification)
        item = {
            "item_type": "enemy-field-change",
            "faction": faction,
            "unit_name": unit_name,
            "field": change.get("field"),
            "classification": classification,
            "rule_field": change.get("rule_field"),
            "reason": change.get("reason"),
            "current": change.get("current"),
            "wiki": change.get("generated"),
        }
        add_review_queue_item(review_queue, bucket, item)


def filter_enemy_factions(data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    factions: Dict[str, Dict[str, Any]] = OrderedDict()
    for key, value in data.items():
        if str(key).startswith("__"):
            continue
        if isinstance(value, dict):
            factions[str(key)] = value
    return factions


def count_enemy_units(data: Dict[str, Dict[str, Any]]) -> int:
    return sum(len(units) for units in data.values())


def build_enemy_validation_report(
    *,
    current_data: Dict[str, Any],
    wiki_sidecar: Dict[str, Any],
    current_path: Path,
    wiki_path: Path,
    refresh_rules: Dict[str, Any] | None = None,
    refresh_rules_path: Path | None = None,
) -> Dict[str, Any]:
    current_factions = filter_enemy_factions(current_data)
    wiki_factions = filter_enemy_factions(wiki_sidecar)
    review_queue = create_review_queue("enemy-anatomy")

    category_refs: Dict[str, list[Dict[str, str]]] = {
        "missing_from_wiki": [],
        "missing_from_enemydata": [],
        "unit_health_mismatches": [],
        "units_with_missing_zone_groups": [],
        "units_with_extra_zone_groups": [],
        "units_with_zone_name_differences": [],
        "units_with_zone_field_mismatches": [],
        "units_with_zone_passthrough_mismatches": [],
        "units_with_zone_group_count_differences": [],
    }

    missing_zone_group_count = 0
    extra_zone_group_count = 0
    zone_name_difference_count = 0
    zone_field_mismatch_count = 0
    zone_passthrough_mismatch_count = 0
    zone_group_count_difference_count = 0
    overlapping_unit_count = 0
    units_with_any_difference_count = 0
    refresh_rule_matched_unit_count = 0
    refresh_rule_classification_counts: Counter[str] = Counter()

    factions_report: Dict[str, Any] = OrderedDict()

    for faction in sorted(set(current_factions) | set(wiki_factions)):
        current_units = current_factions.get(faction, {})
        wiki_units = wiki_factions.get(faction, {})

        missing_from_wiki = sorted(set(current_units) - set(wiki_units))
        missing_from_enemydata = sorted(set(wiki_units) - set(current_units))
        overlapping_units = sorted(set(current_units) & set(wiki_units))
        overlapping_unit_count += len(overlapping_units)

        unit_differences: Dict[str, Any] = OrderedDict()

        for unit_name in overlapping_units:
            current_unit = current_units[unit_name]
            wiki_unit = wiki_units[unit_name]
            if not isinstance(current_unit, dict) or not isinstance(wiki_unit, dict):
                if current_unit == wiki_unit:
                    continue
                unit_differences[unit_name] = {
                    "categories": ["payload-shape-mismatch"],
                    "current": {
                        "payload": current_unit,
                    },
                    "wiki": {
                        "payload": wiki_unit,
                    },
                }
                add_review_queue_item(
                    review_queue,
                    "curated_review",
                    {
                        "item_type": "enemy-payload-shape-mismatch",
                        "faction": faction,
                        "unit_name": unit_name,
                        "reason": "Current and wiki payloads have different JSON shapes.",
                    },
                )
                units_with_any_difference_count += 1
                continue

            difference = build_enemy_unit_difference(current_unit, wiki_unit)
            if not difference:
                continue

            refresh_rule = get_unit_refresh_rule(refresh_rules, faction, unit_name)
            refresh_classification = classify_unit_refresh_changes(
                current_unit,
                wiki_unit,
                refresh_rule,
            )
            if refresh_classification:
                difference["refresh_rule_classification"] = refresh_classification
                refresh_rule_matched_unit_count += 1
                refresh_rule_classification_counts.update(refresh_classification["summary"])
                add_enemy_refresh_queue_entries(
                    review_queue,
                    faction=faction,
                    unit_name=unit_name,
                    refresh_classification=refresh_classification,
                )
            else:
                add_review_queue_item(
                    review_queue,
                    "curated_review",
                    {
                        "item_type": "enemy-unit-difference",
                        "faction": faction,
                        "unit_name": unit_name,
                        "categories": difference.get("categories"),
                        "reason": "No refresh rule classified this unit difference.",
                    },
                )

            unit_differences[unit_name] = difference
            units_with_any_difference_count += 1
            ref = compact_unit_ref(faction, unit_name)

            if "unit-health-mismatch" in difference["categories"]:
                category_refs["unit_health_mismatches"].append(ref)
            if "missing-zone-groups" in difference["categories"]:
                category_refs["units_with_missing_zone_groups"].append(ref)
                missing_zone_group_count += len(difference["missing_zone_groups"])
            if "extra-zone-groups" in difference["categories"]:
                category_refs["units_with_extra_zone_groups"].append(ref)
                extra_zone_group_count += len(difference["extra_zone_groups"])
            if "zone-name-differences" in difference["categories"]:
                category_refs["units_with_zone_name_differences"].append(ref)
                zone_name_difference_count += len(difference["zone_name_differences"])
            if "zone-field-mismatches" in difference["categories"]:
                category_refs["units_with_zone_field_mismatches"].append(ref)
                zone_field_mismatch_count += len(difference["zone_field_mismatches"])
            if "zone-passthrough-mismatches" in difference["categories"]:
                category_refs["units_with_zone_passthrough_mismatches"].append(ref)
                zone_passthrough_mismatch_count += len(difference["zone_passthrough_mismatches"])
            if "zone-group-count-differences" in difference["categories"]:
                category_refs["units_with_zone_group_count_differences"].append(ref)
                zone_group_count_difference_count += len(difference["zone_group_count_differences"])

        for unit_name in missing_from_wiki:
            category_refs["missing_from_wiki"].append(compact_unit_ref(faction, unit_name))
            add_review_queue_item(
                review_queue,
                "source_gap",
                {
                    "item_type": "enemy-missing-from-wiki",
                    "faction": faction,
                    "unit_name": unit_name,
                    "reason": "Checked-in enemydata has no matching wiki sidecar unit.",
                },
            )
        for unit_name in missing_from_enemydata:
            category_refs["missing_from_enemydata"].append(compact_unit_ref(faction, unit_name))
            add_review_queue_item(
                review_queue,
                "curated_review",
                {
                    "item_type": "enemy-missing-from-enemydata",
                    "faction": faction,
                    "unit_name": unit_name,
                    "reason": "Wiki sidecar has a unit that is not in checked-in enemydata.",
                },
            )

        if missing_from_wiki or missing_from_enemydata or unit_differences:
            factions_report[faction] = {
                "summary": {
                    "current_unit_count": len(current_units),
                    "wiki_unit_count": len(wiki_units),
                    "overlapping_unit_count": len(overlapping_units),
                    "missing_from_wiki_count": len(missing_from_wiki),
                    "missing_from_enemydata_count": len(missing_from_enemydata),
                    "changed_unit_count": len(unit_differences),
                },
            }
            if missing_from_wiki:
                factions_report[faction]["missing_from_wiki"] = missing_from_wiki
            if missing_from_enemydata:
                factions_report[faction]["missing_from_enemydata"] = missing_from_enemydata
            if unit_differences:
                factions_report[faction]["units"] = unit_differences

    review_queue = finalize_review_queue(review_queue)

    return {
        "metadata": {
            "tool": r"tools\build_wikigg_validation_reports.py",
            "domain": "enemy-anatomy",
            "generated_at": current_timestamp(),
            "inputs": {
                "current_enemydata_path": str(current_path),
                "wiki_sidecar_path": str(wiki_path),
            },
            "wiki_sidecar_metadata": {
                key: value
                for key, value in wiki_sidecar.items()
                if str(key).startswith("__")
            },
            "enemy_refresh_rules": {
                "enabled": bool(refresh_rules),
                "path": str(refresh_rules_path or DEFAULT_ENEMY_RULES_PATH) if refresh_rules else None,
                "mode": "report-only",
            },
        },
        "summary": {
            "current_unit_count": count_enemy_units(current_factions),
            "wiki_unit_count": count_enemy_units(wiki_factions),
            "overlapping_unit_count": overlapping_unit_count,
            "missing_from_wiki_count": len(category_refs["missing_from_wiki"]),
            "missing_from_enemydata_count": len(category_refs["missing_from_enemydata"]),
            "units_with_any_difference_count": units_with_any_difference_count,
            "unit_health_mismatch_count": len(category_refs["unit_health_mismatches"]),
            "units_with_missing_zone_groups_count": len(category_refs["units_with_missing_zone_groups"]),
            "missing_zone_group_count": missing_zone_group_count,
            "units_with_extra_zone_groups_count": len(category_refs["units_with_extra_zone_groups"]),
            "extra_zone_group_count": extra_zone_group_count,
            "units_with_zone_name_differences_count": len(category_refs["units_with_zone_name_differences"]),
            "zone_name_difference_count": zone_name_difference_count,
            "units_with_zone_field_mismatches_count": len(category_refs["units_with_zone_field_mismatches"]),
            "zone_field_mismatch_count": zone_field_mismatch_count,
            "units_with_zone_passthrough_mismatches_count": len(category_refs["units_with_zone_passthrough_mismatches"]),
            "zone_passthrough_mismatch_count": zone_passthrough_mismatch_count,
            "units_with_zone_group_count_differences_count": len(
                category_refs["units_with_zone_group_count_differences"]
            ),
            "zone_group_count_difference_count": zone_group_count_difference_count,
            "refresh_rule_matched_unit_count": refresh_rule_matched_unit_count,
            "refresh_rule_classification_counts": dict(
                sorted(refresh_rule_classification_counts.items())
            ),
            "review_queue_counts": review_queue["summary"]["buckets"],
        },
        "categories": category_refs,
        "factions": factions_report,
        "review_queue": review_queue,
    }


def normalize_number_like(value: Any) -> int | float | None:
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(",", "")
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


def normalize_attack_field(field: str, value: Any) -> Any:
    if field in ATTACK_NUMERIC_FIELDS:
        return normalize_number_like(value)
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if field == "Status":
        return " • ".join(part.strip() for part in text.split("•") if part.strip())
    return text


def diff_attack_projection_to_row(
    projection: Mapping[str, Any],
    row: Mapping[str, Any],
) -> Dict[str, Any]:
    changes: Dict[str, Any] = {}
    for field in ATTACK_VALIDATION_FIELDS:
        wiki_value = normalize_attack_field(field, projection.get(field))
        csv_value = normalize_attack_field(field, row.get(field))
        if wiki_value == csv_value:
            continue
        changes[field] = {
            "wiki": wiki_value,
            "csv": csv_value,
        }
    return changes


def build_attack_match_basis(projection: Mapping[str, Any], row: Mapping[str, Any]) -> list[str]:
    basis: list[str] = []
    if normalize_code_key(projection.get("Code")) and normalize_code_key(projection.get("Code")) == normalize_code_key(row.get("Code")):
        basis.append("code")
    if normalize_name_key(projection.get("Name")) and normalize_name_key(projection.get("Name")) == normalize_name_key(row.get("Name")):
        basis.append("name")
    if (
        str(projection.get("Atk Type") or "").strip().lower()
        and str(projection.get("Atk Type") or "").strip().lower()
        == str(row.get("Atk Type") or "").strip().lower()
    ):
        basis.append("attack-type")
    if (
        normalize_attack_name_key(projection.get("Atk Name"))
        and normalize_attack_name_key(projection.get("Atk Name"))
        == normalize_attack_name_key(row.get("Atk Name"))
    ):
        basis.append("attack-name")
    return basis


def classify_naming_only_candidate(
    record: Mapping[str, Any],
    csv_row: Any,
) -> Dict[str, Any] | None:
    projection = record.get("csv_projection") or {}
    differences = diff_attack_projection_to_row(projection, csv_row.row)
    if not differences:
        return None

    identifier_differences = {
        field: differences[field]
        for field in differences
        if field in ATTACK_IDENTIFIER_FIELDS
    }
    non_identifier_differences = {
        field: differences[field]
        for field in differences
        if field not in ATTACK_IDENTIFIER_FIELDS
    }
    if non_identifier_differences or not identifier_differences:
        return None

    basis = build_attack_match_basis(projection, csv_row.row)
    confidence = "high"
    if "attack-type" not in basis and "code" not in basis and "name" not in basis:
        confidence = "medium"
    elif set(identifier_differences) == {"Atk Type"}:
        confidence = "medium"

    return {
        "line_number": csv_row.line_number,
        "candidate_basis": basis,
        "confidence": confidence,
        "identifier_difference_fields": sorted(identifier_differences),
        "identifier_differences": identifier_differences,
        "matching_fields": [
            field
            for field in ATTACK_VALIDATION_FIELDS
            if field not in differences
        ],
        "csv_row": csv_row.row,
    }


def entity_lookup_keys(name: str, entity_id: str | None) -> list[str]:
    full_key = entity_identity(name, entity_id)
    name_only_key = entity_identity(name, None)
    if full_key == name_only_key:
        return [full_key]
    return [full_key, name_only_key]


def build_attack_entity_universe(
    ingest_report: Dict[str, Any],
    records: list[Dict[str, Any]],
    unresolved: list[Dict[str, Any]],
) -> list[Dict[str, Any]]:
    entities: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()

    def upsert(
        *,
        name: str,
        entity_id: str | None,
        resolved_ids: Iterable[str] | None = None,
        loadout_wep: str | None = None,
    ) -> None:
        key = entity_identity(name, entity_id)
        entry = entities.setdefault(
            key,
            {
                "name": name,
                "id": entity_id,
                "resolved_ids": [],
                "loadout_wep": loadout_wep,
            },
        )
        if entity_id and not entry.get("id"):
            entry["id"] = entity_id
        if loadout_wep and not entry.get("loadout_wep"):
            entry["loadout_wep"] = loadout_wep
        entry["resolved_ids"] = unique_list(
            [
                *entry.get("resolved_ids", []),
                *list(resolved_ids or []),
                entity_id,
            ]
        )

    for item in ingest_report.get("coverage", {}).get("by_stratagem") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        resolved_ids = [
            str(value).strip()
            for value in (item.get("resolved_ids") or [])
            if str(value).strip()
        ]
        upsert(
            name=name,
            entity_id=str(item.get("id") or "").strip() or None,
            resolved_ids=resolved_ids,
            loadout_wep=str(item.get("loadout_wep") or "").strip() or None,
        )

    for record in records:
        entity = record.get("entity") or {}
        name = str(entity.get("name") or "").strip()
        if not name:
            continue
        resolved_ids = [
            str(value).strip()
            for value in (entity.get("resolved_ids") or [])
            if str(value).strip()
        ]
        upsert(
            name=name,
            entity_id=str(entity.get("id") or "").strip() or None,
            resolved_ids=resolved_ids,
            loadout_wep=str(entity.get("loadout_wep") or "").strip() or None,
        )

    for item in unresolved:
        name = str(item.get("entity_name") or "").strip()
        if not name:
            continue
        upsert(
            name=name,
            entity_id=str(item.get("entity_id") or "").strip() or None,
            resolved_ids=[],
            loadout_wep=str(item.get("loadout_wep") or "").strip() or None,
        )

    return list(entities.values())


def weapon_rule_context(rules: WeaponRefreshRules | None) -> Dict[str, Any]:
    if not rules:
        return {
            "enabled": False,
            "mode": "report-only",
        }
    return {
        "enabled": True,
        "path": str(rules.source_path) if rules.source_path else None,
        "mode": "report-only",
        "review_required": list(rules.review_required),
        "manual_grouping": list(rules.manual_grouping),
        "falloff_report_only": {
            "alias_count": len(rules.falloff_name_aliases),
            "exclusions": list(rules.falloff_exclusions),
            "preview_tool": r"tools\weapon_refresh_rules.py",
        },
    }


def build_rule_match_details(record: Mapping[str, Any], comparison: Mapping[str, Any]) -> Dict[str, Any]:
    expanded = comparison.get("rule_expanded_keys") or {}
    projection = record.get("csv_projection") or {}
    if not expanded:
        return {
            "exact_row_syncs": [],
            "alias_fields": [],
        }

    expected_keys = {
        "code_keys": [normalize_code_key(projection.get("Code"))],
        "name_keys": [normalize_name_key(projection.get("Name"))],
        "attack_type_keys": [str(projection.get("Atk Type") or "").strip().lower()],
        "attack_name_keys": [normalize_attack_name_key(projection.get("Atk Name"))],
    }
    alias_fields = []
    for key, raw_values in expected_keys.items():
        expected = {value for value in raw_values if value}
        actual = {
            str(value)
            for value in (expanded.get(key) or [])
            if str(value)
        }
        if actual - expected:
            alias_fields.append(key.removesuffix("_keys"))

    return {
        "exact_row_syncs": expanded.get("exact_row_syncs") or [],
        "alias_fields": sorted(alias_fields),
    }


def add_weapon_rule_context_queue_items(
    review_queue: Dict[str, Any],
    rules: WeaponRefreshRules | None,
) -> None:
    if not rules:
        return
    if rules.falloff_name_aliases or rules.falloff_exclusions:
        add_review_queue_item(
            review_queue,
            "curated_review",
            {
                "item_type": "falloff-report-only",
                "reason": "Falloff refresh rules require the separate report-only preview before editing falloff CSV data.",
                "alias_count": len(rules.falloff_name_aliases),
                "exclusions": rules.falloff_exclusions,
                "preview_tool": r"tools\weapon_refresh_rules.py",
            },
        )
    if rules.manual_grouping:
        add_review_queue_item(
            review_queue,
            "blocked",
            {
                "item_type": "weapon-manual-grouping-rules",
                "reason": "Manual grouping rules describe rows that must not be blindly auto-synced.",
                "notes": rules.manual_grouping,
            },
        )


def build_attack_validation_report(
    *,
    ingest_report: Dict[str, Any],
    ingest_path: Path,
    csv_path: Path,
    rules: WeaponRefreshRules | None = None,
) -> Dict[str, Any]:
    csv_indexes = build_csv_indexes(load_csv_rows(csv_path))
    rows_by_line = {row.line_number: row for row in csv_indexes["rows"]}
    review_queue = create_review_queue("stratagem-attacks")
    review_queue["rule_context"] = weapon_rule_context(rules)
    add_weapon_rule_context_queue_items(review_queue, rules)
    records = [
        record
        for record in (ingest_report.get("records") or [])
        if isinstance(record, dict)
    ]
    unresolved = [
        item
        for item in (ingest_report.get("unresolved_references") or [])
        if isinstance(item, dict)
    ]

    comparisons: Dict[str, Dict[str, Any]] = {}
    matched_line_numbers: set[int] = set()
    records_by_entity: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    unresolved_by_entity: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)

    for record in records:
        record_id = str(record.get("record_id") or "").strip()
        if not record_id:
            continue
        comparison = compare_record_to_csv(record, csv_indexes, rules)
        comparisons[record_id] = comparison
        matched_line_numbers.update(comparison["csv_row_numbers"])

        entity = record.get("entity") or {}
        entity_name = str(entity.get("name") or "").strip()
        entity_id = str(entity.get("id") or "").strip() or None
        for key in entity_lookup_keys(entity_name, entity_id):
            records_by_entity[key][record_id] = record

    for index, item in enumerate(unresolved):
        item_key = f"u{index}"
        entity_name = str(item.get("entity_name") or "").strip()
        entity_id = str(item.get("entity_id") or "").strip() or None
        for key in entity_lookup_keys(entity_name, entity_id):
            unresolved_by_entity[key][item_key] = item

    matched_records: list[Dict[str, Any]] = []
    records_with_projection_differences: list[Dict[str, Any]] = []
    possible_naming_only_mismatches: list[Dict[str, Any]] = []
    wiki_records_missing_from_csv: list[Dict[str, Any]] = []
    candidate_row_to_record_ids: Dict[int, set[str]] = defaultdict(set)

    for record in records:
        record_id = str(record.get("record_id") or "").strip()
        if not record_id:
            continue
        comparison = comparisons[record_id]
        base_record = {
            "record_id": record_id,
            "entity_name": record.get("entity", {}).get("name"),
            "entity_id": record.get("entity", {}).get("id"),
            "attack_type": record.get("attack", {}).get("type"),
            "attack_name": record.get("attack", {}).get("name"),
            "match_kind": comparison.get("match_kind"),
            "csv_row_numbers": comparison.get("csv_row_numbers", []),
            "candidate_row_numbers": comparison.get("candidate_row_numbers", []),
        }
        rule_match_details = build_rule_match_details(record, comparison)
        status_rewrite_actions = [
            action
            for action in (record.get("statuses", {}) or {}).get("rewrite_actions", [])
            if isinstance(action, dict)
        ]
        if status_rewrite_actions:
            add_review_queue_item(
                review_queue,
                "safe_sync",
                {
                    **base_record,
                    "item_type": "weapon-status-rewrite",
                    "reason": "Weapon refresh rules rewrote source status names in the report projection.",
                    "status_rewrite_actions": status_rewrite_actions,
                },
            )

        if comparison.get("matched"):
            matched_records.append(base_record)
            row_differences = []
            for line_number in comparison.get("csv_row_numbers", []):
                csv_row = rows_by_line[line_number]
                field_mismatches = diff_attack_projection_to_row(
                    record.get("csv_projection") or {},
                    csv_row.row,
                )
                if not field_mismatches:
                    continue
                row_differences.append(
                    {
                        "line_number": line_number,
                        "field_mismatches": field_mismatches,
                        "csv_row": csv_row.row,
                    }
                )
            if row_differences and len(row_differences) == len(comparison.get("csv_row_numbers", [])):
                field_difference_fields = sorted(
                    {
                        field
                        for row_difference in row_differences
                        for field in row_difference["field_mismatches"]
                    }
                )
                records_with_projection_differences.append(
                    {
                        **base_record,
                        "field_difference_fields": field_difference_fields,
                        "matched_rows": row_differences,
                    }
                )
                review_bucket = "curated_review"
                review_item_type = "weapon-projection-difference"
                review_reason = "Matched wiki attack projection differs from the checked-in CSV row."
                if rule_match_details["exact_row_syncs"] and not (
                    set(field_difference_fields) - ATTACK_IDENTIFIER_FIELDS
                ):
                    review_bucket = "safe_sync"
                    review_item_type = "weapon-exact-row-sync"
                    review_reason = (
                        "Weapon refresh rules matched this wiki projection to an exact reviewed CSV target."
                    )
                elif rule_match_details["alias_fields"] and not (
                    set(field_difference_fields) - ATTACK_IDENTIFIER_FIELDS
                ):
                    review_item_type = "weapon-alias-driven-match"
                    review_reason = (
                        "Weapon refresh aliases matched this row; review before applying source changes."
                    )
                add_review_queue_item(
                    review_queue,
                    review_bucket,
                    {
                        **base_record,
                        "item_type": review_item_type,
                        "reason": review_reason,
                        "field_difference_fields": field_difference_fields,
                        "rule_match_details": rule_match_details,
                    },
                )
            elif rule_match_details["exact_row_syncs"]:
                add_review_queue_item(
                    review_queue,
                    "safe_sync",
                    {
                        **base_record,
                        "item_type": "weapon-exact-row-sync",
                        "reason": "Weapon refresh rules matched this wiki projection to an exact reviewed CSV target.",
                        "rule_match_details": rule_match_details,
                    },
                )
            elif rule_match_details["alias_fields"]:
                add_review_queue_item(
                    review_queue,
                    "curated_review",
                    {
                        **base_record,
                        "item_type": "weapon-alias-driven-match",
                        "reason": "Weapon refresh aliases matched this row; review before applying source changes.",
                        "rule_match_details": rule_match_details,
                    },
                )
            else:
                add_review_queue_item(
                    review_queue,
                    "safe_sync",
                    {
                        **base_record,
                        "item_type": "weapon-exact-match",
                        "reason": "Wiki projection already matches the checked-in CSV row.",
                    },
                )
            continue

        naming_candidates = []
        for line_number in comparison.get("candidate_row_numbers", []):
            csv_row = rows_by_line[line_number]
            candidate = classify_naming_only_candidate(record, csv_row)
            if candidate is None:
                continue
            naming_candidates.append(candidate)
            candidate_row_to_record_ids[line_number].add(record_id)

        unmatched_entry = {
            **base_record,
            "csv_projection": record.get("csv_projection"),
            "comparison": comparison,
            "probable_reason": (
                "possible-naming-only-mismatch"
                if naming_candidates
                else (
                    "candidate-rows-with-stat-differences"
                    if comparison.get("candidate_row_numbers")
                    else "no-candidate-rows"
                )
            ),
        }
        if naming_candidates:
            unmatched_entry["naming_only_candidates"] = naming_candidates
            possible_naming_only_mismatches.append(
                {
                    **base_record,
                    "naming_only_candidates": naming_candidates,
                }
            )
            add_review_queue_item(
                review_queue,
                "curated_review",
                {
                    **base_record,
                    "item_type": "weapon-possible-naming-only-mismatch",
                    "reason": "A candidate CSV row differs only by identifier fields.",
                    "candidate_line_numbers": [
                        candidate["line_number"]
                        for candidate in naming_candidates
                    ],
                    "rule_match_details": rule_match_details,
                },
            )
        else:
            add_review_queue_item(
                review_queue,
                "blocked" if not comparison.get("candidate_row_numbers") else "curated_review",
                {
                    **base_record,
                    "item_type": "weapon-wiki-record-missing-from-csv",
                    "reason": unmatched_entry["probable_reason"],
                    "rule_match_details": rule_match_details,
                },
            )
        wiki_records_missing_from_csv.append(unmatched_entry)

    entity_status_buckets: Dict[str, list[Dict[str, Any]]] = {
        status: []
        for status in ATTACK_ENTITY_STATUS_ORDER
    }
    entity_summaries: list[Dict[str, Any]] = []
    unresolved_entities: list[Dict[str, Any]] = []

    for entity in build_attack_entity_universe(ingest_report, records, unresolved):
        entity_name = entity["name"]
        entity_id = entity.get("id")
        record_map: Dict[str, Dict[str, Any]] = {}
        unresolved_map: Dict[str, Dict[str, Any]] = {}

        for key in entity_lookup_keys(entity_name, entity_id):
            record_map.update(records_by_entity.get(key, {}))
            unresolved_map.update(unresolved_by_entity.get(key, {}))

        entity_records = list(record_map.values())
        entity_unresolved = list(unresolved_map.values())
        resolved_ids = unique_list(
            [
                *entity.get("resolved_ids", []),
                *[
                    resolved_id
                    for record in entity_records
                    for resolved_id in (record.get("entity", {}).get("resolved_ids") or [])
                    if resolved_id
                ],
                entity_id,
            ]
        )
        csv_rows = build_entity_csv_rows(
            entity_name=entity_name,
            entity_id=entity_id,
            resolved_ids=[str(value) for value in resolved_ids if value],
            csv_indexes=csv_indexes,
            rules=rules,
        )
        matched_csv_rows = sorted(
            {
                line_number
                for record in entity_records
                for line_number in comparisons.get(str(record.get("record_id") or ""), {}).get(
                    "csv_row_numbers",
                    [],
                )
            }
        )
        matched_record_count = sum(
            1
            for record in entity_records
            if comparisons.get(str(record.get("record_id") or ""), {}).get("matched")
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
            "id": entity_id,
            "resolved_ids": [str(value) for value in resolved_ids if value],
            "loadout_wep": entity.get("loadout_wep"),
            "wiki_record_count": len(entity_records),
            "matched_record_count": matched_record_count,
            "csv_row_count": len(csv_rows),
            "matched_csv_row_count": len(matched_csv_rows),
            "csv_row_numbers": [csv_row.line_number for csv_row in csv_rows],
            "record_ids": sorted(
                str(record.get("record_id") or "")
                for record in entity_records
                if str(record.get("record_id") or "")
            ),
            "status": status,
            "unresolved_reasons": unique_list(
                [item.get("reason") for item in entity_unresolved if item.get("reason")]
            ),
            "unresolved_reference_count": len(entity_unresolved),
        }
        entity_summaries.append(summary)
        entity_status_buckets[status].append(compact_entity_ref(summary))

        if len(entity_records) == 0 and entity_unresolved:
            unresolved_entities.append(
                {
                    "name": entity_name,
                    "id": entity_id,
                    "loadout_wep": entity.get("loadout_wep"),
                    "status": status,
                    "reason": summary["unresolved_reasons"][0] if summary["unresolved_reasons"] else None,
                    "unresolved_reasons": summary["unresolved_reasons"],
                    "csv_row_count": len(csv_rows),
                    "csv_row_numbers": summary["csv_row_numbers"],
                }
            )

    csv_rows_missing_from_wiki = []
    for csv_row in csv_indexes["rows"]:
        if csv_row.line_number in matched_line_numbers:
            continue
        candidate_record_ids = sorted(candidate_row_to_record_ids.get(csv_row.line_number, set()))
        csv_rows_missing_from_wiki.append(
            {
                "line_number": csv_row.line_number,
                "row": csv_row.row,
                "candidate_record_ids": candidate_record_ids,
                "probable_reason": (
                    "possible-naming-only-mismatch"
                    if candidate_record_ids
                    else "no-wiki-record"
                ),
            }
        )
        add_review_queue_item(
            review_queue,
            "curated_review" if candidate_record_ids else "source_gap",
            {
                "item_type": "weapon-csv-row-missing-from-wiki",
                "line_number": csv_row.line_number,
                "candidate_record_ids": candidate_record_ids,
                "reason": (
                    "possible-naming-only-mismatch"
                    if candidate_record_ids
                    else "no-wiki-record"
                ),
                "row": csv_row.row,
            },
        )

    unresolved_references_by_reason: Dict[str, list[Dict[str, Any]]] = OrderedDict()
    for reason in sorted(
        {
            str(item.get("reason") or "unknown")
            for item in unresolved
        }
    ):
        unresolved_references_by_reason[reason] = [
            item
            for item in unresolved
            if str(item.get("reason") or "unknown") == reason
        ]
        for item in unresolved_references_by_reason[reason]:
            add_review_queue_item(
                review_queue,
                "source_gap",
                {
                    "item_type": "weapon-unresolved-reference",
                    "entity_name": item.get("entity_name"),
                    "entity_id": item.get("entity_id"),
                    "ref_type": item.get("ref_type"),
                    "ref_name": item.get("ref_name"),
                    "reason": reason,
                },
            )

    review_queue = finalize_review_queue(review_queue)

    return {
        "metadata": {
            "tool": r"tools\build_wikigg_validation_reports.py",
            "domain": "stratagem-attacks",
            "generated_at": current_timestamp(),
            "inputs": {
                "attack_ingest_report_path": str(ingest_path),
                "current_weapon_csv_path": str(csv_path),
            },
            "weapon_refresh_rules": {
                "enabled": bool(rules),
                "path": str(rules.source_path) if rules and rules.source_path else None,
                "mode": "report-only",
            },
            "source_ingest_metadata": canonicalize_value(ingest_report.get("metadata") or {}),
        },
        "summary": {
            "wiki_record_count": len(records),
            "matched_record_count": len(matched_records),
            "unmatched_record_count": len(wiki_records_missing_from_csv),
            "projection_mismatch_record_count": len(records_with_projection_differences),
            "possible_naming_only_mismatch_count": len(possible_naming_only_mismatches),
            "csv_row_count": len(csv_indexes["rows"]),
            "matched_csv_row_count": len(matched_line_numbers),
            "csv_rows_missing_from_wiki_count": len(csv_rows_missing_from_wiki),
            "entity_count": len(entity_summaries),
            "entity_status_counts": {
                status: len(entity_status_buckets[status])
                for status in ATTACK_ENTITY_STATUS_ORDER
            },
            "unresolved_reference_count": len(unresolved),
            "unresolved_entity_count": len(unresolved_entities),
            "review_queue_counts": review_queue["summary"]["buckets"],
        },
        "categories": {
            "matched_records": matched_records,
            "records_with_projection_differences": records_with_projection_differences,
            "possible_naming_only_mismatches": possible_naming_only_mismatches,
            "wiki_records_missing_from_csv": wiki_records_missing_from_csv,
            "csv_rows_missing_from_wiki": csv_rows_missing_from_wiki,
            "entities_by_status": entity_status_buckets,
            "unresolved_references_by_reason": unresolved_references_by_reason,
            "unresolved_entities": unresolved_entities,
        },
        "entities": entity_summaries,
        "review_queue": review_queue,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build machine-readable validation reports that compare wiki.gg ingest "
            "artifacts against checked-in enemy and stratagem datasets."
        ),
    )
    parser.add_argument(
        "--enemy-sidecar",
        default=str(DEFAULT_ENEMY_SIDECAR_PATH),
        help="Path to the wiki.gg enemy anatomy sidecar JSON input.",
    )
    parser.add_argument(
        "--enemy-current",
        default=str(DEFAULT_CURRENT_ENEMY_PATH),
        help="Path to the checked-in enemies\\enemydata.json input.",
    )
    parser.add_argument(
        "--attack-ingest",
        default=str(DEFAULT_ATTACK_INGEST_PATH),
        help="Path to the wiki.gg stratagem attack ingest JSON input.",
    )
    parser.add_argument(
        "--attack-csv",
        default=str(DEFAULT_ATTACK_CSV_PATH),
        help="Path to the checked-in weapons\\weapondata.csv input.",
    )
    parser.add_argument(
        "--rules",
        default=str(DEFAULT_WEAPON_RULES_PATH),
        help="Path to tools\\weapon-refresh-rules.json for report-only weapon refresh aliases.",
    )
    parser.add_argument(
        "--no-rules",
        action="store_true",
        help="Disable weapon refresh rules for attack validation report classification.",
    )
    parser.add_argument(
        "--enemy-rules",
        default=str(DEFAULT_ENEMY_RULES_PATH),
        help="Path to enemies\\enemy-refresh-rules.json for report-only enemy refresh classification.",
    )
    parser.add_argument(
        "--no-enemy-rules",
        action="store_true",
        help="Disable enemy refresh rules for enemy validation report classification.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory used for default output report paths.",
    )
    parser.add_argument(
        "--enemy-output",
        help="Optional explicit output path for the enemy anatomy validation report.",
    )
    parser.add_argument(
        "--attack-output",
        help="Optional explicit output path for the stratagem attack validation report.",
    )
    parser.add_argument(
        "--index-output",
        help="Optional explicit output path for the manifest/index report.",
    )
    parser.add_argument(
        "--skip-enemy",
        action="store_true",
        help="Skip generating the enemy anatomy validation report.",
    )
    parser.add_argument(
        "--skip-attacks",
        action="store_true",
        help="Skip generating the stratagem attack validation report.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.skip_enemy and args.skip_attacks:
        raise SystemExit("Nothing to do: both --skip-enemy and --skip-attacks were supplied.")

    output_dir = Path(args.output_dir.strip()).resolve()
    enemy_output_path = (
        Path(args.enemy_output.strip()).resolve()
        if args.enemy_output
        else output_dir / DEFAULT_ENEMY_OUTPUT_NAME
    )
    attack_output_path = (
        Path(args.attack_output.strip()).resolve()
        if args.attack_output
        else output_dir / DEFAULT_ATTACK_OUTPUT_NAME
    )
    index_output_path = (
        Path(args.index_output.strip()).resolve()
        if args.index_output
        else output_dir / DEFAULT_INDEX_OUTPUT_NAME
    )

    manifest: Dict[str, Any] = {
        "metadata": {
            "tool": r"tools\build_wikigg_validation_reports.py",
            "generated_at": current_timestamp(),
            "output_dir": str(output_dir),
        },
        "reports": {},
    }
    generated_reports: Dict[str, Any] = {}

    if not args.skip_enemy:
        current_enemy_path = Path(args.enemy_current.strip()).resolve()
        enemy_sidecar_path = Path(args.enemy_sidecar.strip()).resolve()
        if not current_enemy_path.exists():
            raise SystemExit(f"Current enemy data file not found: {current_enemy_path}")
        if not enemy_sidecar_path.exists():
            raise SystemExit(f"Wiki enemy sidecar file not found: {enemy_sidecar_path}")
        enemy_rules = None
        enemy_rules_path = None
        if not args.no_enemy_rules:
            enemy_rules_path = Path(args.enemy_rules.strip()).resolve()
            if not enemy_rules_path.exists():
                raise SystemExit(f"Enemy refresh rules file not found: {enemy_rules_path}")
            try:
                enemy_rules = load_enemy_refresh_rules(enemy_rules_path)
            except ValueError as error:
                raise SystemExit(str(error)) from error

        enemy_report = build_enemy_validation_report(
            current_data=load_json(current_enemy_path),
            wiki_sidecar=load_json(enemy_sidecar_path),
            current_path=current_enemy_path,
            wiki_path=enemy_sidecar_path,
            refresh_rules=enemy_rules,
            refresh_rules_path=enemy_rules_path,
        )
        write_json(enemy_output_path, enemy_report)
        manifest["reports"]["enemy_anatomy"] = {
            "output_path": str(enemy_output_path),
            "summary": enemy_report["summary"],
            "review_queue": review_queue_summary(enemy_report.get("review_queue")),
        }
        generated_reports["enemy_anatomy"] = enemy_report
        print(
            "Enemy summary:",
            f"current={enemy_report['summary']['current_unit_count']}",
            f"wiki={enemy_report['summary']['wiki_unit_count']}",
            f"missing_wiki={enemy_report['summary']['missing_from_wiki_count']}",
            f"missing_enemydata={enemy_report['summary']['missing_from_enemydata_count']}",
            f"changed={enemy_report['summary']['units_with_any_difference_count']}",
        )
        print(f"Wrote enemy report to {enemy_output_path}")

    if not args.skip_attacks:
        attack_ingest_path = Path(args.attack_ingest.strip()).resolve()
        attack_csv_path = Path(args.attack_csv.strip()).resolve()
        if not attack_ingest_path.exists():
            raise SystemExit(f"Attack ingest report not found: {attack_ingest_path}")
        if not attack_csv_path.exists():
            raise SystemExit(f"Current weapon CSV file not found: {attack_csv_path}")
        try:
            rules = None if args.no_rules else load_weapon_refresh_rules(Path(args.rules).resolve(), required=True)
        except ValueError as error:
            raise SystemExit(str(error)) from error

        attack_report = build_attack_validation_report(
            ingest_report=load_json(attack_ingest_path),
            ingest_path=attack_ingest_path,
            csv_path=attack_csv_path,
            rules=rules,
        )
        write_json(attack_output_path, attack_report)
        manifest["reports"]["stratagem_attacks"] = {
            "output_path": str(attack_output_path),
            "summary": attack_report["summary"],
            "review_queue": review_queue_summary(attack_report.get("review_queue")),
        }
        generated_reports["stratagem_attacks"] = attack_report
        print(
            "Attack summary:",
            f"records={attack_report['summary']['wiki_record_count']}",
            f"matched={attack_report['summary']['matched_record_count']}",
            f"projection_mismatches={attack_report['summary']['projection_mismatch_record_count']}",
            f"naming_only={attack_report['summary']['possible_naming_only_mismatch_count']}",
            f"csv_only_rows={attack_report['summary']['csv_rows_missing_from_wiki_count']}",
            f"unresolved_refs={attack_report['summary']['unresolved_reference_count']}",
        )
        print(f"Wrote attack report to {attack_output_path}")

    manifest["review_queue"] = aggregate_review_queue_summaries(generated_reports)
    write_json(index_output_path, manifest)
    print(f"Wrote report index to {index_output_path}")


if __name__ == "__main__":
    main()
