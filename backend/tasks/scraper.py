#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
import sys
import time
import subprocess
import threading
from bs4 import BeautifulSoup

from backend.config import BASE_DIR, DB_PATH, FOR_AGENTS_DIR, CATALOG_COLS, get_toloka_credentials, get_db
from backend.state import TaskState
from backend.session import create_toloka_session, fetch_url, DEFAULT_HEADERS

scraper_state = TaskState({
    "is_running": False,
    "status": "idle",
    "message": "Готовий до роботи",
    "total_scraped": 0,
    "new_items": 0,
    "latest_logs": [],
    "recent_items": []
})

def add_log(text, log_type="info"):
    scraper_state.add_log(text, log_type)


def run_background_parse(pages=1, username="", password=""):
    is_all = str(pages).lower() == "all"
    pages_desc = "всі (~48 стор.)" if is_all else f"{pages} стор."

    scraper_state.reset_logs()
    scraper_state.update(
        is_running=True,
        status="running",
        message=f"Парсинг ({pages_desc}) Toloka Dub...",
        total_scraped=0,
        new_items=0,
        recent_items=[]
    )

    add_log(f"Запуск фонового парсингу ({pages_desc})...", "info")

    try:
        from toloka_parser_engine import parse_topic_full_data

        session = create_toloka_session(username, password, on_log=add_log)

        with get_db() as con:
            cur = con.cursor()
            cur.execute("SELECT topic_id, poster_url FROM topics")
            rows = cur.fetchall()
            known_ids = set(r[0] for r in rows)
            known_posters = {r[0]: (r[1] or "") for r in rows}

            scraped_items = []
            target_pages = 1 if is_all else int(pages)
            p = 1

            while p <= target_pages:
                offset = (p - 1) * 90
                url = "https://toloka.to/f127?sort=8" if p == 1 else f"https://toloka.to/f127-{offset}?sort=8"
                add_log(f"Завантаження сторінки {p}/{target_pages if not is_all else 'всі'}: {url}", "info")

                resp = fetch_url(session, url)
                if resp.status_code != 200:
                    add_log(f"HTTP {resp.status_code} при завантаженні сторінки {p}", "error")
                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # Discover total pages on first page if 'all' requested
                if is_all and p == 1:
                    max_offset = 0
                    for a in soup.select("a[href*='f127-']"):
                        m_off = re.search(r"f127-(\d+)", a.get("href", ""))
                        if m_off:
                            max_offset = max(max_offset, int(m_off.group(1)))
                    if max_offset > 0:
                        target_pages = (max_offset // 90) + 1
                        add_log(f"Виявлено всього сторінок форуму: {target_pages} (~{target_pages * 90} роздач)", "info")

                table_rows = soup.select("table.forumline tr")

                for tr in table_rows:
                    title_el = tr.select_one("a.topictitle")
                    if not title_el:
                        continue

                    raw_title = title_el.text.strip()
                    href = title_el.get("href", "").strip()
                    clean_href = re.sub(r"\?.*$", "", href)
                    item_url = clean_href if clean_href.startswith("http") else f"https://toloka.to/{clean_href}"

                    m = re.search(r"/t(\d+)", item_url)
                    if not m:
                        continue
                    tid = int(m.group(1))

                    # 1. Seeders
                    seeders_val = 0
                    seed_el = tr.select_one("span[title='Роздають'] b, span.seedmed b, span[title='Роздають']")
                    if seed_el:
                        m_s = re.search(r'\d+', seed_el.get_text())
                        if m_s:
                            seeders_val = int(m_s.group(0))

                    # 2. Torrent size & Download url
                    size_val = ""
                    dl_url_val = ""
                    dl_link = tr.select_one("a[href*='download.php?id=']")
                    if dl_link:
                        dh = dl_link.get("href", "").strip()
                        dl_url_val = f"https://toloka.to/{dh}" if not dh.startswith("http") else dh
                        size_txt = dl_link.get_text().strip().replace('\xa0', ' ')
                        m_sz = re.search(r'\d+(?:\.\d+)?\s*(?:MB|GB|KB|МБ|ГБ|КБ|B|Б)', size_txt, re.IGNORECASE)
                        if m_sz:
                            size_val = m_sz.group(0)

                    # 3. Registration date and uploader
                    reg_date_val = ""
                    uploader_val = ""
                    uploader_id_val = None
                    tds = tr.find_all("td")
                    if len(tds) >= 5:
                        author_td = tds[4]
                        m_d = re.search(r'\d{4}-\d{2}-\d{2}', author_td.get_text())
                        if m_d:
                            reg_date_val = m_d.group(0)
                        u_link = author_td.select_one("a[href*='u']")
                        if u_link:
                            uploader_val = u_link.get_text().strip()
                            m_u = re.search(r'u(\d+)', u_link.get("href", ""))
                            if m_u:
                                uploader_id_val = int(m_u.group(1))

                    is_new = tid not in known_ids

                    item_info = {
                        "topic_id": tid,
                        "title": raw_title,
                        "url": item_url,
                        "is_new": is_new,
                        "poster_url": known_posters.get(tid, "")
                    }
                    scraped_items.append(item_info)

                    with scraper_state.lock:
                        scraper_state["total_scraped"] += 1
                        if is_new:
                            scraper_state["new_items"] += 1
                        scraper_state["recent_items"] = list(scraped_items)

                    if not is_new:
                        cur.execute("""
                            UPDATE topics SET
                                seeders = ?,
                                torrent_size = COALESCE(NULLIF(?, ''), torrent_size),
                                registered_at = COALESCE(NULLIF(?, ''), registered_at),
                                download_url = COALESCE(NULLIF(?, ''), download_url),
                                uploader = COALESCE(NULLIF(?, ''), uploader),
                                uploader_id = COALESCE(?, uploader_id)
                            WHERE topic_id = ?
                        """, (seeders_val, size_val, reg_date_val, dl_url_val, uploader_val, uploader_id_val, tid))
                    else:
                        add_log(f"Нова роздача знайдена: #{tid} {raw_title[:60]}", "success")
                        try:
                            t_resp = fetch_url(session, item_url)
                            if t_resp.status_code == 200:
                                data = parse_topic_full_data(tid, item_url, t_resp.text, fallback_title=raw_title)
                                item_info["poster_url"] = data["poster_url"]
                                with scraper_state.lock:
                                    scraper_state["recent_items"] = list(scraped_items)

                                raw_t = data["title"] or raw_title
                                part_val = data.get("part")
                                has_sub_val = data.get("has_sub", 0)

                                final_sz = data.get("torrent_size") or size_val
                                final_reg = data.get("registered_at") or reg_date_val

                                cur.execute("""
                                    INSERT OR REPLACE INTO topics (
                                        topic_id, url, title, content_type, uploader, uploader_id,
                                        genres, country, studio, director, synopsis, duration_raw,
                                        episode_list, episode_count, episode_count_is_guess, quality,
                                        poster_url, download_url, seeders, torrent_size, registered_at,
                                        torrent_edited_at, files, raw_fields, original_credits,
                                        adaptation_team, content_hash, source_file, part, has_sub, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                                """, (
                                    tid, item_url, data["title"], data["content_type"], data["uploader"] or uploader_val, data["uploader_id"] or uploader_id_val,
                                    data["genres"], data["country"], data["studio"], data["director"],
                                    data["synopsis"], data["duration_raw"], data["episode_list"],
                                    data["episode_count"], data["episode_count_is_guess"], data["quality"],
                                    data["poster_url"], data["download_url"] or dl_url_val, seeders_val, final_sz, final_reg,
                                    data.get("torrent_edited_at", ""), data["files"],
                                    data["raw_fields"], data["original_credits"], data["adaptation_team"],
                                    data["content_hash"], data["source_file"], part_val, has_sub_val
                                ))
                                known_ids.add(tid)
                                add_log(f"✓ Повні дані збережено для #{tid} ({data['uploader']}, {data['episode_count']} сер.)", "success")
                        except Exception as err:
                            add_log(f"Помилка отримання деталей #{tid}: {err}", "warn")

                    time.sleep(0.05)

                con.commit()
                p += 1
                time.sleep(0.8)

        # Automatically rebuild catalog data
        add_log("Перебудова data/catalog.js...", "info")
        subprocess.run([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR), check=False)
        add_log("Каталог успішно оновлено новими даними!", "success")

        scraper_state.update(
            is_running=False,
            status="completed",
            message=f"Завершено! Опрацьовано {len(scraped_items)} роздач, нових: {scraper_state['new_items']}."
        )

    except Exception as e:
        add_log(f"Критична помилка парсингу: {e}", "error")
        scraper_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )


def run_background_enrich(count=20, username="", password="", incomplete_only=True, single_id=None):
    scraper_state.reset_logs()
    scraper_state.update(
        is_running=True,
        status="running",
        message=f"Збагачення #{single_id}..." if single_id else f"Збагачення {count} роздач...",
        total_scraped=0,
        new_items=0,
        recent_items=[]
    )

    add_log(f"Запуск збагачення роздач (ліміт: {count})...", "info")

    try:
        from toloka_parser_engine import parse_topic_full_data
        import download_posters

        session = create_toloka_session(username, password, on_log=add_log)

        with get_db() as con:
            cur = con.cursor()
            if single_id:
                cur.execute("SELECT topic_id, url, title FROM topics WHERE topic_id = ?", (single_id,))
                target_topics = cur.fetchall()
            elif incomplete_only:
                cur.execute("""
                    SELECT topic_id, url, title FROM topics 
                    WHERE uploader IS NULL OR uploader = '' OR genres IS NULL OR genres = '[]' OR files IS NULL OR files = '[]' OR synopsis IS NULL OR synopsis = '' OR content_type = 'movie?'
                    ORDER BY topic_id DESC LIMIT ?
                """, (count,))
                target_topics = cur.fetchall()
                if not target_topics:
                    cur.execute("SELECT topic_id, url, title FROM topics ORDER BY topic_id DESC LIMIT ?", (count,))
                    target_topics = cur.fetchall()
            else:
                cur.execute("SELECT topic_id, url, title FROM topics ORDER BY topic_id DESC LIMIT ?", (count,))
                target_topics = cur.fetchall()

            total_to_enrich = len(target_topics)
            add_log(f"Обрано {total_to_enrich} роздач для збагачення даними.", "info")

            enriched_count = 0
            scraped_items = []

            for idx, (tid, item_url, raw_title) in enumerate(target_topics):
                add_log(f"[{idx+1}/{total_to_enrich}] Завантаження #{tid}: {raw_title[:45]}...", "info")
                try:
                    resp = fetch_url(session, item_url)
                    if resp.status_code == 200:
                        data = parse_topic_full_data(tid, item_url, resp.text, fallback_title=raw_title)
                        raw_t = data["title"] or raw_title
                        part_val = data.get("part")
                        has_sub_val = data.get("has_sub", 0)

                        cur.execute("""
                            UPDATE topics SET 
                                title = COALESCE(NULLIF(?, ''), title),
                                content_type = COALESCE(NULLIF(?, ''), content_type),
                                uploader = ?,
                                uploader_id = ?,
                                genres = ?,
                                country = ?,
                                studio = ?,
                                director = ?,
                                synopsis = ?,
                                duration_raw = ?,
                                episode_list = ?,
                                episode_count = COALESCE(?, episode_count),
                                episode_count_is_guess = ?,
                                quality = COALESCE(NULLIF(?, ''), quality),
                                poster_url = COALESCE(NULLIF(?, ''), poster_url),
                                download_url = COALESCE(NULLIF(?, ''), download_url),
                                torrent_size = COALESCE(NULLIF(?, ''), torrent_size),
                                registered_at = COALESCE(NULLIF(?, ''), registered_at),
                                torrent_edited_at = COALESCE(NULLIF(?, ''), torrent_edited_at),
                                files = ?,
                                raw_fields = ?,
                                original_credits = ?,
                                adaptation_team = ?,
                                content_hash = ?,
                                source_file = ?,
                                part = ?,
                                has_sub = ?,
                                updated_at = datetime('now')
                            WHERE topic_id = ?
                        """, (
                            data["title"], data["content_type"], data["uploader"], data["uploader_id"],
                            data["genres"], data["country"], data["studio"], data["director"],
                            data["synopsis"], data["duration_raw"], data["episode_list"],
                            data["episode_count"], data["episode_count_is_guess"], data["quality"],
                            data["poster_url"], data["download_url"],
                            data.get("torrent_size", ""), data.get("registered_at", ""), data.get("torrent_edited_at", ""),
                            data["files"], data["raw_fields"], data["original_credits"], data["adaptation_team"],
                            data["content_hash"], data["source_file"], part_val, has_sub_val, tid
                        ))
                        con.commit()
                        enriched_count += 1

                        if data.get("poster_url"):
                            try:
                                dl_ok, _, _ = download_posters.download_single_poster((tid, data["poster_url"], data["title"]))
                                if dl_ok:
                                    add_log(f"  └ Постер збережено локально для #{tid}", "info")
                            except Exception:
                                pass

                        ep_info = f"{data['episode_count']} сер." if data['episode_count'] else "тривалість"
                        up_info = f"автор: {data['uploader']}" if data['uploader'] else "без автора"
                        add_log(f"✓ #{tid} успішно збагачено ({up_info}, {ep_info})", "success")

                        item_info = {
                            "topic_id": tid,
                            "title": data["title"],
                            "url": item_url,
                            "is_new": False,
                            "poster_url": data["poster_url"]
                        }
                        scraped_items.append(item_info)
                        with scraper_state.lock:
                            scraper_state["total_scraped"] = enriched_count
                            scraper_state["recent_items"] = list(scraped_items)
                    else:
                        add_log(f"Помилка завантаження #{tid}: HTTP {resp.status_code}", "warn")
                except Exception as ex:
                    add_log(f"Помилка збагачення #{tid}: {ex}", "warn")

                time.sleep(1.2)

        # Rebuild catalog
        add_log("Перебудова data/catalog.js...", "info")
        subprocess.run([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR), check=False)
        add_log("Каталог успішно оновлено новими даними!", "success")

        scraper_state.update(
            is_running=False,
            status="completed",
            message=f"Завершено! Збагачено {enriched_count} із {total_to_enrich} роздач."
        )

    except Exception as e:
        add_log(f"Критична помилка збагачення: {e}", "error")
        scraper_state.update(
            is_running=False,
            status="error",
            message=f"Помилка: {e}"
        )


def enrich_single_topic_sync(tid, username="", password=""):
    try:
        from toloka_parser_engine import parse_topic_full_data
        from build_catalog_data import format_catalog_item
        import download_posters

        session = create_toloka_session(username, password)
        item_url = f"https://toloka.to/t{tid}"

        with get_db() as con:
            cur = con.cursor()
            cur.execute("SELECT title, url FROM topics WHERE topic_id = ?", (tid,))
            row = cur.fetchone()
            raw_title = row[0] if row else ""
            if row and row[1]:
                item_url = row[1]

            try:
                resp = fetch_url(session, item_url)
            except Exception as ex:
                return {"success": False, "error": str(ex)}

            if resp.status_code != 200:
                return {"success": False, "error": f"HTTP {resp.status_code}"}

            data = parse_topic_full_data(tid, item_url, resp.text, fallback_title=raw_title)
            raw_t = data["title"] or raw_title
            part_val = data.get("part")
            has_sub_val = data.get("has_sub", 0)

            cur.execute("""
                UPDATE topics SET 
                    title = COALESCE(NULLIF(?, ''), title),
                    content_type = COALESCE(NULLIF(?, ''), content_type),
                    uploader = ?,
                    uploader_id = ?,
                    genres = ?,
                    country = ?,
                    studio = ?,
                    director = ?,
                    synopsis = ?,
                    duration_raw = ?,
                    episode_list = ?,
                    episode_count = COALESCE(?, episode_count),
                    episode_count_is_guess = ?,
                    quality = COALESCE(NULLIF(?, ''), quality),
                    poster_url = COALESCE(NULLIF(?, ''), poster_url),
                    download_url = COALESCE(NULLIF(?, ''), download_url),
                    torrent_size = COALESCE(NULLIF(?, ''), torrent_size),
                    registered_at = COALESCE(NULLIF(?, ''), registered_at),
                    torrent_edited_at = COALESCE(NULLIF(?, ''), torrent_edited_at),
                    files = ?,
                    raw_fields = ?,
                    original_credits = ?,
                    adaptation_team = ?,
                    content_hash = ?,
                    source_file = ?,
                    part = ?,
                    has_sub = ?,
                    updated_at = datetime('now')
                WHERE topic_id = ?
            """, (
                data["title"], data["content_type"], data["uploader"], data["uploader_id"],
                data["genres"], data["country"], data["studio"], data["director"],
                data["synopsis"], data["duration_raw"], data["episode_list"],
                data["episode_count"], data["episode_count_is_guess"], data["quality"],
                data["poster_url"], data["download_url"],
                data.get("torrent_size", ""), data.get("registered_at", ""), data.get("torrent_edited_at", ""),
                data["files"], data["raw_fields"], data["original_credits"], data["adaptation_team"],
                data["content_hash"], data["source_file"], part_val, has_sub_val, tid
            ))
            con.commit()

            if data.get("poster_url"):
                try:
                    download_posters.download_single_poster((tid, data["poster_url"], data["title"]))
                except Exception:
                    pass

            cur.execute(f"SELECT {CATALOG_COLS} FROM topics WHERE topic_id = ?", (tid,))
            row_updated = cur.fetchone()

        threading.Thread(target=lambda: subprocess.run([sys.executable, str(FOR_AGENTS_DIR / "build_catalog_data.py")], cwd=str(BASE_DIR), check=False), daemon=True).start()

        if row_updated:
            item_formatted = format_catalog_item(row_updated, base_dir=str(BASE_DIR))
            return {"success": True, "title": item_formatted}
        return {"success": True}

    except Exception as e:
        return {"success": False, "error": str(e)}
