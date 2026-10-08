#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import subprocess
from backend.config import BASE_DIR, FOR_AGENTS_DIR, CATALOG_COLS, get_db

def rebuild_catalog_async():
    """Trigger background rebuild of data/catalog.js."""
    subprocess.Popen([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR))

def rebuild_catalog_sync():
    """Synchronously rebuild data/catalog.js."""
    return subprocess.run([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR), check=False)

def get_incomplete_stats():
    """Return count of incomplete topics vs total count."""
    with get_db(timeout=5) as con:
        cur = con.cursor()
        cur.execute("""
            SELECT COUNT(*) FROM topics 
            WHERE uploader IS NULL OR uploader = '' 
               OR genres IS NULL OR genres = '[]' 
               OR files IS NULL OR files = '[]' 
               OR synopsis IS NULL OR synopsis = '' 
               OR content_type = 'movie?'
        """)
        inc_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM topics")
        tot_cnt = cur.fetchone()[0]
        return {"incomplete_count": inc_cnt, "total_count": tot_cnt}

def get_title_by_id(tid):
    """Retrieve and format a single catalog title."""
    with get_db(timeout=5) as con:
        cur = con.cursor()
        cur.execute(f"SELECT {CATALOG_COLS} FROM topics WHERE topic_id = ?", (tid,))
        row = cur.fetchone()
        if not row:
            return None
        from build_catalog_data import format_catalog_item
        return format_catalog_item(row, base_dir=str(BASE_DIR))

def _build_update_fields(item_dict):
    """Helper to parse frontend form fields into SQL column names and values."""
    update_fields = []
    update_vals = []

    if "title_ua" in item_dict or "title_orig" in item_dict or "year" in item_dict:
        title_ua = (item_dict.get("title_ua") or "").strip()
        title_orig = (item_dict.get("title_orig") or "").strip()
        year = item_dict.get("year")
        if title_ua and title_orig and year:
            combined_title = f"{title_ua} / {title_orig} ({year})"
        elif title_ua and title_orig:
            combined_title = f"{title_ua} / {title_orig}"
        elif title_ua and year:
            combined_title = f"{title_ua} ({year})"
        elif title_ua:
            combined_title = title_ua
        else:
            combined_title = None

        if combined_title:
            update_fields.append("title = ?")
            update_vals.append(combined_title)

    col_map = {
        "type": "content_type",
        "episodes": "episode_count",
        "duration": "duration_raw",
        "poster": "poster_url"
    }

    for field_name in ["type", "quality", "episodes", "duration", "studio", "director", "country", "poster", "synopsis"]:
        if field_name in item_dict:
            col = col_map.get(field_name, field_name)
            update_fields.append(f"{col} = ?")
            update_vals.append(item_dict[field_name])

    if "genres" in item_dict:
        update_fields.append("genres = ?")
        genres_val = item_dict["genres"]
        if isinstance(genres_val, list):
            update_vals.append(json.dumps(genres_val, ensure_ascii=False))
        elif isinstance(genres_val, str):
            update_vals.append(json.dumps([g.strip() for g in genres_val.split(',') if g.strip()], ensure_ascii=False))

    return update_fields, update_vals

def update_title(req_data):
    """Update single topic metadata in database and trigger async rebuild."""
    tid = req_data.get("id")
    if not tid:
        raise ValueError("Missing title id")

    update_fields, update_vals = _build_update_fields(req_data)

    if update_fields:
        update_fields.append("updated_at = datetime('now')")
        sql = f"UPDATE topics SET {', '.join(update_fields)} WHERE topic_id = ?"
        update_vals.append(tid)

        with get_db() as con:
            cur = con.cursor()
            cur.execute(sql, tuple(update_vals))
            con.commit()

        rebuild_catalog_async()

    return tid

def batch_update_titles(titles_list):
    """Batch update multiple topics in a single transaction."""
    if not isinstance(titles_list, list) or not titles_list:
        raise ValueError("Missing or empty titles array")

    updated_count = 0
    with get_db() as con:
        cur = con.cursor()
        for t_item in titles_list:
            tid = t_item.get("id")
            if not tid:
                continue

            update_fields, update_vals = _build_update_fields(t_item)
            if update_fields:
                update_fields.append("updated_at = datetime('now')")
                sql = f"UPDATE topics SET {', '.join(update_fields)} WHERE topic_id = ?"
                update_vals.append(tid)
                cur.execute(sql, tuple(update_vals))
                updated_count += 1

        con.commit()

    if updated_count > 0:
        rebuild_catalog_async()

    return updated_count
