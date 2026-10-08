#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
from backend.config import BASE_DIR, FOR_AGENTS_DIR, get_db
from backend.state import TaskState

voc_sync_state = TaskState({
    "is_running": False,
    "status": "idle",
    "message": "Готовий до співставлення",
    "matched_count": 0,
    "new_matches_count": 0,
    "mal_count": 0,
    "hikka_count": 0,
    "watch_count": 0,
    "teams_count": 0,
    "types_count": 0,
    "latest_logs": [],
    "recent_matched": []
})

def add_voc_log(text, log_type="info"):
    voc_sync_state.add_log(text, log_type)

def refresh_voc_stats():
    """Query current VOC match stats from SQLite database."""
    try:
        with get_db() as con:
            cur = con.cursor()
            cur.execute("SELECT COUNT(*) FROM topics WHERE where_to_watch IS NOT NULL OR voc_teams IS NOT NULL OR hikka_url IS NOT NULL")
            voc_sync_state["matched_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE external_ids LIKE '%myanimelist%'")
            voc_sync_state["mal_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE hikka_url IS NOT NULL AND hikka_url != ''")
            voc_sync_state["hikka_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE where_to_watch IS NOT NULL AND where_to_watch != '[]' AND where_to_watch != ''")
            voc_sync_state["watch_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE voc_teams IS NOT NULL AND voc_teams != '[]' AND voc_teams != ''")
            voc_sync_state["teams_count"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE content_type IN ('tv', 'movie', 'movie?', 'ova', 'ona', 'special')")
            voc_sync_state["types_count"] = cur.fetchone()[0]
    except Exception:
        pass

# Initialize stats once on module import
refresh_voc_stats()

def run_background_voc_sync():
    voc_sync_state.reset_logs()
    voc_sync_state.update(
        is_running=True,
        status="running",
        message="Синхронізація з VOC-ALL...",
        recent_matched=[]
    )

    add_voc_log("Запуск співставлення роздач Толоки з VOC-ALL...", "info")
    try:
        import sync_voc_matches
        res = sync_voc_matches.run_sync(on_progress=add_voc_log)
        voc_sync_state.update(
            is_running=False,
            status="completed" if res.get("success") else "error",
            matched_count=res.get("matched_count", 0),
            new_matches_count=res.get("new_matches_count", 0),
            mal_count=res.get("mal_count", 0),
            hikka_count=res.get("hikka_count", 0),
            watch_count=res.get("watch_count", 0),
            teams_count=res.get("teams_count", 0),
            types_count=res.get("types_count", 0),
            recent_matched=res.get("recent_matched", []),
            message=f"Успішно співставлено {res.get('matched_count', 0)} тайтлів!"
        )
    except Exception as e:
        add_voc_log(f"Помилка співставлення: {e}", "error")
        voc_sync_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )
