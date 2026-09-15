#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试共享夹具 (_common.py)
=========================
把 AI 层指向数据库**副本**，确保测试不会污染真库 `db/xueji.db`。
所有测试文件都应先调用 `use_temp_db()`。
"""
import atexit
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
AI_DIR = os.path.join(PROJ, "ai")
DB_SRC = os.path.join(PROJ, "db", "xueji.db")

if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

_TMP = None


def use_temp_db():
    """复制真库到临时文件，并让数据层指向它。返回副本路径。"""
    global _TMP
    if _TMP is None:
        fd, path = tempfile.mkstemp(prefix="xueji_test_", suffix=".db")
        os.close(fd)
        shutil.copy2(DB_SRC, path)
        import data_layer as dl
        dl.DB_PATH = path
        _TMP = path
        atexit.register(cleanup)
    return _TMP


def cleanup():
    """删除临时库。"""
    global _TMP
    if _TMP and os.path.exists(_TMP):
        try:
            os.remove(_TMP)
        except OSError:
            pass
        _TMP = None


def ollama_alive():
    """探测本地 Ollama 是否可用（端到端测试用）。"""
    import json
    import urllib.request
    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/tags",
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as r:
            json.loads(r.read().decode("utf-8"))
        return True
    except Exception:
        return False
