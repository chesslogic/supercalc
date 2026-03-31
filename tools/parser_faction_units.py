#!/usr/bin/env python3
"""
Enemy unit extractor for Helldivers 2 data dumps
- Input : dump.json (master object keyed by content paths)
- Output: enemydata.json
    {
      "Terminid": {
        "Charger": {
          "health": 2400,
          "damageable_zones": [ { ... all zone fields ... } ]
        },
        ...
      },
      "Automaton": { ... },
      "Illuminate": { ... }
    }

Normalization rules:
  - Terminid  : fac_bugs
  - Automaton : fac_cyborgs
  - Illuminate: fac_illuminate
  - Ignore    : fac_super_earth, fac_helldivers, anything unmapped

Deduping:
  - If multiple entries for the same loc_name exist within a faction, prefer an
    unsuffixed/base source path when one exists (for example
    `.../cha_berserker/cha_berserker` over `.../cha_berserker_iron_fleet`)
  - Within that canonical pool, keep the one with the most damageable_zones; if
    tied, the higher health wins
  - Differing non-canonical payloads can be written to `--variant-report` for
    review without polluting the main export

Zone field filtering/renames:
  - ignore: affected_by_collision_impact, armor_angle_check, child_zones,
            damage_multiplier, damage_multiplier_dps, explosion_verification_mode,
            hit_effect_receiver_type, ignore_armor_on_self, immortal,
            kill_children_on_death, max_armor, regeneration_enabled
  - rename: affected_by_explosions → ExTarget (false/0 → "Main", true/non‑zero → "Part"),
            affects_main_health → ToMain%,
            main_health_affect_capped_by_zone_health → MainCap,
            projectile_durable_resistance → Dur%,
            armor → AV,
            constitution → Con
  - derive: payload bleed-rate fields → ConRate (absolute bleed rate)
  - derive: Constitution-bearing zones with ConRate 0 → ConNoBleed: true
  - transform: explosive_damage_percentage → ExMult (keep finite values as-is,
                including 0 and >1; omit the large unset sentinel)
  - aggregate: if any of [causes_death_on_death, causes_death_on_downed,
                          causes_downed_on_death, causes_downed_on_downed] == 1,
               set IsFatal: true (and drop the individual flags)
  - keep as‑is (plus redaction for strings): zone_name, health

Run:
  python parser_faction_units.py -i dump.json -o enemydata.json
"""

import json
import math
import os
import re
import argparse
from typing import Union
from collections import defaultdict, OrderedDict
from typing import Any, Dict

ENEMY_SCOPE_TAGS_BY_UNIT_NAME: Dict[str, list[str]] = {
    "AA Emplacement": ["structure"],
    "Automaton Mortar Emplacement": ["structure"],
    "Bile Titan": ["giant"],
    "Bulk Fabricator": ["objective"],
    "Cannon Turret": ["structure"],
    "Charger Behemoth": ["giant"],
    "Fabricator": ["objective"],
    "Factory Strider": ["giant"],
    "Factory Strider Gatling Gun": ["structure"],
    "Fusion Autocannon": ["structure"],
    "Harvester": ["giant"],
    "Heavy Fusion Cannon": ["structure"],
    "Hive Lord": ["giant"],
    "Impaler": ["giant"],
    "Infested Tower": ["objective"],
    "Shrieker Nest": ["objective"],
    "Spore Charger": ["giant"],
    "Spore Lung": ["objective"],
}

# These overrides run on the parser's transformed zone shape, keyed by
# signature plus occurrence order within matching signatures. That keeps them
# resilient to opaque upstream names while avoiding blind renames if the zone
# stats for a curated part ever change.
CURATED_ZONE_NAME_OVERRIDES_BY_UNIT_NAME: Dict[str, list[Dict[str, Any]]] = {
    "Agitator": [
        {
            "occurrence": 0,
            "zone_name": "left_forearm",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0.75,
                "health": 300,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_forearm",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0.75,
                "health": 300,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_upper_arm",
            "signature": {
                "AV": 1,
                "Dur%": 0,
                "ExMult": 0.45,
                "ExTarget": "Part",
                "MainCap": True,
                "ToMain%": 0.8,
                "health": 300,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_upper_arm",
            "signature": {
                "AV": 1,
                "Dur%": 0,
                "ExMult": 0.45,
                "ExTarget": "Part",
                "MainCap": True,
                "ToMain%": 0.8,
                "health": 300,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "head",
            "signature": {
                "AV": 1,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": True,
                "ToMain%": 1,
                "health": 150,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_leg",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1400,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_leg",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1400,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "pelvis",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 1,
                "health": 1400,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "torso",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 1,
                "health": 1200,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "torso_armor",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExMult": 0.35,
                "ExTarget": "Part",
                "MainCap": False,
                "ToMain%": 0.3,
                "health": 300,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "helmet",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExMult": 0.35,
                "ExTarget": "Part",
                "MainCap": False,
                "ToMain%": 0.3,
                "health": 200,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "left_pauldron",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExMult": 0.35,
                "ExTarget": "Part",
                "MainCap": False,
                "ToMain%": 0.3,
                "health": 200,
            },
        },
        {
            "occurrence": 2,
            "zone_name": "right_pauldron",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExMult": 0.35,
                "ExTarget": "Part",
                "MainCap": False,
                "ToMain%": 0.3,
                "health": 200,
            },
        },
    ],
    "Veracitor": [
        {
            "occurrence": 0,
            "zone_name": "cockpit",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": True,
                "ToMain%": 1,
                "health": 1600,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "cockpit_weakspot",
            "signature": {
                "AV": 1,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": True,
                "ToMain%": 1,
                "health": 800,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "chassis",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "head",
            "signature": {
                "AV": 3,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0,
                "health": 300,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_carapace",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.5,
                "health": 400,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_carapace",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.5,
                "health": 400,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_internals",
            "signature": {
                "AV": 1,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 1,
                "health": 600,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_internals",
            "signature": {
                "AV": 1,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 1,
                "health": 600,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "pilot",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": True,
                "ToMain%": 0,
                "health": 700,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_shoulder",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 800,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "left_upper_arm",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 800,
            },
        },
        {
            "occurrence": 2,
            "zone_name": "right_shoulder",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 800,
            },
        },
        {
            "occurrence": 3,
            "zone_name": "right_upper_arm",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 800,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_arm_weakspot",
            "signature": {
                "AV": 1,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0,
                "health": 800,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_forearm",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0,
                "health": 800,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_arm_weakspot",
            "signature": {
                "AV": 1,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0,
                "health": 800,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "right_forearm",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0,
                "health": 800,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "left_hip",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "left_upper_leg",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 2,
            "zone_name": "right_hip",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 3,
            "zone_name": "right_upper_leg",
            "signature": {
                "AV": 2,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 1,
            "zone_name": "left_lower_leg",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 2,
            "zone_name": "right_lower_leg",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 3,
            "zone_name": "rear_hip",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 4,
            "zone_name": "rear_leg",
            "signature": {
                "AV": 3,
                "Dur%": 0.5,
                "ExTarget": "Main",
                "IsFatal": True,
                "MainCap": False,
                "ToMain%": 0.75,
                "health": 1600,
            },
        },
        {
            "occurrence": 0,
            "zone_name": "shield",
            "signature": {
                "AV": 2,
                "Dur%": 0,
                "ExTarget": "Main",
                "MainCap": True,
                "ToMain%": 0,
                "health": 1300,
            },
        },
    ],
}

# --- Mapping helpers -------------------------------------------------------

def normalize_faction(raw: str):
    """Map fac_* folder segment to target faction label or None to ignore."""
    r = raw.strip().lower().replace("_", "")
    mapping = {
        # desired three buckets
        "bugs": "Terminid",
        "cyborgs": "Automaton",
        "cyborg": "Automaton",
        "illuminate": "Illuminate",
        "illuminates": "Illuminate",
        # explicitly ignored
        "superearth": None,
        "helldivers": None,
        "helldiver": None,
        "human": None,
        "humans": None,
    }
    return mapping.get(r, None)

# --- Core parsing ----------------------------------------------------------

def round_float(value: Any) -> Union[int, float]:
    """Round float values to 2 decimal places. Returns int if value is whole number, float otherwise."""
    if isinstance(value, float):
        rounded = round(value, 2)
        # Return as int if it's a whole number (e.g., 1.0 -> 1, but 0.4 -> 0.4)
        return int(rounded) if rounded == int(rounded) else rounded
    elif isinstance(value, (int, bool)):
        return value
    else:
        # Try to convert to float and round
        try:
            fval = float(value)
            rounded = round(fval, 2)
            return int(rounded) if rounded == int(rounded) else rounded
        except (ValueError, TypeError):
            return value


def get_scope_tags_for_unit(unit_name: str) -> list[str]:
    return list(ENEMY_SCOPE_TAGS_BY_UNIT_NAME.get(str(unit_name or ""), []))

def normalize_zone_signature(zone: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    for key, value in zone.items():
        if key == "zone_name":
            continue
        if key == "MainCap":
            normalized[key] = bool(value)
            continue
        normalized[key] = value
    return normalized

def serialize_zone_signature(zone: Dict[str, Any]) -> str:
    return json.dumps(
        normalize_zone_signature(zone),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )

def build_curated_zone_name_override_lookup() -> Dict[str, Dict[tuple[str, int], str]]:
    lookup: Dict[str, Dict[tuple[str, int], str]] = {}
    for unit_name, overrides in CURATED_ZONE_NAME_OVERRIDES_BY_UNIT_NAME.items():
        unit_lookup: Dict[tuple[str, int], str] = {}
        for override in overrides:
            signature = override.get("signature")
            zone_name = str(override.get("zone_name") or "")
            occurrence = int(override.get("occurrence", 0) or 0)
            if not isinstance(signature, dict) or not zone_name:
                continue
            key = (serialize_zone_signature(signature), occurrence)
            if key in unit_lookup:
                raise ValueError(f"Duplicate curated zone override for {unit_name}: {key}")
            unit_lookup[key] = zone_name
        if unit_lookup:
            lookup[unit_name] = unit_lookup
    return lookup

CURATED_ZONE_NAME_OVERRIDE_LOOKUP_BY_UNIT_NAME = build_curated_zone_name_override_lookup()

def apply_curated_zone_name_overrides(unit_name: str, zones: list[Dict[str, Any]]) -> None:
    override_lookup = CURATED_ZONE_NAME_OVERRIDE_LOOKUP_BY_UNIT_NAME.get(str(unit_name or ""))
    if not override_lookup:
        return

    seen_signatures: Dict[str, int] = defaultdict(int)
    for zone in zones:
        if not isinstance(zone, dict):
            continue
        signature = serialize_zone_signature(zone)
        occurrence = seen_signatures[signature]
        replacement = override_lookup.get((signature, occurrence))
        if replacement:
            zone["zone_name"] = replacement
        seen_signatures[signature] += 1

def sanitize_string(s: str) -> str:
    if "^_^" in s:
        s = s.split("^_^", 1)[0]
    s = s.strip()
    
    # If zone name is purely numerical, replace with [unknown]
    if s.isdigit():
        s = "[unknown]"
    
    return s

def sanitize(obj: Union[dict, list, str, int, float, None]):
    """Recursively sanitize any string values by removing '^_^' marker and trailing data."""
    if isinstance(obj, str):
        return sanitize_string(obj)
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            out[k] = sanitize(v)
        return out
    return obj

IGNORED_ZONE_KEYS = {
    "affected_by_collision_impact",
    "armor_angle_check",
    "bleedout_enabled",
    "child_zones",
    "damage_multiplier",
    "damage_multiplier_dps",
    "explosion_verification_mode",
    "hit_effect_receiver_type",
    "ignore_armor_on_self",
    "immortal",
    "kill_children_on_death",
    "max_armor",
    "regeneration_enabled",
}

FATAL_KEYS = [
    "causes_death_on_death",
    "causes_death_on_downed",
    "causes_downed_on_death",
    "causes_downed_on_downed",
]

EXPLOSIVE_UNSET_SENTINEL = 3.4028235e+38
DUPLICATE_SUFFIX_RE = re.compile(r"__dup\d+$")

def normalize_ex_target(v: Any):
    if isinstance(v, bool):
        return "Part" if v else "Main"
    if isinstance(v, str):
        lowered = v.strip().lower()
        if lowered in {"false", "0"}:
            return "Main"
        if lowered in {"true", "1"}:
            return "Part"
    try:
        return "Main" if int(v) == 0 else "Part"
    except Exception:
        return "Part"


def should_serialize_ex_mult(value: float) -> bool:
    return math.isfinite(value) and not math.isclose(
        value,
        EXPLOSIVE_UNSET_SENTINEL,
        rel_tol=1e-6,
        abs_tol=0.0,
    )

def is_positive_number(value: Any) -> bool:
    try:
        return float(value) > 0
    except (ValueError, TypeError):
        return False

def get_constitution_bleed_rate(
    payload: Dict[str, Any],
    *,
    is_main_zone: bool,
) -> Union[int, float, None]:
    if not isinstance(payload, dict):
        return None

    key = "constitution_changerate" if is_main_zone else "zone_bleedout_changerate"
    value = payload.get(key)
    try:
        numeric = abs(float(value))
    except (ValueError, TypeError):
        return None

    if not math.isfinite(numeric):
        return None

    return round_float(numeric)

def apply_constitution_fields(
    out: Dict[str, Any],
    constitution_value: Any,
    payload: Dict[str, Any],
    *,
    is_main_zone: bool,
) -> None:
    if constitution_value is None:
        return

    out["Con"] = constitution_value
    if is_positive_number(constitution_value):
        con_rate = get_constitution_bleed_rate(payload, is_main_zone=is_main_zone)
        if con_rate is not None:
            out["ConRate"] = con_rate
            if con_rate == 0:
                out["ConNoBleed"] = True

def transform_zone(
    zone: Dict[str, Any],
    payload: Dict[str, Any] | None = None,
    *,
    is_main_zone: bool = False,
) -> Dict[str, Any]:
    """Filter/rename a single zone dict according to spec; strings are sanitized.
    Accepts either a zone dict or a wrapper with an 'info' dict.
    Returns an empty dict if nothing relevant remains (caller may drop it)."""
    if not isinstance(zone, dict):
        return {}

    # Some inputs wrap the actual fields under 'info'
    src = zone.get("info") if isinstance(zone.get("info"), dict) else zone

    out: Dict[str, Any] = {}

    # Keep selected fields (sanitized if string)
    if "zone_name" in src and src["zone_name"] is not None:
        out["zone_name"] = sanitize_string(str(src["zone_name"]))
    
    # Keep health as-is, rename constitution to Con
    if "health" in src and src["health"] is not None:
        out["health"] = src["health"]
    
    if "constitution" in src and src["constitution"] is not None:
        apply_constitution_fields(
            out,
            src["constitution"],
            payload or {},
            is_main_zone=is_main_zone,
        )
    
    # Rename armor to AV (Armor Value)
    if "armor" in src and src["armor"] is not None:
        out["AV"] = src["armor"]

    # Renames / transforms
    if "affected_by_explosions" in src:
        out["ExTarget"] = normalize_ex_target(src["affected_by_explosions"])

    # Percentage values: round to 2 decimal places
    if "affects_main_health" in src:
        out["ToMain%"] = round_float(src["affects_main_health"])

    if "main_health_affect_capped_by_zone_health" in src:
        out["MainCap"] = src["main_health_affect_capped_by_zone_health"]

    if "projectile_durable_resistance" in src:
        out["Dur%"] = round_float(src["projectile_durable_resistance"])

    explosive_damage = src.get("explosive_damage_percentage")
    if explosive_damage is not None:
        try:
            ex_mult = float(explosive_damage)
            if should_serialize_ex_mult(ex_mult):
                out["ExMult"] = round_float(ex_mult)
        except Exception:
            s = sanitize_string(str(explosive_damage))
            if s:
                out["ExMult"] = s

    # Aggregate fatal flags
    if any(int(src.get(k, 0) or 0) == 1 for k in FATAL_KEYS):
        out["IsFatal"] = True

    return out


def _score_payload(payload: Dict[str, Any]) -> tuple:
    zones = payload.get("damageable_zones")
    zlen = len(zones) if isinstance(zones, list) else 0
    health = payload.get("health") or 0
    return (zlen, health)

def strip_duplicate_suffix(source_key: Any) -> str:
    if not isinstance(source_key, str):
        return ""
    return DUPLICATE_SUFFIX_RE.sub("", source_key)

def has_unsuffixed_source_path(source_key: Any) -> bool:
    cleaned = strip_duplicate_suffix(source_key)
    if not cleaned:
        return False

    segments = [segment for segment in cleaned.split("/") if segment]
    if len(segments) < 2:
        return False

    return segments[-1] == segments[-2]

def _candidate_sort_key(candidate: Dict[str, Any]) -> tuple:
    source_key = strip_duplicate_suffix(candidate.get("source_key"))
    zone_count, health = _score_payload(candidate)
    return (
        0 if has_unsuffixed_source_path(source_key) else 1,
        0 if "__" not in source_key else 1,
        -zone_count,
        -health,
        len(source_key),
        source_key,
    )

def _best_candidate(candidates: list[Dict[str, Any]]) -> Dict[str, Any]:
    return sorted(candidates, key=_candidate_sort_key)[0]

def _canonical_payload(candidate: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        "health": candidate.get("health"),
        "damageable_zones": candidate.get("damageable_zones"),
    }
    if candidate.get("scope_tags"):
        payload["scope_tags"] = candidate.get("scope_tags")
    return payload

def _payload_signature(candidate: Dict[str, Any]) -> str:
    return json.dumps(
        _canonical_payload(candidate),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )

def _compact_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source_key": strip_duplicate_suffix(candidate.get("source_key")),
        "health": candidate.get("health"),
        "zone_count": len(candidate.get("damageable_zones") or []),
        "unsuffixed_source_path": has_unsuffixed_source_path(candidate.get("source_key")),
    }

def resolve_unit_candidates(candidates: list[Dict[str, Any]]) -> tuple[Dict[str, Any], Dict[str, Any] | None]:
    canonical_pool = [candidate for candidate in candidates if has_unsuffixed_source_path(candidate.get("source_key"))]
    if not canonical_pool:
        canonical_pool = candidates

    canonical_candidate = _best_candidate(canonical_pool)
    canonical_signature = _payload_signature(canonical_candidate)

    signature_groups: "OrderedDict[str, list[Dict[str, Any]]]" = OrderedDict()
    for candidate in candidates:
        signature_groups.setdefault(_payload_signature(candidate), []).append(candidate)

    variant_groups: list[Dict[str, Any]] = []
    for signature, matches in signature_groups.items():
        if signature == canonical_signature:
            continue
        representative = _best_candidate(matches)
        variant_groups.append(
            {
                "representative": _compact_candidate(representative),
                "source_keys": sorted(
                    {strip_duplicate_suffix(candidate.get("source_key")) for candidate in matches}
                ),
            }
        )

    variant_groups.sort(
        key=lambda group: (
            0 if group["representative"]["unsuffixed_source_path"] else 1,
            -group["representative"]["zone_count"],
            -(group["representative"]["health"] or 0),
            group["representative"]["source_key"],
        )
    )

    variant_report = None
    if variant_groups:
        variant_report = {
            "canonical": _compact_candidate(canonical_candidate),
            "variants": variant_groups,
        }

    return _canonical_payload(canonical_candidate), variant_report


def parse_enemy_units(src: dict) -> tuple[dict, dict]:
    """Return ({Faction: {UnitName: {health, damageable_zones}}}, variant_report)."""
    per_faction_candidates: Dict[str, Dict[str, list[Dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    variant_report: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)

    for key, payload in src.items():
        if not isinstance(key, str) or not isinstance(payload, dict):
            continue
        if not key.startswith("content/fac_"):
            continue

        m = re.search(r"content/fac_([^/]+)/", key)
        if not m:
            continue
        faction_raw = m.group(1)
        faction = normalize_faction(faction_raw)
        if faction is None:
            continue

        loc_name = payload.get("loc_name")
        if not loc_name or str(loc_name).strip().upper() == "N/A":
            continue

        # Sanitize the unit name to drop any '^_^' suffixes
        unit_name = sanitize_string(str(loc_name))

        # Build zones: transform and drop empties/non-dicts
        raw_zones = payload.get("damageable_zones") or []
        zones: list = []
        if isinstance(raw_zones, list):
            for z in raw_zones:
                if isinstance(z, dict):
                    tz = transform_zone(z, payload)
                    if tz:  # drop empty dicts
                        zones.append(tz)

        # Process default_damageable_zone_info into a zone named "Main"
        default_zone_info = payload.get("default_damageable_zone_info")
        if isinstance(default_zone_info, dict):
            main_zone = transform_zone(default_zone_info, payload, is_main_zone=True)
            if main_zone:
                main_zone["zone_name"] = "Main"
                # Override health with unit's main health
                unit_health = payload.get("health")
                if unit_health is not None:
                    main_zone["health"] = unit_health
                payload_constitution = payload.get("constitution")
                if is_positive_number(payload_constitution) and not is_positive_number(main_zone.get("Con")):
                    apply_constitution_fields(
                        main_zone,
                        payload_constitution,
                        payload,
                        is_main_zone=True,
                    )
                zones.insert(0, main_zone)

        apply_curated_zone_name_overrides(unit_name, zones)

        # Build a trimmed view of the payload we care about
        current = {
            "source_key": key,
            "health": payload.get("health"),
            "damageable_zones": zones,
        }
        scope_tags = get_scope_tags_for_unit(unit_name)
        if scope_tags:
            current["scope_tags"] = scope_tags

        per_faction_candidates[faction][unit_name].append(current)

    per_faction: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    for faction, units in per_faction_candidates.items():
        for unit_name, candidates in units.items():
            canonical_payload, unit_variant_report = resolve_unit_candidates(candidates)
            per_faction[faction][unit_name] = canonical_payload
            if unit_variant_report:
                variant_report[faction][unit_name] = unit_variant_report

    # Stable alphabetical unit order by key when serialized (sort_keys=True on dump)
    return per_faction, variant_report

# --- CLI ------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description="Extract enemy units grouped by faction with health and damageable_zones.")
    ap.add_argument("-i", "--input", default="Filtered_Health.json", help="Path to master JSON")
    ap.add_argument("-o", "--output", default="enemydata.json", help="Path to write grouped JSON")
    ap.add_argument(
        "--variant-report",
        default="",
        help="Optional path to write non-canonical same-name payload variants for review.",
    )
    args = ap.parse_args()

    # Validate input file path
    if not args.input or not args.input.strip():
        ap.error("Input file path cannot be empty")
    
    input_path = args.input.strip()
    if not os.path.exists(input_path):
        ap.error(f"Input file not found: {input_path}")
    
    if not os.path.isfile(input_path):
        ap.error(f"Input path is not a file: {input_path}")

    # Validate output file path
    if not args.output or not args.output.strip():
        ap.error("Output file path cannot be empty")
    
    output_path = args.output.strip()
    output_dir = os.path.dirname(output_path)
    
    # Check if output directory exists or can be created
    if output_dir and not os.path.exists(output_dir):
        try:
            os.makedirs(output_dir, exist_ok=True)
        except OSError as e:
            ap.error(f"Cannot create output directory '{output_dir}': {e}")

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    result, variant_report = parse_enemy_units(data)

    # Convert defaultdicts to plain dicts for serialization
    result_out = {fac: dict(units) for fac, units in result.items()}
    variant_report_out = {
        fac: dict(units)
        for fac, units in variant_report.items()
        if units
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result_out, f, ensure_ascii=False, indent=2, sort_keys=True)

    variant_report_path = args.variant_report.strip()
    if variant_report_path:
        variant_report_dir = os.path.dirname(variant_report_path)
        if variant_report_dir and not os.path.exists(variant_report_dir):
            try:
                os.makedirs(variant_report_dir, exist_ok=True)
            except OSError as e:
                ap.error(f"Cannot create variant report directory '{variant_report_dir}': {e}")
        with open(variant_report_path, "w", encoding="utf-8") as f:
            json.dump(variant_report_out, f, ensure_ascii=False, indent=2, sort_keys=True)
        print(f"Wrote {variant_report_path} with {sum(len(units) for units in variant_report_out.values())} variant groups.")

    total_units = sum(len(units) for units in result_out.values())
    print(f"Wrote {output_path} with {total_units} units across {len(result_out)} factions.")
    for fac in sorted(result_out.keys()):
        print(f"- {fac}: {len(result_out[fac])}")
    if variant_report_out and not variant_report_path:
        total_variant_groups = sum(len(units) for units in variant_report_out.values())
        print(f"- Review note: {total_variant_groups} same-name variant groups were detected; re-run with --variant-report to inspect them.")

if __name__ == "__main__":
    main()
