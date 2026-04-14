#!/usr/bin/env python3
"""
Flatten a filediver entity-component dump into parser_faction_units.py input.

The current filediver dumper may emit component payloads either:

- directly at the top level (older shape), or
- under a nested "components" object (newer shape)

This script normalizes both shapes into the flat object expected by
parser_faction_units.py:

{
  "content/fac_bugs/...": {
    "loc_name": "Hive Guard",
    "health": 500,
    "default_damageable_zone_info": {...},
    "damageable_zones": [...]
  }
}
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Optional


PATH_BUCKET_MAP = {
    "bugs": "bugs",
    "cyborgs": "cyborgs",
    "cyborg": "cyborgs",
    "illuminate": "illuminate",
    "illuminates": "illuminate",
}

FACTION_BUCKET_MAP = {
    "FactionType_Bugs": "bugs",
    "FactionType_Cyborg": "cyborgs",
    "FactionType_Cyborgs": "cyborgs",
    "FactionType_Illuminate": "illuminate",
    "FactionType_Illuminates": "illuminate",
}

STATUS_AUDIT_KEYWORDS = (
    "status",
    "burn",
    "fire",
    "stun",
    "gas",
    "ignite",
    "arc",
    "shock",
    "decay",
    "threshold",
    "stack",
    "multiplier",
)


def titlecase_upper(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned.title()


def ensure_parent_dir(path: Path) -> None:
    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)


def load_json_with_bom(path: Path) -> Any:
    """Load JSON from UTF-8, UTF-8-BOM, or UTF-16 (LE/BE) as written by Windows tools."""
    raw = path.read_bytes()
    # Use "utf-16" (not utf-16-le) so the BOM is not left as U+FEFF (json.loads rejects it on 3.14+).
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-8")
    return json.loads(text)


def resolve_components(payload: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(payload, dict):
        return None
    nested = payload.get("components")
    if isinstance(nested, dict):
        return nested
    return payload


def extract_bucket_from_path(path: Any) -> Optional[str]:
    if not isinstance(path, str):
        return None
    match = re.search(r"content/fac_([^/]+)/", path)
    if not match:
        return None
    return PATH_BUCKET_MAP.get(match.group(1).strip().lower())


def extract_bucket_from_factions(faction_component: Any) -> Optional[str]:
    if not isinstance(faction_component, dict):
        return None
    factions = faction_component.get("factions")
    if not isinstance(factions, list):
        return None
    for faction in factions:
        if faction in FACTION_BUCKET_MAP:
            return FACTION_BUCKET_MAP[faction]
    return None


def resolve_loc_name(entry: Any) -> Optional[str]:
    if not isinstance(entry, dict):
        return None

    loc_name = entry.get("loc_name")
    if isinstance(loc_name, str) and loc_name.strip():
        return loc_name.strip()

    return titlecase_upper(entry.get("loc_name_upper"))


def resolve_canonical_key(entity_key: str, components: Dict[str, Any]) -> Optional[str]:
    top_level_bucket = extract_bucket_from_path(entity_key)
    if top_level_bucket is not None:
        return entity_key

    for component_name in ("UnitComponentData", "LocalUnitComponentData"):
        component = components.get(component_name)
        if not isinstance(component, dict):
            continue
        unit_path = component.get("unit_path")
        bucket = extract_bucket_from_path(unit_path)
        if bucket is not None and isinstance(unit_path, str):
            return f"{unit_path}__{entity_key}"

    bucket = extract_bucket_from_factions(components.get("FactionComponentData"))
    if bucket is not None:
        return f"content/fac_{bucket}/__unresolved__/{entity_key}"

    return None


def normalize_audit_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def is_meaningful_audit_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def is_status_audit_key(value: Any) -> bool:
    normalized = normalize_audit_key(value)
    return any(keyword in normalized for keyword in STATUS_AUDIT_KEYWORDS)


def format_audit_path(segments: tuple[str, ...]) -> str:
    formatted = ""
    for segment in segments:
        if segment.startswith("["):
            formatted += segment
        elif not formatted:
            formatted = segment
        else:
            formatted += f".{segment}"
    return formatted


def collect_status_audit_matches(value: Any, path: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []

    if isinstance(value, dict):
        for key, child in value.items():
            segment = str(key)
            next_path = (*path, segment)
            if is_status_audit_key(segment) and is_meaningful_audit_value(child):
                matches.append({
                    "path": format_audit_path(next_path),
                    "value": child,
                })
                continue
            matches.extend(collect_status_audit_matches(child, next_path))
        return matches

    if isinstance(value, list):
        for index, child in enumerate(value):
            matches.extend(collect_status_audit_matches(child, (*path, f"[{index}]")))

    return matches


def reserve_unique_output_key(preferred_key: str, reserved_output_keys: set[str]) -> str:
    output_key = preferred_key
    duplicate_index = 2
    while output_key in reserved_output_keys:
        output_key = f"{preferred_key}__dup{duplicate_index}"
        duplicate_index += 1
    reserved_output_keys.add(output_key)
    return output_key


def is_status_audit_component(component_name: Any) -> bool:
    normalized = normalize_audit_key(component_name)
    return "weapon" not in normalized


def iter_flattenable_entities(src: Dict[str, Any]):
    reserved_output_keys: set[str] = set()

    for entity_key, payload in src.items():
        if not isinstance(entity_key, str):
            continue

        components = resolve_components(payload)
        if components is None:
            continue

        entry = components.get("EncyclopediaEntryComponentData")
        health = components.get("HealthComponentData")
        if not isinstance(entry, dict) or not isinstance(health, dict):
            continue

        loc_name = resolve_loc_name(entry)
        if not loc_name:
            continue

        canonical_key = resolve_canonical_key(entity_key, components)
        if not canonical_key:
            continue

        output_key = reserve_unique_output_key(canonical_key, reserved_output_keys)
        yield output_key, entity_key, components, loc_name, health


def flatten_entity_component_settings(src: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    flattened: Dict[str, Dict[str, Any]] = {}

    for output_key, _entity_key, _components, loc_name, health in iter_flattenable_entities(src):
        flattened[output_key] = {
            "loc_name": loc_name,
            "health": health.get("health"),
            "constitution": health.get("constitution"),
            "constitution_changerate": health.get("constitution_changerate"),
            "constitution_disables_interactions": health.get("constitution_disables_interactions"),
            "decay": health.get("decay"),
            "default_damageable_zone_info": health.get("default_damageable_zone_info"),
            "damageable_zones": health.get("damageable_zones"),
            "zone_bleedout_changerate": health.get("zone_bleedout_changerate"),
        }

    return flattened


def iter_status_audit_entities(src: Dict[str, Any]):
    reserved_output_keys: set[str] = set()

    for entity_key, payload in src.items():
        if not isinstance(entity_key, str):
            continue

        components = resolve_components(payload)
        if components is None:
            continue

        entry = components.get("EncyclopediaEntryComponentData")
        loc_name = resolve_loc_name(entry) if isinstance(entry, dict) else None
        health = components.get("HealthComponentData")
        canonical_key = resolve_canonical_key(entity_key, components) or entity_key
        output_key = reserve_unique_output_key(canonical_key, reserved_output_keys)
        yield output_key, entity_key, components, loc_name, isinstance(health, dict)


def build_status_audit(src: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    audit: Dict[str, Dict[str, Any]] = {}

    for output_key, entity_key, components, loc_name, has_health_component in iter_status_audit_entities(src):
        matches: list[dict[str, Any]] = []

        for component_name, component_value in components.items():
            if not is_status_audit_component(component_name):
                continue
            if is_status_audit_key(component_name) and not isinstance(component_value, (dict, list)) and is_meaningful_audit_value(component_value):
                matches.append({
                    "component": str(component_name),
                    "path": str(component_name),
                    "value": component_value,
                })
            component_matches = collect_status_audit_matches(component_value, (str(component_name),))
            matches.extend({
                "component": str(component_name),
                **match,
            } for match in component_matches)

        if not matches:
            continue

        audit[output_key] = {
            "loc_name": loc_name,
            "raw_entity_key": entity_key,
            "has_health_component": has_health_component,
            "matches": matches,
        }

    return audit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Flatten filediver entity-component settings into parser input.",
    )
    parser.add_argument(
        "-i",
        "--input",
        required=True,
        help="Path to the raw entity-component-settings JSON dump.",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Path to write the flattened JSON file.",
    )
    parser.add_argument(
        "--status-audit-output",
        help="Optional path to write a sidecar JSON containing status-like fields discovered in the raw dump.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_path = Path(args.input.strip())
    output_path = Path(args.output.strip())
    status_audit_output_path = Path(args.status_audit_output.strip()) if args.status_audit_output else None

    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")
    if not input_path.is_file():
        raise SystemExit(f"Input path is not a file: {input_path}")

    ensure_parent_dir(output_path)
    if status_audit_output_path is not None:
        ensure_parent_dir(status_audit_output_path)

    data = load_json_with_bom(input_path)

    if not isinstance(data, dict):
        raise SystemExit("Input JSON must be a top-level object")

    flattened = flatten_entity_component_settings(data)

    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(flattened, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write("\n")

    print(f"Wrote {output_path} with {len(flattened)} flattened entries.")

    if status_audit_output_path is not None:
        audit = build_status_audit(data)
        with status_audit_output_path.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(audit, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")
        print(f"Wrote {status_audit_output_path} with {len(audit)} status-audit entries.")


if __name__ == "__main__":
    main()
