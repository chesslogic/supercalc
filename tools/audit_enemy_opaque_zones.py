#!/usr/bin/env python3
"""
Audit enemydata.json for units whose damageable zones still use opaque names.

The report is intended to help wiki curation by ranking enemies with many or
important opaque zones so they can be checked against better naming sources.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    from compare_enemydata import HASH_NAME_RE, ensure_parent_dir, is_opaque_zone_name, normalize_zone
except ModuleNotFoundError:  # pragma: no cover - fallback for package-style imports
    from tools.compare_enemydata import HASH_NAME_RE, ensure_parent_dir, is_opaque_zone_name, normalize_zone


IMPORTANT_HEALTH_THRESHOLD = 1000
IMPORTANT_AV_THRESHOLD = 3
IMPORTANT_TO_MAIN_THRESHOLD = 0.75
DEFAULT_TOP = 20
DEFAULT_SAMPLE_LIMIT = 3

OPAQUE_NAME_KIND_ORDER = {
    "unknown": 0,
    "hash": 1,
    "numeric": 2,
    "blank": 3,
    "non-string": 4,
}
IMPORTANT_REASON_ORDER = {
    "IsFatal": 0,
    "health >= 1000": 1,
    "AV >= 3": 2,
    "ToMain% >= 0.75": 3,
}


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected top-level object in {path}")
    return data


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[1]
    default_input = repo_root / "enemies" / "enemydata.json"

    parser = argparse.ArgumentParser(
        description="Rank enemy units with opaque damageable zone names for wiki triage.",
    )
    parser.add_argument(
        "--input",
        default=str(default_input),
        help="Path to the curated enemydata JSON file (defaults to enemies\\enemydata.json).",
    )
    parser.add_argument(
        "--output",
        help="Optional path to write the JSON audit report.",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=DEFAULT_TOP,
        help="Maximum number of ranked candidates to include (0 or less keeps all).",
    )
    parser.add_argument(
        "--min-score",
        type=int,
        default=1,
        help="Minimum priority score required for a candidate to be reported.",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Print only the human-readable summary on stdout.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit on malformed faction, unit, or zone data instead of warning and continuing.",
    )
    return parser.parse_args()


def handle_warning(message: str, warnings: List[str], strict: bool) -> None:
    warnings.append(message)
    if strict:
        raise SystemExit(f"Strict mode: {message}")
    print(f"Warning: {message}", file=sys.stderr)


def to_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def is_truthy_flag(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


def classify_opaque_name(name: Any) -> str:
    if not isinstance(name, str):
        return "non-string"
    stripped = name.strip()
    if not stripped:
        return "blank"
    if stripped == "[unknown]":
        return "unknown"
    if stripped.isdigit():
        return "numeric"
    if HASH_NAME_RE.fullmatch(stripped):
        return "hash"
    return "readable"


def display_zone_name(name: Any) -> str:
    if isinstance(name, str):
        stripped = name.strip()
        if stripped:
            return stripped
        return "[blank]"
    return "[non-string]"


def collect_important_reasons(zone: Dict[str, Any]) -> List[str]:
    reasons: List[str] = []

    if is_truthy_flag(zone.get("IsFatal")):
        reasons.append("IsFatal")

    health = to_float(zone.get("health"))
    if health is not None and health >= IMPORTANT_HEALTH_THRESHOLD:
        reasons.append("health >= 1000")

    av = to_float(zone.get("AV"))
    if av is not None and av >= IMPORTANT_AV_THRESHOLD:
        reasons.append("AV >= 3")

    to_main = to_float(zone.get("ToMain%"))
    if to_main is not None and to_main >= IMPORTANT_TO_MAIN_THRESHOLD:
        reasons.append("ToMain% >= 0.75")

    return reasons


def order_counter(counter: Counter[str], order: Dict[str, int]) -> Dict[str, int]:
    return {
        key: counter[key]
        for key in sorted(counter, key=lambda item: (order.get(item, 99), item))
    }


def descending_numeric_key(value: Any) -> float:
    numeric = to_float(value)
    if numeric is None:
        return 1.0
    return -numeric


def build_zone_sample(zone: Dict[str, Any], zone_index: int) -> Dict[str, Any]:
    reasons = collect_important_reasons(zone)
    return {
        "zone_index": zone_index,
        "zone_name": display_zone_name(zone.get("zone_name")),
        "opaque_name_kind": classify_opaque_name(zone.get("zone_name")),
        "is_fatal": is_truthy_flag(zone.get("IsFatal")),
        "is_important": bool(reasons),
        "important_reasons": reasons,
        "signature": normalize_zone(zone),
    }


def build_signature_bucket(sample: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "count": 1,
        "fatal_count": int(sample["is_fatal"]),
        "important_count": int(sample["is_important"]),
        "zone_name_examples": [sample["zone_name"]],
        "signature": sample["signature"],
    }


def sort_zone_samples(samples: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ordered = list(samples)
    ordered.sort(
        key=lambda sample: (
            0 if sample["is_fatal"] else 1,
            0 if sample["is_important"] else 1,
            -len(sample["important_reasons"]),
            descending_numeric_key(sample["signature"].get("health")),
            descending_numeric_key(sample["signature"].get("AV")),
            descending_numeric_key(sample["signature"].get("ToMain%")),
            sample["zone_index"],
        )
    )
    return ordered


def sort_signature_buckets(buckets: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ordered = list(buckets)
    ordered.sort(
        key=lambda bucket: (
            -bucket["fatal_count"],
            -bucket["important_count"],
            -bucket["count"],
            descending_numeric_key(bucket["signature"].get("health")),
            descending_numeric_key(bucket["signature"].get("AV")),
            descending_numeric_key(bucket["signature"].get("ToMain%")),
            tuple(bucket["zone_name_examples"]),
        )
    )
    return ordered


def format_sample_details(sample: Dict[str, Any]) -> str:
    detail_bits: List[str] = []
    signature = sample["signature"]

    health = signature.get("health")
    av = signature.get("AV")
    to_main = signature.get("ToMain%")

    if health is not None:
        detail_bits.append(f"hp={health}")
    if av is not None:
        detail_bits.append(f"AV={av}")
    if to_main is not None:
        detail_bits.append(f"ToMain={to_main}")
    if sample["is_fatal"]:
        detail_bits.append("fatal")
    elif sample["is_important"]:
        detail_bits.append("important")

    if not detail_bits:
        return sample["zone_name"]
    return f"{sample['zone_name']} ({', '.join(detail_bits)})"


def build_candidate(
    faction_name: str,
    unit_name: str,
    unit_payload: Dict[str, Any],
    opaque_samples: List[Dict[str, Any]],
    sample_limit: int,
) -> Dict[str, Any]:
    opaque_name_kinds = Counter(sample["opaque_name_kind"] for sample in opaque_samples)
    important_reasons = Counter()
    signature_buckets: Dict[str, Dict[str, Any]] = {}

    for sample in opaque_samples:
        important_reasons.update(sample["important_reasons"])
        signature_key = json.dumps(sample["signature"], sort_keys=True, separators=(",", ":"))
        bucket = signature_buckets.get(signature_key)
        if bucket is None:
            signature_buckets[signature_key] = build_signature_bucket(sample)
            continue

        bucket["count"] += 1
        bucket["fatal_count"] += int(sample["is_fatal"])
        bucket["important_count"] += int(sample["is_important"])
        if sample["zone_name"] not in bucket["zone_name_examples"] and len(bucket["zone_name_examples"]) < sample_limit:
            bucket["zone_name_examples"].append(sample["zone_name"])

    opaque_count = len(opaque_samples)
    fatal_opaque_count = sum(1 for sample in opaque_samples if sample["is_fatal"])
    important_opaque_count = sum(1 for sample in opaque_samples if sample["is_important"])
    priority_score = opaque_count + (fatal_opaque_count * 3) + (important_opaque_count * 2)

    sorted_samples = sort_zone_samples(opaque_samples)
    sorted_buckets = sort_signature_buckets(signature_buckets.values())
    zone_count = len(unit_payload.get("damageable_zones") or [])

    return {
        "faction": faction_name,
        "unit_name": unit_name,
        "unit_health": unit_payload.get("health"),
        "scope_tags": unit_payload.get("scope_tags") or [],
        "zone_count": zone_count,
        "opaque_count": opaque_count,
        "fatal_opaque_count": fatal_opaque_count,
        "important_opaque_count": important_opaque_count,
        "priority_score": priority_score,
        "opaque_ratio": round(opaque_count / zone_count, 4) if zone_count else None,
        "opaque_name_kinds": order_counter(opaque_name_kinds, OPAQUE_NAME_KIND_ORDER),
        "important_reason_counts": order_counter(important_reasons, IMPORTANT_REASON_ORDER),
        "sample_opaque_zones": sorted_samples[:sample_limit],
        "opaque_signatures": sorted_buckets[:sample_limit],
    }


def audit_enemydata(data: Dict[str, Any], min_score: int, top: int, strict: bool) -> Dict[str, Any]:
    warnings: List[str] = []
    candidate_rows: List[Dict[str, Any]] = []
    valid_faction_count = 0
    valid_unit_count = 0
    opaque_unit_count = 0
    total_opaque_zone_count = 0
    total_fatal_opaque_zone_count = 0
    total_important_opaque_zone_count = 0

    for faction_name, faction_payload in data.items():
        if not isinstance(faction_payload, dict):
            handle_warning(
                f"Expected faction '{faction_name}' to contain a unit mapping.",
                warnings,
                strict,
            )
            continue

        valid_faction_count += 1

        for unit_name, unit_payload in faction_payload.items():
            if not isinstance(unit_payload, dict):
                handle_warning(
                    f"Expected unit '{faction_name}/{unit_name}' to be an object.",
                    warnings,
                    strict,
                )
                continue

            valid_unit_count += 1
            zones = unit_payload.get("damageable_zones")

            if zones is None:
                handle_warning(
                    f"Unit '{faction_name}/{unit_name}' is missing damageable_zones.",
                    warnings,
                    strict,
                )
                continue

            if not isinstance(zones, list):
                handle_warning(
                    f"Expected damageable_zones for '{faction_name}/{unit_name}' to be a list.",
                    warnings,
                    strict,
                )
                continue

            opaque_samples: List[Dict[str, Any]] = []

            for zone_index, zone in enumerate(zones):
                if not isinstance(zone, dict):
                    handle_warning(
                        f"Expected zone {zone_index} for '{faction_name}/{unit_name}' to be an object.",
                        warnings,
                        strict,
                    )
                    continue

                if not is_opaque_zone_name(zone.get("zone_name")):
                    continue

                sample = build_zone_sample(zone, zone_index)
                opaque_samples.append(sample)
                total_opaque_zone_count += 1
                total_fatal_opaque_zone_count += int(sample["is_fatal"])
                total_important_opaque_zone_count += int(sample["is_important"])

            if not opaque_samples:
                continue

            opaque_unit_count += 1
            candidate = build_candidate(
                faction_name=faction_name,
                unit_name=unit_name,
                unit_payload=unit_payload,
                opaque_samples=opaque_samples,
                sample_limit=DEFAULT_SAMPLE_LIMIT,
            )
            if candidate["priority_score"] >= min_score:
                candidate_rows.append(candidate)

    candidate_rows.sort(
        key=lambda candidate: (
            -candidate["priority_score"],
            -candidate["fatal_opaque_count"],
            -candidate["important_opaque_count"],
            -candidate["opaque_count"],
            -(candidate["opaque_ratio"] or 0),
            candidate["faction"].lower(),
            candidate["unit_name"].lower(),
        )
    )

    reported_candidates = candidate_rows if top <= 0 else candidate_rows[:top]
    for index, candidate in enumerate(reported_candidates, start=1):
        candidate["rank"] = index

    return {
        "summary": {
            "priority_score_formula": "opaque_count + fatal_opaque_count*3 + important_opaque_count*2",
            "important_conditions": [
                "IsFatal",
                "health >= 1000",
                "AV >= 3",
                "ToMain% >= 0.75",
            ],
            "faction_count": valid_faction_count,
            "unit_count": valid_unit_count,
            "opaque_unit_count": opaque_unit_count,
            "candidate_unit_count": len(candidate_rows),
            "reported_candidate_count": len(reported_candidates),
            "opaque_zone_count": total_opaque_zone_count,
            "fatal_opaque_zone_count": total_fatal_opaque_zone_count,
            "important_opaque_zone_count": total_important_opaque_zone_count,
            "min_score": min_score,
            "top_limit": None if top <= 0 else top,
            "warning_count": len(warnings),
        },
        "candidates": reported_candidates,
        "warnings": warnings,
    }


def print_human_summary(report: Dict[str, Any]) -> None:
    summary = report["summary"]

    print(
        "Summary:",
        f"factions={summary['faction_count']}",
        f"units={summary['unit_count']}",
        f"opaque_units={summary['opaque_unit_count']}",
        f"reported={summary['reported_candidate_count']}",
        f"opaque_zones={summary['opaque_zone_count']}",
        f"fatal_opaque={summary['fatal_opaque_zone_count']}",
        f"important_opaque={summary['important_opaque_zone_count']}",
        f"warnings={summary['warning_count']}",
    )

    if not report["candidates"]:
        print("No opaque-zone candidates matched the requested filters.")
        return

    for candidate in report["candidates"]:
        kind_bits = ", ".join(
            f"{kind}={count}" for kind, count in candidate["opaque_name_kinds"].items()
        )
        print(
            f"{candidate['rank']}. {candidate['faction']} / {candidate['unit_name']}",
            f"score={candidate['priority_score']}",
            f"opaque={candidate['opaque_count']}",
            f"fatal={candidate['fatal_opaque_count']}",
            f"important={candidate['important_opaque_count']}",
            f"kinds={kind_bits or 'n/a'}",
        )
        sample_details = "; ".join(
            format_sample_details(sample) for sample in candidate["sample_opaque_zones"]
        )
        if sample_details:
            print(f"   samples: {sample_details}")


def main() -> None:
    args = parse_args()

    input_path = Path(args.input.strip())
    output_path = Path(args.output.strip()) if args.output else None

    if not input_path.exists():
        raise SystemExit(f"Enemy data file not found: {input_path}")
    if not input_path.is_file():
        raise SystemExit(f"Enemy data path is not a file: {input_path}")

    data = load_json(input_path)
    report = audit_enemydata(
        data=data,
        min_score=args.min_score,
        top=args.top,
        strict=args.strict,
    )
    report["summary"]["input"] = str(input_path.resolve())

    if output_path is not None:
        ensure_parent_dir(output_path)
        with output_path.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(report, handle, indent=2, sort_keys=True, ensure_ascii=False)
            handle.write("\n")

    print_human_summary(report)

    if output_path is not None:
        print(f"Wrote report to {output_path}")
        return

    if not args.summary_only:
        print(json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
