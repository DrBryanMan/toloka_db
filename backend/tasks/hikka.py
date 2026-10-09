#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hikka Background Enrichment Task.
Coordinates batch and single-topic enrichment from Hikka API.
"""

import sys
import subprocess
from datetime import datetime
from backend.config import BASE_DIR, FOR_AGENTS_DIR, get_db
from backend.state import TaskState
from backend.services.hikka import enrich_topic_from_hikka, batch_enrich_hikka

hikka_state = TaskState({
    "is_running": False,
    "status": "idle",
    "message": "Готовий до збагачення через Hikka API",
    "total_candidates": 0,
    "missing_studio": 0,
    "missing_director": 0,
    "missing_genres": 0,
    "missing_synopsis": 0,
    "missing_country": 0,
    "enriched_count": 0,
    "latest_logs": [],
    "recent_items": []
})


def add_hikka_log(text: str, log_type: str = "info"):
    hikka_state.add_log(text, log_type)


def refresh_hikka_stats():
    """Calculates missing fields statistics for Hikka enrichment."""
    try:
        with get_db() as con:
            cur = con.cursor()
            cur.execute("""
                SELECT 
                    COUNT(*),
                    SUM(CASE WHEN studio IS NULL OR trim(studio) = '' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN director IS NULL OR trim(director) = '' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN genres IS NULL OR genres = '' OR genres = '[]' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN synopsis IS NULL OR trim(synopsis) = '' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN country IS NULL OR trim(country) = '' THEN 1 ELSE 0 END)
                FROM topics
                WHERE content_type != 'amv' AND (
                    (studio IS NULL OR trim(studio) = '') OR
                    (director IS NULL OR trim(director) = '') OR
                    (genres IS NULL OR genres = '' OR genres = '[]') OR
                    (synopsis IS NULL OR trim(synopsis) = '') OR
                    (country IS NULL OR trim(country) = '')
                )
            """)
            row = cur.fetchone()
            if row:
                hikka_state["total_candidates"] = row[0] or 0
                hikka_state["missing_studio"] = row[1] or 0
                hikka_state["missing_director"] = row[2] or 0
                hikka_state["missing_genres"] = row[3] or 0
                hikka_state["missing_synopsis"] = row[4] or 0
                hikka_state["missing_country"] = row[5] or 0
    except Exception:
        pass


# Initialize stats once on module load
refresh_hikka_stats()


def run_background_hikka_enrich(limit: int = 50, filter_type: str = "all"):
    """Runs batch enrichment in a background thread."""
    hikka_state.reset_logs()
    hikka_state.update(
        is_running=True,
        status="running",
        message=f"Збагачення тайтлів через Hikka API (ліміт: {limit})...",
        enriched_count=0,
        recent_items=[]
    )

    add_hikka_log(f"Запуск збагачення через Hikka API (фільтр: {filter_type}, ліміт: {limit})...", "info")

    try:
        res = batch_enrich_hikka(limit=limit, filter_type=filter_type, on_progress=add_hikka_log)
        enriched_count = res.get("enriched_count", 0)

        # Rebuild catalog data so front-end reflects changes
        add_hikka_log("Перебудова data/catalog.js...", "info")
        subprocess.run(
            [sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")],
            cwd=str(BASE_DIR),
            check=False
        )
        add_hikka_log("Каталог успішно оновлено новими даними!", "success")

        refresh_hikka_stats()

        hikka_state.update(
            is_running=False,
            status="completed",
            enriched_count=enriched_count,
            recent_items=res.get("items", []),
            message=f"Успішно збагачено {enriched_count} тайтлів через Hikka API!"
        )

    except Exception as e:
        add_hikka_log(f"Помилка збагачення: {e}", "error")
        hikka_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )


def enrich_single_hikka_sync(topic_id: int):
    """Enriches a single title and rebuilds catalog."""
    res = enrich_topic_from_hikka(topic_id)
    if res.get("updated"):
        try:
            from build_catalog_data import format_catalog_item, CATALOG_COLS
            with get_db() as con:
                cur = con.cursor()
                cur.execute(f"SELECT {CATALOG_COLS} FROM topics WHERE topic_id = ?", (topic_id,))
                row = cur.fetchone()
                if row:
                    item_formatted = format_catalog_item(row, base_dir=str(BASE_DIR))
                    res["title"] = item_formatted
            # Background rebuild
            import threading
            threading.Thread(
                target=lambda: subprocess.run([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR), check=False),
                daemon=True
            ).start()
        except Exception:
            pass
    return res
