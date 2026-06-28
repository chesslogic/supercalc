#!/usr/bin/env python3
"""Shared report-first weapon refresh rule helpers.

The helpers in this module intentionally classify and preview matches only.
They do not write runtime weapon CSV datasets.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RULES_PATH = REPO_ROOT / "tools" / "weapon-refresh-rules.json"
DEFAULT_FALLOFF_CSV_PATH = REPO_ROOT / "weapons" / "falloff.csv"
DEFAULT_FALLOFF_ARTIFACT_PATH = (
    REPO_ROOT
    / "tools"
    / "artifacts"
    / "Helldivers II Index - 6.3.0 [UNOFFICIAL] - Falloff.csv"
)
DEFAULT_FALLOFF_REPORT_PATH = REPO_ROOT / "tools" / "artifacts" / "falloff-refresh-preview.json"

ALIAS_SECTIONS = {
    "attack_name_aliases",
    "entity_name_aliases",
    "code_aliases",
    "falloff_name_aliases",
}
LIST_SECTIONS = {
    "exact_row_syncs",
    "falloff_exclusions",
    "review_required",
    "manual_grouping",
}


def compact_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def unique_list(values: Iterable[Any]) -> list[Any]:
    seen: set[str] = set()
    result: list[Any] = []
    for value in values:
        if value in (None, ""):
            continue
        marker = json.dumps(value, sort_keys=True, ensure_ascii=False, default=str)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def _normalize_alias_values(section: str, raw_value: Any) -> list[str]:
    if isinstance(raw_value, str):
        values = [raw_value]
    elif isinstance(raw_value, list):
        values = raw_value
    else:
        raise ValueError(
            f"tools\\weapon-refresh-rules.json section '{section}' values must be strings or string arrays."
        )

    normalized: list[str] = []
    for value in values:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(
                f"tools\\weapon-refresh-rules.json section '{section}' aliases must be non-empty strings."
            )
        normalized.append(value.strip())
    return normalized


def _normalize_alias_section(section: str, raw_section: Any) -> dict[str, list[str]]:
    if raw_section is None:
        return {}
    if not isinstance(raw_section, dict):
        raise ValueError(f"tools\\weapon-refresh-rules.json section '{section}' must be an object.")

    normalized: dict[str, list[str]] = {}
    for raw_key, raw_value in raw_section.items():
        if not isinstance(raw_key, str) or not raw_key.strip():
            raise ValueError(
                f"tools\\weapon-refresh-rules.json section '{section}' keys must be non-empty strings."
            )
        key = raw_key.strip()
        normalized[key] = _normalize_alias_values(section, raw_value)
    return normalized


def _normalize_string_list(section: str, raw_section: Any) -> list[str]:
    if raw_section is None:
        return []
    if not isinstance(raw_section, list):
        raise ValueError(f"tools\\weapon-refresh-rules.json section '{section}' must be an array.")
    values: list[str] = []
    for value in raw_section:
        if not isinstance(value, str) or not value.strip():
            raise ValueError(
                f"tools\\weapon-refresh-rules.json section '{section}' entries must be non-empty strings."
            )
        values.append(value.strip())
    return unique_list(values)


def _normalize_exact_row_syncs(raw_section: Any) -> list[dict[str, Any]]:
    if raw_section is None:
        return []
    if not isinstance(raw_section, list):
        raise ValueError("tools\\weapon-refresh-rules.json section 'exact_row_syncs' must be an array.")

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(raw_section):
        if not isinstance(item, dict):
            raise ValueError(
                f"tools\\weapon-refresh-rules.json exact_row_syncs[{index}] must be an object."
            )
        source = item.get("source")
        target = item.get("target")
        if not isinstance(source, dict) or not isinstance(target, dict):
            raise ValueError(
                f"tools\\weapon-refresh-rules.json exact_row_syncs[{index}] must include source and target objects."
            )
        clean_source = _normalize_row_selector(source, f"exact_row_syncs[{index}].source")
        clean_target = _normalize_row_selector(target, f"exact_row_syncs[{index}].target")
        if not clean_source or not clean_target:
            raise ValueError(
                f"tools\\weapon-refresh-rules.json exact_row_syncs[{index}] source and target must not be empty."
            )
        normalized.append(
            {
                "source": clean_source,
                "target": clean_target,
                "reason": str(item.get("reason") or "").strip() or None,
            }
        )
    return normalized


def _normalize_row_selector(raw_selector: dict[str, Any], label: str) -> dict[str, str]:
    allowed_fields = {"Code", "Name", "Atk Type", "Atk Name"}
    unknown_fields = sorted(set(raw_selector) - allowed_fields)
    if unknown_fields:
        raise ValueError(
            f"tools\\weapon-refresh-rules.json {label} has unknown field(s): {', '.join(unknown_fields)}"
        )

    selector: dict[str, str] = {}
    for field_name, raw_value in raw_selector.items():
        if raw_value in (None, ""):
            continue
        if not isinstance(raw_value, str):
            raise ValueError(
                f"tools\\weapon-refresh-rules.json {label}.{field_name} must be a string."
            )
        selector[field_name] = raw_value.strip()
    return selector


def _normalize_status_rewrites(raw_section: Any) -> dict[str, list[str]]:
    if raw_section is None:
        return {}
    if not isinstance(raw_section, dict):
        raise ValueError("tools\\weapon-refresh-rules.json section 'status_rewrites' must be an object.")

    normalized: dict[str, list[str]] = {}
    for raw_key, raw_value in raw_section.items():
        if not isinstance(raw_key, str) or not raw_key.strip():
            raise ValueError(
                "tools\\weapon-refresh-rules.json section 'status_rewrites' keys must be non-empty strings."
            )
        key = raw_key.strip()
        if raw_value is None:
            normalized[key] = []
        elif isinstance(raw_value, str):
            if not raw_value.strip():
                raise ValueError(
                    f"tools\\weapon-refresh-rules.json status rewrite for '{key}' must not be blank."
                )
            normalized[key] = [raw_value.strip()]
        elif isinstance(raw_value, list):
            replacements: list[str] = []
            for item in raw_value:
                if not isinstance(item, str) or not item.strip():
                    raise ValueError(
                        f"tools\\weapon-refresh-rules.json status rewrite list for '{key}' must contain non-empty strings."
                    )
                replacements.append(item.strip())
            normalized[key] = unique_list(replacements)
        else:
            raise ValueError(
                f"tools\\weapon-refresh-rules.json status rewrite for '{key}' must be null, a string, or a string array."
            )
    return normalized


@dataclass(frozen=True)
class WeaponRefreshRules:
    source_path: Path | None = None
    exact_row_syncs: list[dict[str, Any]] = field(default_factory=list)
    attack_name_aliases: dict[str, list[str]] = field(default_factory=dict)
    entity_name_aliases: dict[str, list[str]] = field(default_factory=dict)
    code_aliases: dict[str, list[str]] = field(default_factory=dict)
    falloff_name_aliases: dict[str, list[str]] = field(default_factory=dict)
    falloff_exclusions: list[str] = field(default_factory=list)
    status_rewrites: dict[str, list[str]] = field(default_factory=dict)
    review_required: list[str] = field(default_factory=list)
    manual_grouping: list[str] = field(default_factory=list)

    def _aliases_for(self, section: str, value: Any) -> list[str]:
        text = str(value or "").strip()
        if not text:
            return []
        mapping = getattr(self, section)
        aliases = list(mapping.get(text, []))
        key = compact_key(text)
        for source, targets in mapping.items():
            if source == text:
                continue
            if compact_key(source) == key:
                aliases.extend(targets)
        return unique_list(aliases)

    def values_with_aliases(self, section: str, value: Any) -> list[str]:
        text = str(value or "").strip()
        return unique_list([text, *self._aliases_for(section, text)])

    def rewrite_status_names(self, status_names: Iterable[Any]) -> tuple[list[str], list[dict[str, Any]]]:
        rewritten: list[str] = []
        actions: list[dict[str, Any]] = []
        for raw_name in status_names:
            name = str(raw_name or "").strip()
            if not name:
                continue
            replacements = self.status_rewrites.get(name)
            if replacements is None:
                for source, targets in self.status_rewrites.items():
                    if compact_key(source) == compact_key(name):
                        replacements = targets
                        break
            if replacements is None:
                rewritten.append(name)
                continue
            rewritten.extend(replacements)
            actions.append(
                {
                    "from": name,
                    "to": replacements,
                    "action": "remove" if not replacements else "replace",
                }
            )
        return unique_list(rewritten), actions

    def is_falloff_excluded(self, weapon_label: str) -> bool:
        key = compact_key(weapon_label)
        return any(compact_key(value) == key for value in self.falloff_exclusions)

    def matching_exact_row_syncs(self, projection: dict[str, Any]) -> list[dict[str, Any]]:
        matches: list[dict[str, Any]] = []
        for rule in self.exact_row_syncs:
            source = rule.get("source") or {}
            if all(row_selector_field_matches(projection, field_name, expected) for field_name, expected in source.items()):
                matches.append(rule)
        return matches


def row_selector_field_matches(row: dict[str, Any], field_name: str, expected: str) -> bool:
    actual = str(row.get(field_name) or "").strip()
    if field_name == "Atk Type":
        return actual.lower() == str(expected or "").strip().lower()
    return compact_key(actual) == compact_key(expected)


def load_weapon_refresh_rules(
    path: Path | str | None = DEFAULT_RULES_PATH,
    *,
    required: bool = False,
) -> WeaponRefreshRules:
    if path is None:
        return WeaponRefreshRules()

    rules_path = Path(path)
    if not rules_path.exists():
        if required:
            raise ValueError(f"Weapon refresh rules file not found: {rules_path}")
        return WeaponRefreshRules(source_path=rules_path)

    try:
        with rules_path.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in weapon refresh rules file {rules_path}: {error}") from error

    if not isinstance(raw, dict):
        raise ValueError(f"Weapon refresh rules file must contain a top-level object: {rules_path}")

    unknown_sections = sorted(
        set(raw)
        - ALIAS_SECTIONS
        - LIST_SECTIONS
        - {"schema_version", "description", "status_rewrites"}
    )
    if unknown_sections:
        raise ValueError(
            f"Unknown section(s) in weapon refresh rules file {rules_path}: {', '.join(unknown_sections)}"
        )

    return WeaponRefreshRules(
        source_path=rules_path,
        exact_row_syncs=_normalize_exact_row_syncs(raw.get("exact_row_syncs")),
        attack_name_aliases=_normalize_alias_section("attack_name_aliases", raw.get("attack_name_aliases")),
        entity_name_aliases=_normalize_alias_section("entity_name_aliases", raw.get("entity_name_aliases")),
        code_aliases=_normalize_alias_section("code_aliases", raw.get("code_aliases")),
        falloff_name_aliases=_normalize_alias_section("falloff_name_aliases", raw.get("falloff_name_aliases")),
        falloff_exclusions=_normalize_string_list("falloff_exclusions", raw.get("falloff_exclusions")),
        status_rewrites=_normalize_status_rewrites(raw.get("status_rewrites")),
        review_required=_normalize_string_list("review_required", raw.get("review_required")),
        manual_grouping=_normalize_string_list("manual_grouping", raw.get("manual_grouping")),
    )


def parse_csv_rows(text: str) -> list[dict[str, str]]:
    rows = list(csv.reader(StringLineIterator(text)))
    if not rows:
        return []
    headers = [header.strip() for header in rows[0]]
    return [
        {headers[index]: value.strip() for index, value in enumerate(row) if index < len(headers)}
        for row in rows[1:]
        if any(str(value).strip() for value in row)
    ]


class StringLineIterator:
    def __init__(self, text: str) -> None:
        self._lines = str(text or "").splitlines()

    def __iter__(self) -> Iterable[str]:
        return iter(self._lines)


def parse_falloff_csv_text(text: str) -> list[dict[str, str]]:
    return [
        row
        for row in parse_csv_rows(text)
        if str(row.get("Weapon") or "").strip()
    ]


def parse_falloff_artifact_csv_text(text: str) -> list[dict[str, Any]]:
    raw_rows = list(csv.reader(StringLineIterator(text)))
    header_index = None
    for index, row in enumerate(raw_rows):
        normalized = [cell.strip() for cell in row]
        if "Category" in normalized and "Weapon" in normalized:
            header_index = index
            break
    if header_index is None:
        raise ValueError("Falloff artifact CSV does not contain a Category/Weapon header row.")

    headers = [cell.strip() for cell in raw_rows[header_index]]
    header_positions = {header: index for index, header in enumerate(headers) if header and header not in headers[:index]}

    def first_header_position(*names: str) -> int | None:
        for name in names:
            if name in header_positions:
                return header_positions[name]
        return None

    category_index = first_header_position("Category")
    weapon_index = first_header_position("Weapon")
    damage_index = first_header_position("Dmg")
    durable_index = first_header_position("Dur")
    caliber_index = first_header_position("Cal.", "Caliber")
    mass_index = first_header_position("Mass")
    velocity_index = first_header_position("Vel.", "Velocity")
    drag_index = first_header_position("Drag")
    distance_indexes = [
        (index, header)
        for index, header in enumerate(headers)
        if re.fullmatch(r"\d+m", header or "")
    ]

    def cell(row: list[str], index: int | None) -> str:
        if index is None or index >= len(row):
            return ""
        return row[index].strip()

    rows: list[dict[str, Any]] = []
    for row in raw_rows[header_index + 1 :]:
        if not any(str(value).strip() for value in row):
            continue
        weapon = cell(row, weapon_index)
        if not weapon:
            continue
        rows.append(
            {
                "Category": cell(row, category_index),
                "Weapon": weapon,
                "Damage": cell(row, damage_index),
                "DurableDamage": cell(row, durable_index),
                "Caliber": cell(row, caliber_index),
                "Mass": cell(row, mass_index),
                "Velocity": cell(row, velocity_index),
                "Drag": cell(row, drag_index),
                "distances": {
                    header: cell(row, index)
                    for index, header in distance_indexes
                },
            }
        )
    return rows


def classify_falloff_artifact_rows(
    *,
    artifact_rows: list[dict[str, Any]],
    current_rows: list[dict[str, str]],
    rules: WeaponRefreshRules,
) -> dict[str, Any]:
    current_by_key: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in current_rows:
        current_by_key[compact_key(row.get("Weapon"))].append(row)

    matched: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []

    for artifact in artifact_rows:
        weapon = str(artifact.get("Weapon") or "").strip()
        if rules.is_falloff_excluded(weapon):
            excluded.append({"artifact_weapon": weapon, "reason": "falloff_exclusions"})
            continue

        candidate_labels = rules.values_with_aliases("falloff_name_aliases", weapon)
        candidates_by_weapon: dict[str, dict[str, str]] = {}
        for label in candidate_labels:
            for current in current_by_key.get(compact_key(label), []):
                candidates_by_weapon[str(current.get("Weapon") or "")] = current
        candidates = list(candidates_by_weapon.values())

        if len(candidates) == 1:
            current = candidates[0]
            field_differences = compare_falloff_fields(artifact, current)
            matched.append(
                {
                    "artifact_weapon": weapon,
                    "current_weapon": current.get("Weapon"),
                    "matched_by": candidate_labels,
                    "field_differences": field_differences,
                }
            )
        elif len(candidates) > 1:
            ambiguous.append(
                {
                    "artifact_weapon": weapon,
                    "candidate_weapons": [candidate.get("Weapon") for candidate in candidates],
                    "matched_by": candidate_labels,
                }
            )
        else:
            missing.append({"artifact_weapon": weapon, "matched_by": candidate_labels})

    return {
        "summary": {
            "artifact_rows": len(artifact_rows),
            "current_rows": len(current_rows),
            "matched": len(matched),
            "missing": len(missing),
            "ambiguous": len(ambiguous),
            "excluded": len(excluded),
            "matched_with_differences": sum(1 for entry in matched if entry["field_differences"]),
        },
        "matched": matched,
        "missing": missing,
        "ambiguous": ambiguous,
        "excluded": excluded,
    }


def compare_falloff_fields(artifact: dict[str, Any], current: dict[str, str]) -> dict[str, dict[str, str]]:
    field_pairs = {
        "Caliber": ("Caliber", "Caliber"),
        "Mass": ("Mass", "Mass"),
        "Velocity": ("Velocity", "Velocity"),
        "Drag": ("Drag", "Drag"),
    }
    differences: dict[str, dict[str, str]] = {}
    for field, (artifact_field, current_field) in field_pairs.items():
        artifact_value = str(artifact.get(artifact_field) or "").strip()
        current_value = str(current.get(current_field) or "").strip()
        if artifact_value and current_value and artifact_value != current_value:
            differences[field] = {"artifact": artifact_value, "current": current_value}

    for distance, artifact_value in (artifact.get("distances") or {}).items():
        current_value = str(current.get(distance) or "").strip()
        artifact_text = str(artifact_value or "").strip()
        if artifact_text and current_value and artifact_text != current_value:
            differences[distance] = {"artifact": artifact_text, "current": current_value}
    return differences


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False, sort_keys=True)
        handle.write("\n")


def build_falloff_preview_report(
    *,
    rules_path: Path,
    artifact_path: Path,
    falloff_csv_path: Path,
) -> dict[str, Any]:
    rules = load_weapon_refresh_rules(rules_path, required=True)
    artifact_rows = parse_falloff_artifact_csv_text(artifact_path.read_text(encoding="utf-8-sig"))
    current_rows = parse_falloff_csv_text(falloff_csv_path.read_text(encoding="utf-8-sig"))
    classification = classify_falloff_artifact_rows(
        artifact_rows=artifact_rows,
        current_rows=current_rows,
        rules=rules,
    )
    return {
        "metadata": {
            "tool": r"tools\weapon_refresh_rules.py",
            "rules_path": str(rules_path),
            "falloff_artifact_path": str(artifact_path),
            "falloff_csv_path": str(falloff_csv_path),
            "mode": "report-only",
        },
        "falloff": classification,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate weapon refresh rules and optionally preview falloff artifact row matches."
    )
    parser.add_argument("--rules", default=str(DEFAULT_RULES_PATH), help="Path to weapon refresh rules JSON.")
    parser.add_argument(
        "--falloff-artifact",
        default=str(DEFAULT_FALLOFF_ARTIFACT_PATH),
        help="Path to an observed falloff artifact CSV.",
    )
    parser.add_argument(
        "--falloff-csv",
        default=str(DEFAULT_FALLOFF_CSV_PATH),
        help="Path to the checked-in weapons\\falloff.csv file.",
    )
    parser.add_argument(
        "--output",
        help="Optional path to write a report-only falloff preview JSON.",
    )
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Only validate the rules file; do not read falloff artifacts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rules_path = Path(args.rules).resolve()
    try:
        rules = load_weapon_refresh_rules(rules_path, required=True)
        if args.validate_only:
            print(f"Validated weapon refresh rules: {rules_path}")
            return

        artifact_path = Path(args.falloff_artifact).resolve()
        falloff_csv_path = Path(args.falloff_csv).resolve()
        if not artifact_path.exists():
            raise ValueError(f"Falloff artifact file not found: {artifact_path}")
        if not falloff_csv_path.exists():
            raise ValueError(f"Falloff CSV file not found: {falloff_csv_path}")

        report = build_falloff_preview_report(
            rules_path=rules_path,
            artifact_path=artifact_path,
            falloff_csv_path=falloff_csv_path,
        )
        output_path = Path(args.output).resolve() if args.output else DEFAULT_FALLOFF_REPORT_PATH
        write_json(output_path, report)
        summary = report["falloff"]["summary"]
        print(
            f"Wrote report-only falloff preview to {output_path}: "
            f"matched={summary['matched']} missing={summary['missing']} "
            f"ambiguous={summary['ambiguous']} excluded={summary['excluded']}."
        )
        del rules
    except ValueError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
