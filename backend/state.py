#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import threading
from datetime import datetime
from collections.abc import MutableMapping

class TaskState(MutableMapping):
    """
    Thread-safe state manager for background workers.
    Implements MutableMapping so it can be accessed like a dict or copied with dict(state).
    """
    def __init__(self, initial_data=None):
        self.lock = threading.Lock()
        self.log_counter = 0
        self._data = {
            "is_running": False,
            "status": "idle",
            "message": "Готовий до роботи",
            "latest_logs": []
        }
        if initial_data:
            self._data.update(initial_data)

    def add_log(self, text, log_type="info", max_logs=200):
        with self.lock:
            self.log_counter += 1
            now_str = datetime.now().strftime("%H:%M:%S")
            self._data["latest_logs"].append({
                "id": self.log_counter,
                "text": text,
                "type": log_type,
                "time": now_str
            })
            if len(self._data["latest_logs"]) > max_logs:
                self._data["latest_logs"].pop(0)

    def reset_logs(self):
        with self.lock:
            self.log_counter = 0
            self._data["latest_logs"] = []

    def to_dict(self):
        with self.lock:
            d = dict(self._data)
            d["latest_logs"] = list(self._data.get("latest_logs", []))
            return d

    # MutableMapping interface
    def __getitem__(self, key):
        with self.lock:
            return self._data[key]

    def __setitem__(self, key, value):
        with self.lock:
            self._data[key] = value

    def __delitem__(self, key):
        with self.lock:
            del self._data[key]

    def __iter__(self):
        with self.lock:
            return iter(list(self._data.keys()))

    def __len__(self):
        with self.lock:
            return len(self._data)

    def get(self, key, default=None):
        with self.lock:
            return self._data.get(key, default)

    def update(self, *args, **kwargs):
        with self.lock:
            self._data.update(*args, **kwargs)
