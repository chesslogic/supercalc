#!/usr/bin/env python3
"""
Coordinate report-first patch refresh checks without updating runtime datasets.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


REPO_ROOT = Path(__file__).resolve().parents[1]
TOOLS_DIR = REPO_ROOT / "tools"

DEFAULT_OUTPUT_DIR = TOOLS_DIR / "artifacts" / "patch_refresh"
DEFAULT_ENEMY_CURRENT_PATH = REPO_ROOT / "enemies" / "enemydata.json"
DEFAULT_WEAPON_CSV_PATH = REPO_ROOT / "weapons" / "weapondata.csv"
DEFAULT_ENEMY_SIDECAR_PATH = REPO_ROOT / "enemies" / "wikigg-enemy-anatomy-sidecar.json"
DEFAULT_ATTACK_INGEST_PATH = TOOLS_DIR / "issues" / "wikigg-stratagem-attacks.json"

VALIDATION_REPORT_DIR_NAME = "wiki_validation"
ENEMY_VALIDATION_OUTPUT_NAME = "enemy-anatomy-validation.json"
ATTACK_VALIDATION_OUTPUT_NAME = "stratagem-attack-validation.json"
VALIDATION_INDEX_OUTPUT_NAME = "index.json"


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def derive_run_id(generated_at: str) -> str:
    normalized = generated_at.replace(":", "").replace("-", "")
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", normalized).strip("-") or "patch-refresh"


def resolve_path(raw_path: str) -> Path:
    return Path(raw_path.strip()).resolve()


def repo_relative_path(path: Path) -> str | None:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return None


def path_info(path: Path) -> Dict[str, Any]:
    resolved = path.resolve()
    info: Dict[str, Any] = {
        "path": str(resolved),
        "exists": resolved.exists(),
    }
    relative_path = repo_relative_path(resolved)
    if relative_path is not None:
        info["relative_path"] = relative_path
    if resolved.is_file():
        info["size_bytes"] = resolved.stat().st_size
    return info


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write("\n")


def build_source_manifest(
    *,
    enemy_current_path: Path,
    weapon_csv_path: Path,
    enemy_sidecar_path: Path,
    attack_ingest_path: Path,
) -> Dict[str, Any]:
    return {
        "runtime_datasets": {
            "enemy_data": path_info(enemy_current_path),
            "weapon_csv": path_info(weapon_csv_path),
        },
        "wiki_ingest_artifacts": {
            "enemy_anatomy_sidecar": path_info(enemy_sidecar_path),
            "stratagem_attack_ingest": path_info(attack_ingest_path),
        },
        "helpers": {
            "validation_report_builder": path_info(TOOLS_DIR / "build_wikigg_validation_reports.py"),
            "attack_ingest": path_info(TOOLS_DIR / "ingest_wikigg_attacks.py"),
            "enemy_anatomy_ingest": path_info(TOOLS_DIR / "ingest_wikigg_enemy_anatomy.py"),
        },
        "refresh_notes": {
            "weapon_notes": path_info(TOOLS_DIR / "weapondata-refresh.txt"),
            "enemy_notes": path_info(TOOLS_DIR / "enemydata-refresh.txt"),
        },
    }


def missing_inputs(paths: Dict[str, Path]) -> Dict[str, Dict[str, Any]]:
    return {label: path_info(path) for label, path in paths.items() if not path.exists()}


def summarize_validation_state(reports: Dict[str, Any]) -> str:
    statuses = [report.get("status") for report in reports.values()]
    if not statuses:
        return "skipped"
    if any(status == "failed" for status in statuses):
        return "failed"
    if all(status == "completed" for status in statuses):
        return "completed"
    if any(status == "completed" for status in statuses):
        return "partial"
    return "skipped"


def build_validation_reports(
    *,
    enemy_current_path: Path,
    weapon_csv_path: Path,
    enemy_sidecar_path: Path,
    attack_ingest_path: Path,
    validation_output_dir: Path,
    skip_enemy: bool,
    skip_attacks: bool,
) -> Dict[str, Any]:
    try:
        from build_wikigg_validation_reports import (
            aggregate_review_queue_summaries,
            build_attack_validation_report,
            build_enemy_validation_report,
            load_json,
            review_queue_summary,
        )
        from enemy_refresh_rules import DEFAULT_RULES_PATH as DEFAULT_ENEMY_RULES_PATH, load_enemy_refresh_rules
        from weapon_refresh_rules import load_weapon_refresh_rules
    except ModuleNotFoundError:  # pragma: no cover - package-style import fallback
        from tools.build_wikigg_validation_reports import (
            aggregate_review_queue_summaries,
            build_attack_validation_report,
            build_enemy_validation_report,
            load_json,
            review_queue_summary,
        )
        from tools.enemy_refresh_rules import DEFAULT_RULES_PATH as DEFAULT_ENEMY_RULES_PATH, load_enemy_refresh_rules
        from tools.weapon_refresh_rules import load_weapon_refresh_rules

    validation_output_dir.mkdir(parents=True, exist_ok=True)
    reports: Dict[str, Any] = {}
    generated_reports: Dict[str, Any] = {}
    validation_index: Dict[str, Any] = {
        "metadata": {
            "tool": r"tools\run_patch_refresh.py",
            "output_dir": str(validation_output_dir),
        },
        "reports": {},
    }

    enemy_output_path = validation_output_dir / ENEMY_VALIDATION_OUTPUT_NAME
    attack_output_path = validation_output_dir / ATTACK_VALIDATION_OUTPUT_NAME

    if skip_enemy:
        reports["enemy_anatomy"] = {
            "status": "skipped",
            "reason": "disabled by --skip-enemy-validation",
            "output_path": str(enemy_output_path),
        }
    else:
        missing = missing_inputs(
            {
                "enemy_current": enemy_current_path,
                "enemy_sidecar": enemy_sidecar_path,
            }
        )
        if missing:
            reports["enemy_anatomy"] = {
                "status": "skipped",
                "reason": "missing input",
                "missing_inputs": missing,
                "output_path": str(enemy_output_path),
            }
        else:
            try:
                enemy_report = build_enemy_validation_report(
                    current_data=load_json(enemy_current_path),
                    wiki_sidecar=load_json(enemy_sidecar_path),
                    current_path=enemy_current_path,
                    wiki_path=enemy_sidecar_path,
                    refresh_rules=load_enemy_refresh_rules(),
                    refresh_rules_path=DEFAULT_ENEMY_RULES_PATH,
                )
                write_json(enemy_output_path, enemy_report)
                reports["enemy_anatomy"] = {
                    "status": "completed",
                    "output_path": str(enemy_output_path),
                    "summary": enemy_report["summary"],
                    "review_queue": review_queue_summary(enemy_report.get("review_queue")),
                }
                generated_reports["enemy_anatomy"] = enemy_report
                validation_index["reports"]["enemy_anatomy"] = {
                    "output_path": str(enemy_output_path),
                    "summary": enemy_report["summary"],
                    "review_queue": review_queue_summary(enemy_report.get("review_queue")),
                }
            except Exception as exc:  # pragma: no cover - defensive status capture
                reports["enemy_anatomy"] = {
                    "status": "failed",
                    "error": f"{type(exc).__name__}: {exc}",
                    "output_path": str(enemy_output_path),
                }

    if skip_attacks:
        reports["stratagem_attacks"] = {
            "status": "skipped",
            "reason": "disabled by --skip-attack-validation",
            "output_path": str(attack_output_path),
        }
    else:
        missing = missing_inputs(
            {
                "weapon_csv": weapon_csv_path,
                "attack_ingest": attack_ingest_path,
            }
        )
        if missing:
            reports["stratagem_attacks"] = {
                "status": "skipped",
                "reason": "missing input",
                "missing_inputs": missing,
                "output_path": str(attack_output_path),
            }
        else:
            try:
                attack_report = build_attack_validation_report(
                    ingest_report=load_json(attack_ingest_path),
                    ingest_path=attack_ingest_path,
                    csv_path=weapon_csv_path,
                    rules=load_weapon_refresh_rules(required=True),
                )
                write_json(attack_output_path, attack_report)
                reports["stratagem_attacks"] = {
                    "status": "completed",
                    "output_path": str(attack_output_path),
                    "summary": attack_report["summary"],
                    "review_queue": review_queue_summary(attack_report.get("review_queue")),
                }
                generated_reports["stratagem_attacks"] = attack_report
                validation_index["reports"]["stratagem_attacks"] = {
                    "output_path": str(attack_output_path),
                    "summary": attack_report["summary"],
                    "review_queue": review_queue_summary(attack_report.get("review_queue")),
                }
            except Exception as exc:  # pragma: no cover - defensive status capture
                reports["stratagem_attacks"] = {
                    "status": "failed",
                    "error": f"{type(exc).__name__}: {exc}",
                    "output_path": str(attack_output_path),
                }

    validation_index_path = validation_output_dir / VALIDATION_INDEX_OUTPUT_NAME
    validation_index["status"] = summarize_validation_state(reports)
    validation_index["review_queue"] = aggregate_review_queue_summaries(generated_reports)
    validation_index["reports_status"] = reports
    write_json(validation_index_path, validation_index)

    return {
        "status": validation_index["status"],
        "output_dir": str(validation_output_dir),
        "index_path": str(validation_index_path),
        "reports": reports,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create a report-first patch refresh manifest and optional validation "
            "reports without modifying weapons\\weapondata.csv or enemies\\enemydata.json."
        )
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Base artifact directory. The manifest is written under <output-dir>\\<run-id>\\index.json.",
    )
    parser.add_argument(
        "--run-id",
        help="Deterministic run id to use for the artifact subdirectory.",
    )
    parser.add_argument(
        "--generated-at",
        help="Override the manifest timestamp, primarily for deterministic tests.",
    )
    parser.add_argument(
        "--enemy-current",
        default=str(DEFAULT_ENEMY_CURRENT_PATH),
        help="Path to the checked-in enemies\\enemydata.json input.",
    )
    parser.add_argument(
        "--weapon-csv",
        default=str(DEFAULT_WEAPON_CSV_PATH),
        help="Path to the checked-in weapons\\weapondata.csv input.",
    )
    parser.add_argument(
        "--enemy-sidecar",
        default=str(DEFAULT_ENEMY_SIDECAR_PATH),
        help="Path to the wiki.gg enemy anatomy sidecar JSON input.",
    )
    parser.add_argument(
        "--attack-ingest",
        default=str(DEFAULT_ATTACK_INGEST_PATH),
        help="Path to the wiki.gg stratagem attack ingest JSON input.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Only write the orchestration manifest; do not build validation reports.",
    )
    parser.add_argument(
        "--skip-enemy-validation",
        action="store_true",
        help="Skip the enemy anatomy validation report.",
    )
    parser.add_argument(
        "--skip-attack-validation",
        action="store_true",
        help="Skip the stratagem attack validation report.",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        default=True,
        help="Keep the refresh in report-only mode. This is currently the only supported mode.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    generated_at = args.generated_at.strip() if args.generated_at else current_timestamp()
    run_id = args.run_id.strip() if args.run_id else derive_run_id(generated_at)
    if not run_id:
        raise SystemExit("--run-id must not be blank")

    output_dir = resolve_path(args.output_dir)
    run_dir = output_dir / run_id
    manifest_path = run_dir / "index.json"
    validation_output_dir = run_dir / VALIDATION_REPORT_DIR_NAME

    enemy_current_path = resolve_path(args.enemy_current)
    weapon_csv_path = resolve_path(args.weapon_csv)
    enemy_sidecar_path = resolve_path(args.enemy_sidecar)
    attack_ingest_path = resolve_path(args.attack_ingest)

    manifest: Dict[str, Any] = {
        "schema_version": 1,
        "tool": r"tools\run_patch_refresh.py",
        "generated_at": generated_at,
        "run_id": run_id,
        "repo_root": str(REPO_ROOT),
        "mode": {
            "report_only": True,
            "auto_apply": False,
        },
        "inputs": build_source_manifest(
            enemy_current_path=enemy_current_path,
            weapon_csv_path=weapon_csv_path,
            enemy_sidecar_path=enemy_sidecar_path,
            attack_ingest_path=attack_ingest_path,
        ),
        "outputs": {
            "run_dir": str(run_dir),
            "manifest": str(manifest_path),
            "validation_report_dir": str(validation_output_dir),
        },
        "protected_runtime_datasets": {
            "enemy_data": {
                "path": str(enemy_current_path),
                "modified_by_tool": False,
            },
            "weapon_csv": {
                "path": str(weapon_csv_path),
                "modified_by_tool": False,
            },
        },
        "steps": [
            {
                "name": "ingest",
                "status": "not_run",
                "reason": "MVP orchestrator records existing ingest artifacts instead of fetching live wiki data.",
            }
        ],
    }

    if args.skip_validation:
        manifest["validation_reports"] = {
            "status": "skipped",
            "reason": "disabled by --skip-validation",
            "output_dir": str(validation_output_dir),
            "reports": {},
        }
    else:
        manifest["validation_reports"] = build_validation_reports(
            enemy_current_path=enemy_current_path,
            weapon_csv_path=weapon_csv_path,
            enemy_sidecar_path=enemy_sidecar_path,
            attack_ingest_path=attack_ingest_path,
            validation_output_dir=validation_output_dir,
            skip_enemy=args.skip_enemy_validation,
            skip_attacks=args.skip_attack_validation,
        )

    write_json(manifest_path, manifest)
    print(f"Patch refresh manifest: {manifest_path}")
    print(f"Validation status: {manifest['validation_reports']['status']}")
    print("Mode: report_only=true auto_apply=false")


if __name__ == "__main__":
    main()
