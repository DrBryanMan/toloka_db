#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Local Backend Server for Toloka Anime Catalog.
Main entry point and server startup.
"""

import sys
import socketserver

# Backwards compatibility re-exports
from backend.config import (
    PORT,
    BASE_DIR,
    DB_PATH,
    get_toloka_credentials
)
from backend.tasks.scraper import (
    scraper_state,
    run_background_parse,
    run_background_enrich,
    enrich_single_topic_sync,
    run_background_compilations_enrich
)
from backend.tasks.voc import (
    voc_sync_state,
    run_background_voc_sync
)
from backend.tasks.posters import (
    poster_downloader_state,
    run_background_poster_download
)
from backend.tasks.external_ids import (
    ext_sync_state,
    run_background_ext_sync,
    run_background_mikai_refresh
)
from backend.tasks.hikka import (
    hikka_state,
    run_background_hikka_enrich,
    enrich_single_hikka_sync
)
from backend.tasks.scheduler import start_daily_scheduler, stop_daily_scheduler
from backend.handler import AppRequestHandler



class ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_server(port=PORT):
    server_address = ("", port)
    with ThreadingServer(server_address, AppRequestHandler) as httpd:
        print("==================================================")
        print(f"Toloka Anime Catalog Server running at:")
        print(f"  http://localhost:{port}")
        print("==================================================")
        start_daily_scheduler()
        while True:
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nStopping server...")
                stop_daily_scheduler()
                httpd.server_close()
                break
            except Exception as e:
                print(f"Server loop recovered from error: {e}")


if __name__ == "__main__":
    start_server()
