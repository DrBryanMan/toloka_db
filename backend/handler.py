#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import http.server
import json
import threading

from backend.tasks.scraper import (
    scraper_state,
    run_background_parse,
    run_background_enrich,
    enrich_single_topic_sync,
    run_background_compilations_enrich
)
from backend.tasks.voc import (
    voc_sync_state,
    refresh_voc_stats,
    run_background_voc_sync
)
from backend.tasks.posters import (
    poster_downloader_state,
    refresh_poster_stats,
    run_background_poster_download,
    stop_poster_download
)
from backend.tasks.external_ids import (
    ext_sync_state,
    refresh_ext_stats,
    run_background_ext_sync,
    run_background_mikai_refresh
)
from backend.tasks.hikka import (
    hikka_state,
    refresh_hikka_stats,
    run_background_hikka_enrich,
    enrich_single_hikka_sync
)

from backend.services.titles import (
    get_incomplete_stats,
    get_incomplete_list,
    get_compilation_stats,
    get_compilation_list,
    get_title_by_id,
    update_title,
    batch_update_titles,
    delete_title,
    rebuild_catalog_sync
)
from backend.services.fallback import (
    get_fallback_status,
    generate_fallback
)


class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler dispatching static files and JSON APIs."""

    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, BrokenPipeError, ConnectionAbortedError, TimeoutError):
            pass

    def end_headers(self):
        if self.path.startswith("/api"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Content-Type", "application/json; charset=utf-8")
        super().end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def send_error_json(self, message, status=400):
        self.send_response(status)
        self.end_headers()
        self.wfile.write(json.dumps({"error": message, "success": False}, ensure_ascii=False).encode("utf-8"))

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length <= 0:
            return {}
        try:
            body = self.rfile.read(content_length).decode("utf-8")
            return json.loads(body)
        except Exception:
            return {}

    def do_GET(self):
        if self.path == "/api/parser/status":
            self.send_json(scraper_state.to_dict())
            return

        elif self.path == "/api/voc/status":
            if voc_sync_state["matched_count"] == 0 and not voc_sync_state["is_running"]:
                refresh_voc_stats()
            self.send_json(voc_sync_state.to_dict())
            return

        elif self.path == "/api/ext-ids/status":
            if ext_sync_state["total_topics"] == 0 and not ext_sync_state["is_running"]:
                refresh_ext_stats()
            self.send_json(ext_sync_state.to_dict())
            return

        elif self.path == "/api/posters/status":
            if not poster_downloader_state["is_running"]:
                refresh_poster_stats()
            self.send_json(poster_downloader_state.to_dict())
            return

        elif self.path == "/api/hikka/status":
            if not hikka_state["is_running"]:
                refresh_hikka_stats()
            self.send_json(hikka_state.to_dict())
            return


        elif self.path == "/api/parser/incomplete-stats":
            try:
                stats = get_incomplete_stats()
                self.send_json(stats)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/parser/incomplete-list":
            try:
                data = get_incomplete_list()
                self.send_json(data)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/parser/compilations-stats":
            try:
                stats = get_compilation_stats()
                self.send_json(stats)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/parser/compilations-list":
            try:
                data = get_compilation_list()
                self.send_json(data)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/fallback/status":
            try:
                status_info = get_fallback_status()
                self.send_json(status_info)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path.startswith("/api/titles/"):
            try:
                tid_part = self.path.split("/api/titles/")[1].split("?")[0]
                tid = int(tid_part)
                item = get_title_by_id(tid)
                if item:
                    self.send_json(item)
                else:
                    self.send_error_json("Title not found", status=404)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        super().do_GET()

    def do_POST(self):
        req_data = self._read_json_body()

        if self.path == "/api/parser/start":
            pages = req_data.get("pages", 1)
            username = req_data.get("username", "")
            password = req_data.get("password", "")

            if scraper_state["is_running"]:
                self.send_error_json("Parser already running", status=400)
                return

            threading.Thread(target=run_background_parse, args=(pages, username, password), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/parser/enrich":
            count = int(req_data.get("count", 20))
            username = req_data.get("username", "")
            password = req_data.get("password", "")
            incomplete_only = bool(req_data.get("incomplete_only", True))
            single_id = req_data.get("id") or req_data.get("single_id")

            if single_id:
                res = enrich_single_topic_sync(int(single_id), username, password)
                self.send_json(res, status=200 if res.get("success") else 500)
                return

            if scraper_state["is_running"]:
                self.send_error_json("Parser or enricher already running", status=400)
                return

            threading.Thread(target=run_background_enrich, args=(count, username, password, incomplete_only, None), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/parser/enrich-compilations":
            username = req_data.get("username", "")
            password = req_data.get("password", "")

            if scraper_state["is_running"]:
                self.send_error_json("Parser or enricher already running", status=400)
                return

            threading.Thread(target=run_background_compilations_enrich, args=(username, password), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/titles/update":
            try:
                tid = update_title(req_data)
                self.send_json({"success": True, "id": tid})
            except ValueError as ve:
                self.send_error_json(str(ve), status=400)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/titles/delete":
            try:
                res = delete_title(req_data)
                self.send_json(res)
            except ValueError as ve:
                self.send_error_json(str(ve), status=400)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/titles/batch-update":
            try:
                titles_list = req_data.get("titles", [])
                updated_count = batch_update_titles(titles_list)
                self.send_json({"success": True, "updated": updated_count})
            except ValueError as ve:
                self.send_error_json(str(ve), status=400)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        elif self.path == "/api/voc/sync":
            if voc_sync_state["is_running"]:
                self.send_error_json("VOC Sync already running", status=400)
                return

            threading.Thread(target=run_background_voc_sync, daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/ext-ids/sync":
            limit = int(req_data.get("limit", 50))
            if ext_sync_state["is_running"]:
                self.send_error_json("External DB sync already running", status=400)
                return

            threading.Thread(target=run_background_ext_sync, args=(limit,), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/ext-ids/mikai-refresh":
            mode = req_data.get("mode", "ongoing")
            if ext_sync_state["is_running"]:
                self.send_error_json("Task already running", status=400)
                return

            threading.Thread(target=run_background_mikai_refresh, args=(mode,), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/hikka/enrich":
            single_id = req_data.get("id") or req_data.get("single_id")
            if single_id:
                res = enrich_single_hikka_sync(int(single_id))
                self.send_json(res, status=200 if res.get("success") else 400)
                return

            if hikka_state["is_running"]:
                self.send_error_json("Hikka enrichment already running", status=400)
                return

            limit = int(req_data.get("limit", 50))
            filter_type = req_data.get("filter", "all")
            threading.Thread(target=run_background_hikka_enrich, args=(limit, filter_type), daemon=True).start()
            self.send_json({"success": True})
            return


        elif self.path == "/api/catalog/rebuild":
            rebuild_catalog_sync()
            self.send_json({"success": True})
            return

        elif self.path == "/api/posters/start":
            limit = int(req_data.get("limit", 0))
            overwrite = bool(req_data.get("overwrite", False))
            if poster_downloader_state["is_running"]:
                self.send_error_json("Downloader already running", status=400)
                return

            threading.Thread(target=run_background_poster_download, args=(limit, overwrite), daemon=True).start()
            self.send_json({"success": True})
            return

        elif self.path == "/api/posters/stop":
            stop_poster_download()
            self.send_json({"success": True})
            return

        elif self.path == "/api/fallback/generate":
            try:
                gen_type = req_data.get("type", "both")
                res = generate_fallback(gen_type)
                self.send_json(res)
            except Exception as e:
                self.send_error_json(str(e), status=500)
            return

        self.send_error_json("Endpoint not found", status=404)
