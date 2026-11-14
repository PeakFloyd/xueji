#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试共享夹具 (_common.py)
=========================
所有桥接测试使用数据库副本，绝不修改真实数据库。
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
_PRIOR_DB = os.environ.get("XUEJI_DB")


def use_temp_db():
    """复制真库到临时文件，并让当前及子进程读取该副本。"""
    global _TMP
    if _TMP is None:
        fd, path = tempfile.mkstemp(prefix="xueji_test_", suffix=".db")
        os.close(fd)
        try:
            shutil.copy2(DB_SRC, path)
        except Exception:
            os.remove(path)
            raise
        os.environ["XUEJI_DB"] = path
        import dbcore
        import data_layer as dl
        dbcore.DB_PATH = path
        dl.DB_PATH = path
        _TMP = path
        atexit.register(cleanup)
    return _TMP


def cleanup():
    """删除临时库，并还原测试进程的数据库配置。"""
    global _TMP
    if _TMP and os.path.exists(_TMP):
        try:
            os.remove(_TMP)
        except OSError:
            pass
    _TMP = None
    if _PRIOR_DB is None:
        os.environ.pop("XUEJI_DB", None)
    else:
        os.environ["XUEJI_DB"] = _PRIOR_DB
