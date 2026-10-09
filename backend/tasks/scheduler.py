#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import subprocess
import threading
from datetime import datetime, timedelta

from backend.config import (
    BASE_DIR,
    DAILY_SYNC_HOUR,
    DAILY_SYNC_MINUTE,
    DAILY_SYNC_PAGES,
    DAILY_SYNC_FILES,
)
from backend.tasks.scraper import scraper_state, run_background_parse

GIT_TIMEOUT = 300

_stop_event = threading.Event()


def _log(text, log_type="info"):
    print(f"[daily-sync] {text}")
    scraper_state.add_log(text, log_type)


def next_run_time(now=None):
    """Найближчий момент запуску (сьогодні або завтра о заданій годині)."""
    now = now or datetime.now()
    target = now.replace(hour=DAILY_SYNC_HOUR, minute=DAILY_SYNC_MINUTE, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target


def _git(*args):
    return subprocess.run(
        ["git", *args],
        cwd=str(BASE_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=GIT_TIMEOUT,
    )


def commit_and_push_catalog():
    """Комітить лише файли каталогу (решта змін у робочій теці не чіпається) і пушить."""
    files = list(DAILY_SYNC_FILES)

    status = _git("status", "--porcelain", "--", *files)
    if status.returncode != 0:
        _log(f"git status помилка: {status.stderr.strip()}", "error")
        return False
    if not status.stdout.strip():
        _log("Файли каталогу не змінились — коміт пропущено.", "info")
        return True

    add = _git("add", "--", *files)
    if add.returncode != 0:
        _log(f"git add помилка: {add.stderr.strip()}", "error")
        return False

    message = f"chore: daily catalog update {datetime.now():%Y-%m-%d}"
    commit = _git("commit", "-m", message, "--only", "--", *files)
    if commit.returncode != 0:
        _log(f"git commit помилка: {(commit.stderr or commit.stdout).strip()}", "error")
        return False

    push = _git("push")
    if push.returncode != 0:
        _log(f"git push помилка: {push.stderr.strip()}", "error")
        return False

    _log("Каталог закомічено та запушено в репозиторій.", "success")
    return True


def run_daily_sync():
    if scraper_state["is_running"]:
        _log("Парсер уже працює — щоденне оновлення пропущено.", "warn")
        return

    _log(f"Старт щоденного оновлення ({DAILY_SYNC_PAGES} стор.)...", "info")
    # Парсинг + автоматична збірка catalog.js та fallback JSON (всередині run_background_parse)
    run_background_parse(DAILY_SYNC_PAGES)

    if scraper_state["status"] != "completed":
        _log(f"Парсинг не завершився успішно ({scraper_state['status']}) — push скасовано.", "error")
        return

    try:
        commit_and_push_catalog()
    except Exception as e:
        _log(f"Помилка commit/push: {e}", "error")


def _scheduler_loop():
    while not _stop_event.is_set():
        target = next_run_time()
        print(f"[daily-sync] Наступний запуск: {target:%Y-%m-%d %H:%M}")
        wait_seconds = (target - datetime.now()).total_seconds()
        if _stop_event.wait(timeout=max(wait_seconds, 0)):
            break
        try:
            run_daily_sync()
        except Exception as e:
            print(f"[daily-sync] Критична помилка: {e}")


def start_daily_scheduler():
    thread = threading.Thread(target=_scheduler_loop, name="daily-sync", daemon=True)
    thread.start()
    return thread


def stop_daily_scheduler():
    _stop_event.set()
