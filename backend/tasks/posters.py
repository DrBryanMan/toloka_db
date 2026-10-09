#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import threading
from backend.state import TaskState

poster_stop_event = threading.Event()

poster_downloader_state = TaskState({
    "is_running": False,
    "status": "idle",
    "message": "Готовий до завантаження",
    "total_topics": 4150,
    "total_local": 0,
    "total_missing": 4150,
    "session_downloaded": 0,
    "session_errors": 0,
    "latest_logs": [],
    "recent_downloaded": []
})

def add_poster_log(text, log_type="info"):
    poster_downloader_state.add_log(text, log_type)

def add_poster_downloaded_item(item):
    with poster_downloader_state.lock:
        poster_downloader_state["session_downloaded"] += 1
        poster_downloader_state["total_local"] += 1
        if poster_downloader_state["total_missing"] > 0:
            poster_downloader_state["total_missing"] -= 1
        recent = poster_downloader_state["recent_downloaded"]
        recent.insert(0, item)
        if len(recent) > 60:
            recent.pop()

def refresh_poster_stats():
    """Update poster downloader count statistics."""
    try:
        import download_posters
        stats = download_posters.get_posters_stats()
        poster_downloader_state.update(
            total_topics=stats["total_topics"],
            total_local=stats["total_local"],
            total_missing=stats["total_missing"]
        )
    except Exception:
        pass

def run_background_poster_download(limit=0, overwrite=False):
    poster_stop_event.clear()
    poster_downloader_state.reset_logs()
    poster_downloader_state.update(
        is_running=True,
        status="running",
        message="Завантаження постерів..." if limit == 0 else f"Завантаження {limit} постерів...",
        session_downloaded=0,
        session_errors=0
    )

    add_poster_log("Запуск фонового завантаження постерів...", "info")
    try:
        import download_posters
        res = download_posters.run_download(
            limit=limit,
            overwrite=overwrite,
            on_progress=add_poster_log,
            on_downloaded=add_poster_downloaded_item,
            stop_event=poster_stop_event
        )
        poster_downloader_state.update(
            is_running=False,
            status="completed" if res.get("success") else "error",
            message=f"Завершено: завантажено {res.get('downloaded', 0)}, помилок: {res.get('errors', 0)}"
        )
        refresh_poster_stats()
    except Exception as e:
        add_poster_log(f"Помилка завантажувача: {e}", "error")
        poster_downloader_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )

def stop_poster_download():
    poster_stop_event.set()
    poster_downloader_state["message"] = "Зупинка завантаження..."
