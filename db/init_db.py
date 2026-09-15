#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 数据库初始化/重建脚本 (init_db.py)
==========================================
把 db 目录下的 SQL 脚本按顺序应用到 SQLite 库 xueji.db：
  1) schema.sql        —— 原 5 表结构 + 3NF 注释（含少量基础演示数据）
  2) schema_ext.sql    —— 扩展 3 表（teacher / teaching / graduation_requirement）
  3) seed_data.sql     —— 全量演示数据（由 gen_seed.py 生成，会清空后重写业务数据）

特性：
  * 幂等：可反复执行，结果一致。
  * 安全：执行前自动备份现有 xueji.db 到 db/backup/。
  * 可选 --keep-backup-days N：清理超过 N 天的旧备份（默认不清理）。

用法：
  python init_db.py                 # 应用并重建数据
  python init_db.py --no-backup     # 跳过备份（谨慎）
  python init_db.py --fresh         # 删除库文件后从零建库（结构+数据全重建）
"""
import argparse
import os
import shutil
import sqlite3
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "xueji.db")
BACKUP_DIR = os.path.join(HERE, "backup")
SCRIPTS = ("schema.sql", "schema_ext.sql", "schema_views.sql", "seed_data.sql")


def backup_db():
    """把现有库备份到 db/backup/，返回备份路径；库不存在则返回 None。"""
    if not os.path.exists(DB_PATH):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = os.path.join(BACKUP_DIR, "xueji-%s.db" % stamp)
    shutil.copy2(DB_PATH, dest)
    return dest


def clean_old_backups(days):
    """清理超过 days 天的旧备份。"""
    if not os.path.isdir(BACKUP_DIR):
        return 0
    now = datetime.now()
    removed = 0
    for name in os.listdir(BACKUP_DIR):
        p = os.path.join(BACKUP_DIR, name)
        try:
            age = (now - datetime.fromtimestamp(os.path.getmtime(p))).days
            if age > days:
                os.remove(p)
                removed += 1
        except OSError:
            pass
    return removed


def apply_scripts(conn):
    """按顺序执行各 SQL 脚本。"""
    for name in SCRIPTS:
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            print("  [跳过] 未找到 %s" % name)
            continue
        with open(path, "r", encoding="utf-8") as f:
            sql = f.read()
        conn.executescript(sql)
        conn.commit()
        print("  [应用] %s" % name)


def summary(conn):
    """打印各表记录数。"""
    cur = conn.cursor()
    tables = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    print("  表数量: %d" % len(tables))
    for t in tables:
        n = cur.execute("SELECT COUNT(*) FROM %s" % t).fetchone()[0]
        print("    %-24s %d" % (t, n))
    # 数据合理性抽样
    row = cur.execute(
        "SELECT COUNT(*) FROM enroll WHERE score IS NOT NULL AND score < 60").fetchone()[0]
    print("  不及格选课记录: %d" % row)


def main():
    ap = argparse.ArgumentParser(description="学籍系统数据库初始化/重建")
    ap.add_argument("--no-backup", action="store_true", help="跳过备份")
    ap.add_argument("--fresh", action="store_true", help="先删除库文件，从零建库")
    ap.add_argument("--keep-backup-days", type=int, default=None,
                    help="清理超过 N 天的旧备份")
    a = ap.parse_args()

    if a.fresh and os.path.exists(DB_PATH):
        if not a.no_backup:
            b = backup_db()
            print("已备份: %s" % b)
        os.remove(DB_PATH)
        print("已删除旧库，准备从零建库。")
    elif not a.no_backup:
        b = backup_db()
        print("已备份: %s" % (b if b else "(库不存在，跳过)"))

    if a.keep_backup_days is not None:
        n = clean_old_backups(a.keep_backup_days)
        print("已清理 %d 个过期备份。" % n)

    conn = sqlite3.connect(DB_PATH)
    try:
        apply_scripts(conn)
        print("完成。当前数据概览:")
        summary(conn)
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
