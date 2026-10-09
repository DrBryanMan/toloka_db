#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import sqlite3
from pathlib import Path
from contextlib import contextmanager

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

PORT = 8050
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "toloka.db"
FOR_AGENTS_DIR = BASE_DIR / "for agents"

# Щоденне автооновлення: парсинг -> збірка JSON -> commit & push
DAILY_SYNC_HOUR = 20
DAILY_SYNC_MINUTE = 0
DAILY_SYNC_PAGES = 1
DAILY_SYNC_FILES = (
    "data/catalog.js",
    "data/catalog_fallback.json",
    "data/catalog_fallback_lite.json",
)

if str(FOR_AGENTS_DIR) not in sys.path:
    sys.path.insert(0, str(FOR_AGENTS_DIR))

CATALOG_COLS = """
    topic_id, url, title, content_type, uploader, genres, 
    country, studio, director, synopsis, duration_raw, 
    episode_count, quality, poster_url, download_url, 
    external_ids, adaptation_team, raw_fields, where_to_watch, voc_teams, hikka_url,
    local_poster, episode_list, part, has_sub,
    files, seeders, torrent_size, registered_at, is_compilation
"""

# Маркери у назві, за якими роздача вважається кандидатом у збірники
COMPILATION_TITLE_KEYWORDS = (
    "колекція", "колекция", "збірка", "збірник", "collection", "antologia",
    "фільмографія", "трилогія", "дилогія", "квадрологія", "(фільми", "фільми 1-",
)

def compilation_candidate_filter(alias=""):
    """Return (sql_fragment, params) matching confirmed or candidate compilation topics."""
    p = f"{alias}." if alias else ""
    likes = " OR ".join(f"{p}title LIKE ?" for _ in COMPILATION_TITLE_KEYWORDS)
    params = tuple(f"%{kw}%" for kw in COMPILATION_TITLE_KEYWORDS)
    return f"({p}is_compilation = 1 OR {likes})", params

def get_toloka_credentials(username="", password=""):
    """Fetch credentials from args or fallback to VOC-ALL/.env"""
    if username and password:
        return username, password
    env_file = BASE_DIR.parent / "VOC-ALL" / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("TOLOKA_USERNAME="):
                        username = line.split("=", 1)[1].strip().strip('"').strip("'")
                    elif line.startswith("TOLOKA_PASSWORD="):
                        password = line.split("=", 1)[1].strip().strip('"').strip("'")
        except Exception:
            pass
    return username, password

@contextmanager
def get_db(timeout=10):
    """Context manager for SQLite database connection."""
    conn = sqlite3.connect(DB_PATH, timeout=timeout)
    try:
        yield conn
    finally:
        conn.close()
