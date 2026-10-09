#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hikka API Data Enrichment Service.
Enriches missing metadata (genres, synopsis, studio, country, director)
via https://api.hikka.io/anime/{slug} and https://api.hikka.io/anime/{slug}/staff.
"""

import re
import json
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime
from backend.config import get_db

HIKKA_API_BASE = "https://api.hikka.io"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json"
}


def clean_markdown_text(text: str) -> str:
    """Removes Markdown links, bold/italic markers, and normalizes whitespace."""
    if not text:
        return ""
    # Replace [Text](https://...) with Text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove excessive whitespace / carriage returns
    text = re.sub(r'\r\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_hikka_slug(val: str) -> str:
    """Extracts slug from Hikka URL or plain slug string."""
    if not val:
        return ""
    val = str(val).strip()
    m = re.search(r'hikka\.io/anime/([^/?#]+)', val)
    if m:
        return m.group(1).rstrip('/')
    if '/' not in val and not val.startswith('http'):
        return val
    return val.rstrip('/').split('/')[-1]


def detect_country(title_native: str, default: str = "Японія") -> str:
    """
    Detects country from original title native script.
    - Hangul (Korean): AC00-D7A3 -> Південна Корея
    - Hanzi only (Chinese): 4E00-9FFF without Hiragana/Katakana -> Китай
    - Japanese: Hiragana/Katakana (3040-30FF) or default -> Японія
    """
    if not title_native:
        return default

    # Check for Korean Hangul syllables
    if re.search(r'[\uac00-\ud7a3]', title_native):
        return "Південна Корея"

    has_kana = bool(re.search(r'[\u3040-\u30ff]', title_native))
    has_hanzi = bool(re.search(r'[\u4e00-\u9fff]', title_native))

    if has_hanzi and not has_kana:
        return "Китай"

    return default


def fetch_hikka_json(url: str, post_data: dict = None, timeout: int = 10, retries: int = 2):
    """Safely fetches JSON from Hikka API with retry mechanism."""
    for attempt in range(retries):
        try:
            req_data = json.dumps(post_data).encode("utf-8") if post_data is not None else None
            req = urllib.request.Request(url, data=req_data, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw)
        except urllib.error.HTTPError as he:
            if he.code == 404:
                return None
            if he.code == 429 and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            if attempt == retries - 1:
                return None
        except Exception:
            if attempt < retries - 1:
                time.sleep(1.0)
                continue
            return None
    return None


def get_hikka_anime_data(slug: str) -> dict:
    """
    Fetches anime details from https://api.hikka.io/anime/{slug}.
    Returns parsed dictionary with genres, studios, synopsis, country, mal_id, year.
    """
    slug = extract_hikka_slug(slug)
    if not slug:
        return {}

    url = f"{HIKKA_API_BASE}/anime/{slug}"
    data = fetch_hikka_json(url)
    if not data or not isinstance(data, dict):
        return {}

    # 1. Genres
    genres = []
    for g in data.get("genres", []):
        name_ua = (g.get("name_ua") or "").strip().lower()
        if name_ua and name_ua not in genres:
            genres.append(name_ua)

    # 2. Studios / Companies
    studios = []
    producers = []
    for c in data.get("companies", []):
        comp = c.get("company")
        if not comp:
            continue
        c_name = comp.get("name", "").strip()
        if not c_name:
            continue
        c_type = c.get("type")
        if c_type == "studio" and c_name not in studios:
            studios.append(c_name)
        elif c_type == "producer" and c_name not in producers:
            producers.append(c_name)

    studio_str = ", ".join(studios) if studios else (", ".join(producers[:2]) if producers else "")

    # 3. Synopsis
    synopsis_ua = clean_markdown_text(data.get("synopsis_ua") or "")
    if not synopsis_ua:
        synopsis_ua = clean_markdown_text(data.get("synopsis_en") or "")

    # 4. Country
    country = detect_country(data.get("title_native") or "")

    # 5. Other fields
    mal_id = data.get("mal_id")
    year = data.get("year")
    episodes_total = data.get("episodes_total")

    return {
        "slug": slug,
        "genres": genres,
        "studio": studio_str,
        "synopsis": synopsis_ua,
        "country": country,
        "mal_id": mal_id,
        "year": year,
        "episodes_total": episodes_total,
        "title_ua": data.get("title_ua"),
        "title_en": data.get("title_en")
    }


def get_hikka_directors(slug: str) -> list:
    """
    Fetches staff list from https://api.hikka.io/anime/{slug}/staff
    and extracts all directors (role.slug == 'director').
    """
    slug = extract_hikka_slug(slug)
    if not slug:
        return []

    url = f"{HIKKA_API_BASE}/anime/{slug}/staff"
    data = fetch_hikka_json(url)
    if not data or not isinstance(data, dict):
        return []

    directors = []
    for item in data.get("list", []):
        roles = item.get("roles", [])
        is_director = False
        for r in roles:
            r_slug = (r.get("slug") or "").lower()
            r_name = (r.get("name_ua") or "").lower()
            if r_slug == "director" or "режисер" == r_name:
                is_director = True
                break

        if is_director:
            person = item.get("person", {})
            name = (person.get("name_ua") or person.get("name_en") or person.get("name_native") or "").strip()
            if name and name not in directors:
                directors.append(name)

    return directors


def search_hikka_slug(query: str) -> str:
    """Searches Hikka by title using POST /anime and returns the top matched slug."""
    if not query:
        return ""
    # Clean query (remove year, brackets, technical tags)
    clean_q = re.sub(r'\(.*?\)|\[.*?\]', '', query).strip()
    clean_q = re.sub(r'[\/|].*$', '', clean_q).strip()
    if not clean_q:
        clean_q = query.strip()

    data = fetch_hikka_json(f"{HIKKA_API_BASE}/anime", post_data={"query": clean_q})
    if data and isinstance(data, dict):
        items = data.get("list", [])
        if items and isinstance(items, list):
            return items[0].get("slug", "")
    return ""


def enrich_topic_from_hikka(topic_id: int, force: bool = False, delay: float = 0.25) -> dict:
    """
    Enriches a single topic in toloka.db using Hikka API for any missing fields.
    Does NOT overwrite existing non-empty fields unless force=True.
    Returns dictionary with operation results and updated fields.
    """
    with get_db() as con:
        cur = con.cursor()
        cur.execute("""
            SELECT topic_id, title, hikka_url, genres, studio, country, director, synopsis, external_ids, episode_count
            FROM topics
            WHERE topic_id = ?
        """, (topic_id,))
        row = cur.fetchone()

        if not row:
            return {"success": False, "error": f"Topic #{topic_id} not found"}

        tid, title, h_url, genres_raw, studio_col, country_col, director_col, syn_col, ext_ids_raw, ep_col = row

        # Parse existing genres
        try:
            genres_list = json.loads(genres_raw) if genres_raw else []
        except Exception:
            genres_list = []

        # Parse external_ids
        try:
            ext_ids = json.loads(ext_ids_raw) if ext_ids_raw else {}
        except Exception:
            ext_ids = {}

        # Determine slug
        slug = extract_hikka_slug(h_url or ext_ids.get("hikka") or "")
        if not slug:
            # Try searching Hikka by title
            slug = search_hikka_slug(title)
            if slug:
                h_url = f"https://hikka.io/anime/{slug}"
                ext_ids["hikka"] = h_url

        if not slug:
            return {"success": False, "error": "Hikka slug could not be found for title", "topic_id": topic_id}

        # Check what fields are actually missing
        need_genres = force or (not genres_list or len(genres_list) == 0)
        need_studio = force or (not studio_col or not str(studio_col).strip())
        need_synopsis = force or (not syn_col or not str(syn_col).strip())
        need_country = force or (not country_col or not str(country_col).strip())
        need_director = force or (not director_col or not str(director_col).strip())

        if not (need_genres or need_studio or need_synopsis or need_country or need_director) and not force:
            return {"success": True, "updated": False, "message": "All fields already populated", "topic_id": topic_id}

        updated_fields = {}

        # 1. Fetch main anime info if any metadata field is needed
        if need_genres or need_studio or need_synopsis or need_country:
            anime_data = get_hikka_anime_data(slug)
            if delay:
                time.sleep(delay)

            if anime_data:
                if need_genres and anime_data.get("genres"):
                    genres_list = anime_data["genres"]
                    updated_fields["genres"] = json.dumps(genres_list, ensure_ascii=False)

                if need_studio and anime_data.get("studio"):
                    studio_col = anime_data["studio"]
                    updated_fields["studio"] = studio_col

                if need_synopsis and anime_data.get("synopsis"):
                    syn_col = anime_data["synopsis"]
                    updated_fields["synopsis"] = syn_col

                if need_country and anime_data.get("country"):
                    country_col = anime_data["country"]
                    updated_fields["country"] = country_col

                # Bonus: if external_ids missing MAL and Hikka has mal_id
                if not ext_ids.get("myanimelist") and anime_data.get("mal_id"):
                    ext_ids["myanimelist"] = f"https://myanimelist.net/anime/{anime_data['mal_id']}"
                    updated_fields["external_ids"] = json.dumps(ext_ids, ensure_ascii=False)

        # 2. Fetch staff if director is needed (OPTIMIZATION: only called if director is missing)
        if need_director:
            directors = get_hikka_directors(slug)
            if delay:
                time.sleep(delay)

            if directors:
                director_col = ", ".join(directors)
                updated_fields["director"] = director_col

        if not updated_fields and not (h_url and not row[2]):
            return {"success": True, "updated": False, "message": "No new data found on Hikka", "topic_id": topic_id}

        # Build dynamic SQL update
        set_clauses = ["updated_at = datetime('now')"]
        sql_params = []

        if "genres" in updated_fields:
            set_clauses.append("genres = ?")
            sql_params.append(updated_fields["genres"])
        if "studio" in updated_fields:
            set_clauses.append("studio = ?")
            sql_params.append(updated_fields["studio"])
        if "director" in updated_fields:
            set_clauses.append("director = ?")
            sql_params.append(updated_fields["director"])
        if "synopsis" in updated_fields:
            set_clauses.append("synopsis = ?")
            sql_params.append(updated_fields["synopsis"])
        if "country" in updated_fields:
            set_clauses.append("country = ?")
            sql_params.append(updated_fields["country"])
        if "external_ids" in updated_fields:
            set_clauses.append("external_ids = ?")
            sql_params.append(updated_fields["external_ids"])
        if h_url and not row[2]:
            set_clauses.append("hikka_url = ?")
            sql_params.append(h_url)

        sql_params.append(topic_id)
        cur.execute(f"UPDATE topics SET {', '.join(set_clauses)} WHERE topic_id = ?", sql_params)
        con.commit()

        return {
            "success": True,
            "updated": True,
            "topic_id": topic_id,
            "slug": slug,
            "fields_enriched": list(updated_fields.keys()),
            "data": {
                "genres": genres_list,
                "studio": studio_col,
                "director": director_col,
                "country": country_col,
                "synopsis": syn_col,
                "synopsis_len": len(syn_col or ""),
                "external_ids": ext_ids
            }
        }


def batch_enrich_hikka(limit: int = 50, filter_type: str = "all", on_progress=None, on_item_done=None) -> dict:
    """
    Batch enriches incomplete titles using Hikka API.
    filter_type can be: 'all', 'studio', 'director', 'genres', 'synopsis', 'country'
    """
    if on_progress:
        on_progress(f"Пошук тайтлів для збагачення через Hikka API (фільтр: {filter_type}, ліміт: {limit})...", "info")

    where_conditions = ["content_type != 'amv'"]
    if filter_type == "studio":
        where_conditions.append("(studio IS NULL OR trim(studio) = '')")
    elif filter_type == "director":
        where_conditions.append("(director IS NULL OR trim(director) = '')")
    elif filter_type == "genres":
        where_conditions.append("(genres IS NULL OR genres = '' OR genres = '[]')")
    elif filter_type == "synopsis":
        where_conditions.append("(synopsis IS NULL OR trim(synopsis) = '')")
    elif filter_type == "country":
        where_conditions.append("(country IS NULL OR trim(country) = '')")
    else:
        where_conditions.append("""(
            (studio IS NULL OR trim(studio) = '') OR
            (director IS NULL OR trim(director) = '') OR
            (genres IS NULL OR genres = '' OR genres = '[]') OR
            (synopsis IS NULL OR trim(synopsis) = '') OR
            (country IS NULL OR trim(country) = '')
        )""")

    with get_db() as con:
        cur = con.cursor()
        query = f"""
            SELECT topic_id, title, hikka_url
            FROM topics
            WHERE {' AND '.join(where_conditions)}
            ORDER BY (hikka_url IS NOT NULL AND hikka_url != '') DESC, topic_id DESC
            LIMIT ?
        """
        cur.execute(query, (limit,))
        candidates = cur.fetchall()

    total_candidates = len(candidates)
    if on_progress:
        on_progress(f"Знайдено {total_candidates} тайтлів з незаповненими даними.", "info")

    if on_item_done:
        try:
            on_item_done(0, total_candidates, 0, None)
        except Exception:
            pass

    enriched_count = 0
    enriched_items = []

    for idx, (tid, title, h_url) in enumerate(candidates):
        short_title = title[:45] + ("..." if len(title) > 45 else "")
        if on_progress:
            on_progress(f"[{idx+1}/{total_candidates}] Збагачення #{tid}: {short_title}...", "info")

        try:
            res = enrich_topic_from_hikka(tid, delay=0.25)
            if res.get("updated"):
                enriched_count += 1
                fields_str = ", ".join(res.get("fields_enriched", []))
                if on_progress:
                    on_progress(f"  ✓ #{tid} успішно оновлено поля: {fields_str}", "success")
                item_entry = {
                    "topic_id": tid,
                    "title": title,
                    "fields": res.get("fields_enriched", []),
                    "data": res.get("data", {})
                }
                enriched_items.append(item_entry)
            else:
                msg = res.get("message") or res.get("error") or "дані не знайдено"
                if on_progress:
                    on_progress(f"  – #{tid}: {msg}", "info")
                item_entry = {
                    "topic_id": tid,
                    "title": title,
                    "fields": [],
                    "message": msg
                }
        except Exception as e:
            if on_progress:
                on_progress(f"  ⚠ Помилка при обробці #{tid}: {e}", "warn")
            item_entry = {
                "topic_id": tid,
                "title": title,
                "error": str(e)
            }

        if on_item_done:
            try:
                on_item_done(idx + 1, total_candidates, enriched_count, item_entry)
            except Exception:
                pass

        time.sleep(0.1)


    if on_progress:
        on_progress(f"Збагачення завершено! Оновлено {enriched_count} із {total_candidates} тайтлів.", "success")

    return {
        "success": True,
        "total_checked": total_candidates,
        "enriched_count": enriched_count,
        "items": enriched_items
    }
