#!/usr/bin/env python3
"""Load and apply review rules for enemy-data refresh reports."""

from __future__ import annotations

import fnmatch
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List


DEFAULT_RULES_PATH = Path(__file__).resolve().parents[1] / "enemies" / "enemy-refresh-rules.json"

LIST_FIELD_KEYS = {
    "known_source_lag",
    "locked_fields",
    "manual_review_notes",
    "preferred_source_keys",
    "safe_sync_fields",
}
KNOWN_RULE_KEYS = LIST_FIELD_KEYS | {"notes"}
MISSING = object()


def load_enemy_refresh_rules(path: Path = DEFAULT_RULES_PATH) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    validate_enemy_refresh_rules(data, path)
    return data


def validate_enemy_refresh_rules(data: Dict[str, Any], path: Path | str = "<rules>") -> None:
    if not isinstance(data, dict):
        raise ValueError(f"Expected top-level object in {path}")

    rules = data.get("rules")
    if not isinstance(rules, dict):
        raise ValueError(f"Expected object at rules in {path}")

    for faction, units in rules.items():
        if not isinstance(faction, str) or not faction:
            raise ValueError(f"Expected non-empty faction name in {path}")
        if not isinstance(units, dict):
            raise ValueError(f"Expected unit-rule object for faction {faction!r} in {path}")

        for unit_name, rule in units.items():
            if not isinstance(unit_name, str) or not unit_name:
                raise ValueError(f"Expected non-empty unit name under {faction!r} in {path}")
            if not isinstance(rule, dict):
                raise ValueError(f"Expected object rule for {faction!r} -> {unit_name!r} in {path}")

            unknown_keys = sorted(set(rule) - KNOWN_RULE_KEYS)
            if unknown_keys:
                raise ValueError(
                    f"Unknown refresh rule keys for {faction!r} -> {unit_name!r}: {unknown_keys}"
                )

            for key in LIST_FIELD_KEYS:
                value = rule.get(key, [])
                if not isinstance(value, list):
                    raise ValueError(
                        f"Expected list at {faction!r} -> {unit_name!r} -> {key} in {path}"
                    )

            for key in ("locked_fields", "manual_review_notes", "preferred_source_keys", "safe_sync_fields"):
                for index, value in enumerate(rule.get(key, [])):
                    if not isinstance(value, str) or not value:
                        raise ValueError(
                            f"Expected non-empty string at {faction!r} -> {unit_name!r} -> {key}[{index}]"
                        )

            for index, value in enumerate(rule.get("known_source_lag", [])):
                if not isinstance(value, dict):
                    raise ValueError(
                        f"Expected object at {faction!r} -> {unit_name!r} -> known_source_lag[{index}]"
                    )
                field = value.get("field")
                if not isinstance(field, str) or not field:
                    raise ValueError(
                        f"Expected non-empty field at {faction!r} -> {unit_name!r} -> known_source_lag[{index}]"
                    )
                reason = value.get("reason")
                if reason is not None and (not isinstance(reason, str) or not reason):
                    raise ValueError(
                        f"Expected non-empty reason at {faction!r} -> {unit_name!r} -> known_source_lag[{index}]"
                    )


def get_unit_refresh_rule(
    refresh_rules: Dict[str, Any] | None,
    faction: str,
    unit_name: str,
) -> Dict[str, Any] | None:
    if not refresh_rules:
        return None
    rules = refresh_rules.get("rules")
    if not isinstance(rules, dict):
        return None
    faction_rules = rules.get(faction)
    if not isinstance(faction_rules, dict):
        return None
    rule = faction_rules.get(unit_name)
    return rule if isinstance(rule, dict) else None


def path_matches(pattern: str, field_path: str) -> bool:
    if pattern == field_path:
        return True
    if field_path.startswith(f"{pattern}.") or field_path.startswith(f"{pattern}["):
        return True
    return fnmatch.fnmatchcase(field_path, pattern)


def _zone_selector(zone: Dict[str, Any], index: int) -> str:
    name = zone.get("zone_name")
    if not isinstance(name, str) or not name.strip():
        name = zone.get("source_zone_name")
    if isinstance(name, str) and name.strip():
        return f"zone_name={name.strip()}"
    return f"index={index}"


def _flatten_value(value: Any, prefix: str, flattened: Dict[str, Any]) -> None:
    if isinstance(value, dict):
        for key in sorted(value):
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            _flatten_value(value[key], child_prefix, flattened)
        return

    if isinstance(value, list):
        if prefix == "damageable_zones":
            flattened[f"{prefix}.__count"] = len(value)
            selector_counts: Counter[str] = Counter()
            for index, item in enumerate(value):
                if isinstance(item, dict):
                    selector = _zone_selector(item, index)
                    selector_counts[selector] += 1
                    if selector_counts[selector] > 1:
                        selector = f"{selector}#{selector_counts[selector]}"
                    _flatten_value(item, f"{prefix}[{selector}]", flattened)
                else:
                    flattened[f"{prefix}[index={index}]"] = item
            return

        flattened[prefix] = value
        return

    flattened[prefix] = value


def flatten_unit_fields(unit: Dict[str, Any]) -> Dict[str, Any]:
    flattened: Dict[str, Any] = {}
    _flatten_value(unit, "", flattened)
    return flattened


def _known_source_lag_match(
    entries: Iterable[Dict[str, Any]],
    field_path: str,
    current_value: Any,
    generated_value: Any,
) -> Dict[str, Any] | None:
    for entry in entries:
        if not path_matches(entry["field"], field_path):
            continue
        if "source_value" in entry and generated_value != entry["source_value"]:
            continue
        if "generated_value" in entry and generated_value != entry["generated_value"]:
            continue
        if (
            "curated_value" in entry
            and current_value is not MISSING
            and current_value != entry["curated_value"]
        ):
            continue
        return entry
    return None


def _classify_field_change(
    field_path: str,
    current_value: Any,
    generated_value: Any,
    rule: Dict[str, Any],
) -> Dict[str, Any]:
    known_lag = _known_source_lag_match(
        rule.get("known_source_lag", []),
        field_path,
        current_value,
        generated_value,
    )
    if known_lag is not None:
        return {
            "classification": "known_source_lag",
            "rule_field": known_lag["field"],
            "reason": known_lag.get("reason"),
        }

    for pattern in rule.get("safe_sync_fields", []):
        if path_matches(pattern, field_path):
            return {
                "classification": "safe_sync",
                "rule_field": pattern,
            }

    for pattern in rule.get("locked_fields", []):
        if path_matches(pattern, field_path):
            return {
                "classification": "locked",
                "rule_field": pattern,
            }

    return {
        "classification": "manual_review",
    }


def classify_unit_refresh_changes(
    current_unit: Dict[str, Any],
    generated_unit: Dict[str, Any],
    rule: Dict[str, Any] | None,
) -> Dict[str, Any]:
    if not rule:
        return {}

    current_fields = flatten_unit_fields(current_unit)
    generated_fields = flatten_unit_fields(generated_unit)
    changes: List[Dict[str, Any]] = []
    counts: Counter[str] = Counter()
    by_classification: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for field_path in sorted(set(current_fields) | set(generated_fields)):
        current_value = current_fields.get(field_path, MISSING)
        generated_value = generated_fields.get(field_path, MISSING)
        if current_value == generated_value:
            continue

        classification = _classify_field_change(field_path, current_value, generated_value, rule)
        change: Dict[str, Any] = {
            "field": field_path,
            **{key: value for key, value in classification.items() if value is not None},
        }
        if current_value is not MISSING:
            change["current"] = current_value
        if generated_value is not MISSING:
            change["generated"] = generated_value

        changes.append(change)
        counts[change["classification"]] += 1
        by_classification[change["classification"]].append(change)

    if not changes:
        return {}

    return {
        "safe_sync_fields": rule.get("safe_sync_fields", []),
        "locked_fields": rule.get("locked_fields", []),
        "preferred_source_keys": rule.get("preferred_source_keys", []),
        "manual_review_notes": rule.get("manual_review_notes", []),
        "summary": dict(sorted(counts.items())),
        "field_changes": changes,
        "field_changes_by_classification": dict(sorted(by_classification.items())),
    }
