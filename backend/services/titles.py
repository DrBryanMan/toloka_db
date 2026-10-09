#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import json
import subprocess
from backend.config import BASE_DIR, FOR_AGENTS_DIR, CATALOG_COLS, get_db, compilation_candidate_filter

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

def get_incomplete_list():
    """Return detailed list of incomplete topics from toloka.db."""
    with get_db(timeout=5) as con:
        cur = con.cursor()
        cur.execute("""
            SELECT topic_id, title, url, uploader, genres, files, synopsis, content_type, poster_url, registered_at
            FROM topics 
            WHERE uploader IS NULL OR uploader = '' 
               OR genres IS NULL OR genres = '[]' 
               OR files IS NULL OR files = '[]' 
               OR synopsis IS NULL OR synopsis = '' 
               OR content_type = 'movie?'
            ORDER BY topic_id DESC
        """)
        rows = cur.fetchall()
        items = []
        for r in rows:
            tid, title, url, uploader, genres, files, synopsis, c_type, poster_url, registered_at = r
            missing = []
            if not uploader:
                missing.append("uploader")
            if not synopsis:
                missing.append("synopsis")
            if not genres or genres == "[]":
                missing.append("genres")
            if not files or files == "[]":
                missing.append("files")
            if c_type == "movie?":
                missing.append("movie_guess")

            items.append({
                "topic_id": tid,
                "title": title or f"#{tid}",
                "url": url or f"https://toloka.to/t{tid}",
                "uploader": uploader or "",
                "content_type": c_type or "",
                "poster_url": poster_url or "",
                "registered_at": registered_at or "",
                "missing": missing
            })
        return {"items": items, "count": len(items)}

def get_compilation_stats():
    """Return count of candidate compilations, confirmed compilations, and total child items."""
    where_sql, params = compilation_candidate_filter()
    with get_db(timeout=5) as con:
        cur = con.cursor()
        cur.execute(f"SELECT COUNT(*) FROM topics WHERE {where_sql}", params)
        cand_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM topics WHERE is_compilation = 1")
        confirmed_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM compilation_items")
        parts_cnt = cur.fetchone()[0]
        return {
            "compilation_candidates_count": cand_cnt,
            "confirmed_compilations_count": confirmed_cnt,
            "total_parts_count": parts_cnt
        }

def get_compilation_list():
    """Return list of candidate and processed compilations in toloka.db."""
    where_sql, params = compilation_candidate_filter("t")
    with get_db(timeout=5) as con:
        cur = con.cursor()
        cur.execute(f"""
            SELECT 
                t.topic_id, t.title, t.url, t.uploader, t.poster_url, t.is_compilation,
                COUNT(ci.id) AS parts_count
            FROM topics t
            LEFT JOIN compilation_items ci ON ci.parent_topic_id = t.topic_id
            WHERE {where_sql}
            GROUP BY t.topic_id
            ORDER BY t.is_compilation DESC, parts_count DESC, t.topic_id DESC
        """, params)
        items = [
            {
                "topic_id": tid,
                "title": title or f"#{tid}",
                "url": url or f"https://toloka.to/t{tid}",
                "uploader": uploader or "",
                "poster_url": poster_url or "",
                "is_compilation": bool(is_comp),
                "parts_count": parts_cnt or 0
            }
            for tid, title, url, uploader, poster_url, is_comp, parts_cnt in cur.fetchall()
        ]
        return {"items": items, "count": len(items)}

def get_title_by_id(tid):
    """Retrieve and format a single catalog title (including compilation parents and child items)."""
    with get_db(timeout=5) as con:
        cur = con.cursor()
        from build_catalog_data import format_catalog_item, format_compilation_card
        
        # 1. Try to find in topics
        cur.execute(f"SELECT {CATALOG_COLS} FROM topics WHERE topic_id = ?", (tid,))
        row = cur.fetchone()
        if row:
            item = format_catalog_item(row, base_dir=str(BASE_DIR))
            if item.get("is_compilation"):
                cur.execute("""
                    SELECT 
                        id, parent_topic_id, item_index, item_id, title, title_ua, title_orig, year, 
                        content_type, genres, country, studio, director, synopsis, duration_raw, 
                        quality, poster_url, local_poster, adaptation_team, raw_fields, files, 
                        voc_teams, external_ids
                    FROM compilation_items
                    WHERE parent_topic_id = ?
                    ORDER BY item_index
                """, (tid,))
                child_rows = cur.fetchall()
                if child_rows:
                    item["parts_count"] = len(child_rows)
                    parts_summary = []
                    for cr in child_rows:
                        c_adapt = json.loads(cr[18]) if cr[18] else {}
                        c_tracks_count = len([k for k in c_adapt.keys() if any(k.lower().startswith(p) for p in ['аудіо', 'субтитри', 'відео'])])
                        parts_summary.append({
                            "index": cr[2],
                            "id": cr[3],
                            "title": cr[4],
                            "title_ua": cr[5] or cr[4],
                            "title_orig": cr[6] or "",
                            "year": cr[7] or "",
                            "quality": cr[15] or "",
                            "poster": cr[16] or "",
                            "genres": json.loads(cr[9]) if cr[9] else [],
                            "track_count": c_tracks_count,
                            "adaptation_team": c_adapt,
                            "voc_teams": json.loads(cr[21]) if cr[21] else []
                        })
                    item["parts"] = parts_summary
            return item

        # 2. If not found in topics, check compilation_items
        cur.execute("""
            SELECT 
                id, parent_topic_id, item_index, item_id, title, title_ua, title_orig, year, 
                content_type, genres, country, studio, director, synopsis, duration_raw, 
                quality, poster_url, local_poster, adaptation_team, raw_fields, files, 
                voc_teams, external_ids
            FROM compilation_items
            WHERE item_id = ?
        """, (tid,))
        cr = cur.fetchone()
        if cr:
            pid = cr[1]
            cur.execute(f"SELECT {CATALOG_COLS} FROM topics WHERE topic_id = ?", (pid,))
            p_row = cur.fetchone()
            parent_item = format_catalog_item(p_row, base_dir=str(BASE_DIR)) if p_row else {}
            return format_compilation_card(cr, parent_item, base_dir=str(BASE_DIR))

        return None

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

def _clean_local_poster_files(poster_paths, ids=None):
    """Safely delete cached poster file(s) from disk if they exist."""
    posters_dir = BASE_DIR / "img" / "posters"
    cleaned_count = 0
    if not posters_dir.exists():
        return 0

    seen_paths = set()
    for p_path in (poster_paths or []):
        if not p_path:
            continue
        try:
            full_path = (BASE_DIR / p_path.replace("\\", "/").lstrip("/")).resolve()
            if full_path in seen_paths:
                continue
            seen_paths.add(full_path)
            # Ensure it is inside img/posters to avoid deleting anything outside
            if posters_dir.resolve() in full_path.parents and full_path.is_file():
                full_path.unlink(missing_ok=True)
                cleaned_count += 1
        except Exception as e:
            print(f"Warning: could not delete poster {p_path}: {e}")

    for tid in (ids or []):
        if not tid:
            continue
        try:
            for f in posters_dir.glob(f"{tid}.*"):
                if f.resolve() not in seen_paths and f.is_file():
                    seen_paths.add(f.resolve())
                    f.unlink(missing_ok=True)
                    cleaned_count += 1
        except Exception as e:
            print(f"Warning: could not delete poster files for ID {tid}: {e}")

    # Clean any lingering .tmp files in posters directory
    for tmp_file in posters_dir.glob("*.tmp"):
        try:
            if tmp_file.resolve() not in seen_paths and tmp_file.is_file():
                seen_paths.add(tmp_file.resolve())
                tmp_file.unlink(missing_ok=True)
                cleaned_count += 1
        except Exception:
            pass

    return cleaned_count

def delete_title(req_data):
    """Delete a title from database (topics or compilation_items), cleanup local poster files, and trigger catalog rebuild."""
    tid = req_data.get("id") if isinstance(req_data, dict) else req_data
    if tid is None or str(tid).strip() == "":
        raise ValueError("Вкажіть ID тайтлу")

    try:
        num_id = int(tid)
    except (ValueError, TypeError):
        raise ValueError(f"Некоректний ID: {tid}")

    deleted_topics = 0
    deleted_parts = 0
    title_name = ""
    posters_to_clean = []
    ids_to_clean = [num_id]

    with get_db() as con:
        cur = con.cursor()
        # 1. Check if it's a main topic
        cur.execute("SELECT topic_id, title, local_poster FROM topics WHERE topic_id = ?", (num_id,))
        topic_row = cur.fetchone()
        if topic_row:
            title_name = topic_row[1] or f"#{num_id}"
            if topic_row[2]:
                posters_to_clean.append(topic_row[2])

            # Query child compilation items posters & IDs before deleting
            cur.execute("SELECT item_id, local_poster FROM compilation_items WHERE parent_topic_id = ?", (num_id,))
            child_rows = cur.fetchall()
            for cr in child_rows:
                if cr[0]:
                    ids_to_clean.append(cr[0])
                if cr[1]:
                    posters_to_clean.append(cr[1])

            # Delete child compilation parts if this topic was a compilation
            cur.execute("DELETE FROM compilation_items WHERE parent_topic_id = ?", (num_id,))
            deleted_parts += cur.rowcount
            # Delete topic
            cur.execute("DELETE FROM topics WHERE topic_id = ?", (num_id,))
            deleted_topics += cur.rowcount
        else:
            # 2. Check if it's a child compilation item
            cur.execute("SELECT id, parent_topic_id, title, item_id, local_poster FROM compilation_items WHERE item_id = ? OR id = ?", (num_id, num_id))
            item_row = cur.fetchone()
            if item_row:
                cid, pid, title_name, c_item_id, c_poster = item_row[0], item_row[1], item_row[2] or f"#{num_id}", item_row[3], item_row[4]
                if c_poster:
                    posters_to_clean.append(c_poster)
                if c_item_id:
                    ids_to_clean.append(c_item_id)

                cur.execute("DELETE FROM compilation_items WHERE id = ?", (cid,))
                deleted_parts += cur.rowcount
                # Check if parent still has any compilation items
                cur.execute("SELECT COUNT(*) FROM compilation_items WHERE parent_topic_id = ?", (pid,))
                if cur.fetchone()[0] == 0:
                    cur.execute("UPDATE topics SET is_compilation = 0 WHERE topic_id = ?", (pid,))

        con.commit()

    if deleted_topics > 0 or deleted_parts > 0:
        cleaned_posters = _clean_local_poster_files(posters_to_clean, ids_to_clean)
        rebuild_catalog_async()
        return {
            "success": True,
            "id": num_id,
            "title": title_name,
            "deleted_topics": deleted_topics,
            "deleted_parts": deleted_parts,
            "cleaned_posters": cleaned_posters
        }
    else:
        raise ValueError(f"Тайтл з ID #{num_id} не знайдено в базі даних")

