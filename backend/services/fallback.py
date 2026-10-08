#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import subprocess
from datetime import datetime
from backend.config import BASE_DIR, DB_PATH, FOR_AGENTS_DIR, get_db

FULL_FALLBACK_FILE = BASE_DIR / "data" / "catalog_fallback.json"
LITE_FALLBACK_FILE = BASE_DIR / "data" / "catalog_fallback_lite.json"

def get_file_info(f):
    if not f.exists():
        return {"exists": False, "size_mb": 0.0, "updated_at": None, "titles_count": 0}
    stat = f.stat()
    size_mb = round(stat.st_size / (1024 * 1024), 2)
    updated_at = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    titles_count = 0
    try:
        with open(f, "r", encoding="utf-8") as fp:
            d = json.load(fp)
            titles_count = len(d.get("titles", []))
    except Exception:
        pass
    return {"exists": True, "size_mb": size_mb, "updated_at": updated_at, "titles_count": titles_count}

def get_fallback_status():
    """Return status of fallback files and sqlite database."""
    full_info = get_file_info(FULL_FALLBACK_FILE)
    full_info["file_name"] = "catalog_fallback.json"
    full_info["path"] = "data/catalog_fallback.json"

    lite_info = get_file_info(LITE_FALLBACK_FILE)
    lite_info["file_name"] = "catalog_fallback_lite.json"
    lite_info["path"] = "data/catalog_fallback_lite.json"

    db_count = 0
    db_size_mb = 0.0
    if DB_PATH.exists():
        db_size_mb = round(DB_PATH.stat().st_size / (1024 * 1024), 2)
        try:
            with get_db(timeout=5) as con:
                cur = con.cursor()
                cur.execute("SELECT COUNT(*) FROM topics WHERE content_type != 'amv'")
                db_count = cur.fetchone()[0]
        except Exception:
            pass

    return {
        "full": full_info,
        "lite": lite_info,
        "exists": full_info["exists"] or lite_info["exists"],
        "file_name": lite_info["file_name"] if lite_info["exists"] else full_info["file_name"],
        "path": lite_info["path"] if lite_info["exists"] else full_info["path"],
        "size_mb": lite_info["size_mb"] if lite_info["exists"] else full_info["size_mb"],
        "updated_at": lite_info["updated_at"] or full_info["updated_at"],
        "titles_count": lite_info["titles_count"] or full_info["titles_count"],
        "db_count": db_count,
        "db_size_mb": db_size_mb
    }

def generate_fallback(gen_type="both"):
    """Run build_fallback_json.py and return the updated metadata."""
    if gen_type not in ("full", "lite", "both"):
        gen_type = "both"

    script_path = FOR_AGENTS_DIR / "build_fallback_json.py"
    ret = subprocess.run([sys.executable, str(script_path), "--type", gen_type], cwd=str(BASE_DIR), capture_output=True, text=True, check=False)

    full_info = get_file_info(FULL_FALLBACK_FILE)
    full_info["file_name"] = "catalog_fallback.json"
    full_info["path"] = "data/catalog_fallback.json"

    lite_info = get_file_info(LITE_FALLBACK_FILE)
    lite_info["file_name"] = "catalog_fallback_lite.json"
    lite_info["path"] = "data/catalog_fallback_lite.json"

    target_info = lite_info if (gen_type == "lite" or (gen_type == "both" and lite_info["exists"])) else full_info

    return {
        "success": full_info["exists"] or lite_info["exists"],
        "type": gen_type,
        "full": full_info,
        "lite": lite_info,
        "file_name": target_info["file_name"],
        "path": target_info["path"],
        "titles_count": target_info["titles_count"],
        "size_mb": target_info["size_mb"],
        "updated_at": target_info["updated_at"],
        "output": ret.stdout
    }
