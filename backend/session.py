#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
try:
    from curl_cffi import requests as cffi_requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests as cffi_requests
    HAS_CURL_CFFI = False

from backend.config import get_toloka_credentials

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Referer": "https://toloka.to/",
}

def create_toloka_session(username="", password="", on_log=None):
    """
    Creates HTTP session with curl_cffi (or requests fallback) and performs Toloka login if credentials exist.
    """
    session = cffi_requests.Session(impersonate="chrome120") if HAS_CURL_CFFI else cffi_requests.Session()
    u, p = get_toloka_credentials(username, password)
    if u and p:
        if on_log:
            on_log(f"Авторизація на Toloka.to як {u}...", "info")
        login_url = "https://toloka.to/login.php"
        payload = {
            "username": u,
            "password": p,
            "autologin": "on",
            "login": "Вхід",
        }
        try:
            session.post(login_url, data=payload, headers=DEFAULT_HEADERS, timeout=15)
            if on_log:
                on_log("Авторизаційний запит виконано.", "success")
        except Exception as e:
            if on_log:
                on_log(f"Помилка авторизації: {e}", "warn")
    return session

def fetch_url(session, url, headers=None, timeout=15):
    """
    Fetches URL using session headers and timeout.
    """
    hdrs = headers or DEFAULT_HEADERS
    return session.get(url, headers=hdrs, timeout=timeout)
