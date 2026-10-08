#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from backend.config import get_db
from backend.state import TaskState

ext_sync_state = TaskState({
    "is_running": False,
    "status": "idle",
    "message": "Готовий до зіставлення баз даних",
    "total_topics": 0,
    "count_mal": 0,
    "count_imdb": 0,
    "count_al": 0,
    "count_hikka": 0,
    "new_enriched_count": 0,
    "latest_logs": [],
    "recent_items": []
})

def add_ext_log(text, log_type="info"):
    ext_sync_state.add_log(text, log_type)

def refresh_ext_stats():
    """Query external DB IDs counts from SQLite."""
    try:
        with get_db() as con:
            cur = con.cursor()
            cur.execute("SELECT COUNT(*) FROM topics")
            ext_sync_state["total_topics"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE external_ids LIKE '%myanimelist%'")
            ext_sync_state["count_mal"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE external_ids LIKE '%imdb%'")
            ext_sync_state["count_imdb"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE external_ids LIKE '%anilist%'")
            ext_sync_state["count_al"] = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM topics WHERE hikka_url IS NOT NULL OR external_ids LIKE '%hikka%'")
            ext_sync_state["count_hikka"] = cur.fetchone()[0]
    except Exception:
        pass

# Initialize counts once
refresh_ext_stats()

def run_background_ext_sync(hikka_fallback_limit=50):
    ext_sync_state.reset_logs()
    ext_sync_state.update(
        is_running=True,
        status="running",
        message="Зіставлення з базами даних (MAL, IMDb, Mikai, AniList)...",
        recent_items=[]
    )

    add_ext_log("Запуск зіставлення ID баз даних...", "info")
    try:
        import sync_external_ids
        res = sync_external_ids.run_external_sync(hikka_fallback_limit=hikka_fallback_limit, on_progress=add_ext_log)
        ext_sync_state.update(
            is_running=False,
            status="completed" if res.get("success") else "error",
            total_topics=res.get("total_topics", 0),
            count_mal=res.get("count_mal", 0),
            count_imdb=res.get("count_imdb", 0),
            count_al=res.get("count_al", 0),
            count_hikka=res.get("count_hikka", 0),
            new_enriched_count=res.get("new_enriched_count", 0),
            recent_items=res.get("recent_items", []),
            message=f"Оновлено {res.get('new_enriched_count', 0)} тайтлів новими ідентифікаторами!"
        )
    except Exception as e:
        add_ext_log(f"Помилка: {e}", "error")
        ext_sync_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )

def run_background_mikai_refresh(mode="ongoing"):
    ext_sync_state.update(
        is_running=True,
        status="running",
        message=f"Оновлення кешу Mikai ({'тільки онгоїнґи' if mode == 'ongoing' else 'повний каталог'})..."
    )
    try:
        import sync_external_ids
        sync_external_ids.download_mikai_cache(mode=mode, on_progress=add_ext_log)
        ext_sync_state.update(
            is_running=False,
            status="completed",
            message="Кеш Mikai API успішно оновлено!"
        )
    except Exception as e:
        add_ext_log(f"Помилка оновлення кешу: {e}", "error")
        ext_sync_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )
