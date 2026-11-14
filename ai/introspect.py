#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 数据库结构快照 (introspect.py)
=========================================
后台页面（仅管理员）读取的“建成的库”：每张表/视图的结构、约束、索引、
全部数据行，以及数据库文件本身逐页的 B-tree 归属。

  * 只读：经 `dbcore.db_readonly()` 以 `mode=ro` 打开，结构查看不可能改动数据
  * 不接受任何 SQL：对象名只来自 sqlite_master，查询语句全部固定
  * 文件页图：直接按 SQLite 文件格式解析 B-tree（Python 自带的 SQLite 未编译 dbstat）
  * 设计注释：取自 db/schema*.sql 中每个 CREATE 语句前的注释块（作者自己的 3NF 论证）

调用方：`tool_bridge.py` 的 `schema` 动作；角色检查在桥接层完成。
"""

import datetime
import os
import re

import dbcore

MAX_ROWS = 1000                     # 每个对象最多返回的行数（演示库远小于此）
SCHEMA_FILES = ("schema.sql", "schema_ext.sql", "schema_views.sql")
SCHEMA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db")


# ----------------------------------------------------------------------
# SQL 文本解析（只用于展示：注释、CHECK、视图依赖）
# ----------------------------------------------------------------------
def _strip_comments(sql):
    """去掉 `--` 行注释与 `/* */` 块注释，保留字符串字面量原样。"""
    out, i, n = [], 0, len(sql)
    while i < n:
        ch = sql[i]
        if ch in "'\"":
            j = i + 1
            while j < n and sql[j] != ch:
                j += 1
            out.append(sql[i:j + 1])
            i = j + 1
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            i = n if j < 0 else j + 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _body_segments(sql):
    """CREATE TABLE 括号内按顶层逗号切分的定义段（已去注释）。"""
    clean = _strip_comments(sql)
    start = clean.find("(")
    if start < 0:
        return []
    segs, depth, cur = [], 0, []
    for ch in clean[start + 1:]:
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                break
            depth -= 1
        if ch == "," and depth == 0:
            segs.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        segs.append("".join(cur).strip())
    return segs


def _checks_in(segment):
    """段内所有 CHECK (...) 表达式（括号配平，空白归一）。"""
    found = []
    for m in re.finditer(r"\bCHECK\s*\(", segment, re.I):
        depth, j = 1, m.end()
        while j < len(segment) and depth:
            depth += {"(": 1, ")": -1}.get(segment[j], 0)
            j += 1
        found.append(re.sub(r"\s+", " ", segment[m.end():j - 1]).strip())
    return found


_CONSTRAINT = re.compile(r"^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b", re.I)


def _column_details(sql, columns):
    """每列的行内中文注释与列级 CHECK；以及表级 CHECK。"""
    names = {c.lower() for c in columns}
    comments = {}
    for line in sql.splitlines():
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s+\S", line)
        if m and m.group(1).lower() in names and "--" in line and m.group(1) not in comments:
            comments[m.group(1)] = line.split("--", 1)[1].strip()
    col_checks, table_checks = {}, []
    for seg in _body_segments(sql):
        head = re.match(r"([A-Za-z_][A-Za-z0-9_]*)", seg)
        if head and not _CONSTRAINT.match(seg) and head.group(1).lower() in names:
            col_checks[head.group(1)] = _checks_in(seg)
        else:
            table_checks.extend(_checks_in(seg))
    return comments, col_checks, table_checks


def _design_notes():
    """db/schema*.sql 中紧挨每个 CREATE 语句之前的注释块，按对象名索引。"""
    notes = {}
    for fname in SCHEMA_FILES:
        path = os.path.join(SCHEMA_DIR, fname)
        try:
            with open(path, encoding="utf-8") as f:
                lines = f.read().splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines):
            m = re.match(r"\s*CREATE\s+(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)", line, re.I)
            if not m:
                continue
            block, j = [], i - 1
            while j >= 0 and (lines[j].strip().startswith("--") or re.match(r"\s*DROP\s+VIEW", lines[j], re.I)):
                if lines[j].strip().startswith("--"):
                    block.append(lines[j].strip()[2:])
                j -= 1
            text = [ln.rstrip() for ln in reversed(block) if not re.fullmatch(r"\s*-{3,}\s*", ln)]
            indent = min((len(ln) - len(ln.lstrip()) for ln in text if ln.strip()), default=0)
            text = [ln[indent:] for ln in text]
            while text and not text[0].strip():
                text.pop(0)
            while text and not text[-1].strip():
                text.pop()
            notes[m.group(1)] = "\n".join(text)
    return notes


def _view_deps(sql, names):
    """视图在 FROM / JOIN 中引用的对象（按 sqlite_master 中的名字匹配）。"""
    clean = _strip_comments(sql)
    return [n for n in names if re.search(r"\b(?:FROM|JOIN)\s+%s\b" % re.escape(n), clean, re.I)]


# ----------------------------------------------------------------------
# 文件页图：按 SQLite 文件格式解析 B-tree
# ----------------------------------------------------------------------
def _varint(buf, pos):
    value = 0
    for k in range(9):
        b = buf[pos + k]
        if k == 8:
            return (value << 8) | b, pos + 9
        value = (value << 7) | (b & 0x7F)
        if not b & 0x80:
            return value, pos + k + 1
    return value, pos + 9


def page_map(path, roots):
    """逐页归属：每页属于哪个表/索引、是 B-tree 的内部页/叶页/溢出页，还是空闲页。

    `roots`：[(对象名, 所属表名, 根页号)]，来自 sqlite_master。返回 (文件头信息, 页列表)。
    """
    with open(path, "rb") as f:
        data = f.read()
    if len(data) < 100 or data[:16] != b"SQLite format 3\x00":
        return None, []
    u16 = lambda o: int.from_bytes(data[o:o + 2], "big")      # noqa: E731
    u32 = lambda o: int.from_bytes(data[o:o + 4], "big")      # noqa: E731
    ps = u16(16)
    ps = 65536 if ps == 1 else ps
    usable = ps - data[20]
    n = len(data) // ps
    header = {"page_size": ps, "reserved": data[20], "file_pages": n,
              "header_pages": u32(28), "change_counter": u32(24),
              "schema_cookie": u32(40), "schema_format": u32(44),
              "text_encoding": {1: "UTF-8", 2: "UTF-16le", 3: "UTF-16be"}.get(u32(56), "?"),
              "freelist_trunk": u32(32), "freelist_pages": u32(36),
              "header_hex": data[:100].hex()}
    pages = {}

    def mark(no, **info):
        if 1 <= no <= n and no not in pages:
            pages[no] = {"no": no, **info}
            return True
        return False

    def overflow(first, owner, table, parent):
        no, guard = first, 0
        while no and guard < n and mark(no, owner=owner, table=table, kind="overflow",
                                        btree=None, cells=0, used=ps, parent=parent, depth=None):
            parent, no, guard = no, u32((no - 1) * ps), guard + 1

    def walk(no, owner, table, depth, parent):
        off = (no - 1) * ps
        hdr = off + (100 if no == 1 else 0)
        kind = data[hdr] if hdr < len(data) else 0
        if kind not in (2, 5, 10, 13):
            mark(no, owner=owner, table=table, kind="unknown", btree=None, cells=0, used=0, parent=parent, depth=depth)
            return
        interior = kind in (2, 5)
        is_table = kind in (5, 13)
        hsize = 12 if interior else 8
        ncell = u16(hdr + 3)
        content = u16(hdr + 5) or 65536
        free, fb, guard = u16(hdr + 1), 0, 0
        while free and guard < 4096:
            fb += u16(off + free + 2)
            free, guard = u16(off + free), guard + 1
        unallocated = content - (hdr - off + hsize + 2 * ncell)
        used = ps - unallocated - fb - data[hdr + 7]
        ptrs = [u16(hdr + hsize + 2 * i) for i in range(ncell)]
        children = [u32(off + p) for p in ptrs] + [u32(hdr + 8)] if interior else []
        if not mark(no, owner=owner, table=table, kind="interior" if interior else "leaf",
                    btree="table" if is_table else "index", cells=ncell, used=used,
                    parent=parent, depth=depth, children=children):
            return
        # payload that spills out of the page continues on a chain of overflow pages
        if kind != 5:
            max_local = usable - 35 if is_table else (usable - 12) * 64 // 255 - 23
            min_local = (usable - 12) * 32 // 255 - 23
            for p in ptrs:
                pos = off + p + (4 if interior else 0)
                size, pos = _varint(data, pos)
                if kind == 13:
                    _, pos = _varint(data, pos)
                if size > max_local:
                    k = min_local + (size - min_local) % (usable - 4)
                    local = k if k <= max_local else min_local
                    overflow(u32(pos + local), owner, table, no)
        for child in children:
            walk(child, owner, table, depth + 1, no)

    walk(1, "sqlite_schema", "sqlite_schema", 0, None)
    for name, table, root in roots:
        if root:
            walk(root, name, table, 0, None)
    trunk, guard = header["freelist_trunk"], 0
    while trunk and guard < n:
        mark(trunk, owner="freelist", table="freelist", kind="trunk", btree=None, cells=0, used=0, parent=None, depth=None)
        base = (trunk - 1) * ps
        for i in range(min(u32(base + 4), (usable - 8) // 4)):
            mark(u32(base + 8 + 4 * i), owner="freelist", table="freelist", kind="free",
                 btree=None, cells=0, used=0, parent=trunk, depth=None)
        trunk, guard = u32(base), guard + 1
    for no in range(1, n + 1):
        mark(no, owner="", table="", kind="unknown", btree=None, cells=0, used=0, parent=None, depth=None)
    return header, [pages[no] for no in sorted(pages)]


# ----------------------------------------------------------------------
# 快照
# ----------------------------------------------------------------------
def _value(v):
    return v.hex() if isinstance(v, bytes) else v


def snapshot():
    """后台页面所需的完整只读快照（JSON 可序列化）。"""
    path = os.path.abspath(dbcore.DB_PATH)
    notes = _design_notes()
    with dbcore.db_readonly() as c:
        master = c.execute(
            "SELECT type, name, tbl_name, rootpage, sql FROM sqlite_master "
            "WHERE sql IS NOT NULL ORDER BY rowid").fetchall()
        user_objs = [m for m in master if m[0] in ("table", "view") and not m[1].startswith("sqlite_")]
        names = [m[1] for m in user_objs]
        index_sql = {m[1]: m[4] for m in master if m[0] == "index"}
        objects = []
        for typ, name, _, root, sql in user_objs:
            q = '"%s"' % name.replace('"', '""')
            cols = c.execute("PRAGMA table_xinfo(%s)" % q).fetchall()
            col_names = [r[1] for r in cols]
            comments, col_checks, table_checks = _column_details(sql, col_names) if typ == "table" else ({}, {}, [])
            fks = [{"id": r[0], "seq": r[1], "from": r[3], "table": r[2], "to": r[4],
                    "on_update": r[5], "on_delete": r[6]}
                   for r in c.execute("PRAGMA foreign_key_list(%s)" % q).fetchall()]
            indexes = []
            for r in c.execute("PRAGMA index_list(%s)" % q).fetchall():
                iq = '"%s"' % r[1].replace('"', '""')
                indexes.append({"name": r[1], "unique": bool(r[2]), "origin": r[3], "partial": bool(r[4]),
                                "columns": [x[2] for x in c.execute("PRAGMA index_info(%s)" % iq).fetchall()],
                                "sql": index_sql.get(r[1])})
            unique_cols = {i["columns"][0] for i in indexes if i["unique"] and i["origin"] == "u" and len(i["columns"]) == 1}
            count = c.execute("SELECT COUNT(*) FROM %s" % q).fetchone()[0]
            pk_cols = sorted((r for r in cols if r[5]), key=lambda r: r[5])
            order = (" ORDER BY " + ", ".join('"%s"' % r[1].replace('"', '""') for r in pk_cols)
                     if typ == "table" and pk_cols else "")
            rows = [[_value(v) for v in row] for row in
                    c.execute("SELECT * FROM %s%s LIMIT %d" % (q, order, MAX_ROWS)).fetchall()]
            objects.append({
                "name": name, "type": typ, "sql": sql, "note": notes.get(name, ""),
                "rootpage": root or 0,
                "columns": [{"name": r[1], "type": r[2] or "", "notnull": bool(r[3]), "default": r[4],
                             "pk": r[5], "hidden": r[6], "comment": comments.get(r[1], ""),
                             "checks": col_checks.get(r[1], []), "unique": r[1] in unique_cols}
                            for r in cols],
                "checks": table_checks, "fks": fks, "indexes": indexes,
                "deps": _view_deps(sql, [x for x in names if x != name]) if typ == "view" else [],
                "row_count": count, "rows": rows, "truncated": count > len(rows),
            })
        integrity = [r[0] for r in c.execute("PRAGMA integrity_check").fetchall()]
        fk_violations = len(c.execute("PRAGMA foreign_key_check").fetchall())
        pragma = lambda p: c.execute("PRAGMA %s" % p).fetchone()[0]   # noqa: E731
        meta = {"sqlite": c.execute("SELECT sqlite_version()").fetchone()[0],
                "page_size": pragma("page_size"), "page_count": pragma("page_count"),
                "freelist_count": pragma("freelist_count"), "journal_mode": pragma("journal_mode"),
                "encoding": pragma("encoding"), "user_version": pragma("user_version"),
                "foreign_keys": bool(pragma("foreign_keys"))}
        # autoindexes (PRIMARY KEY / UNIQUE) have no SQL text but do own B-trees
        roots = c.execute("SELECT name, tbl_name, rootpage FROM sqlite_master "
                          "WHERE rootpage > 0 ORDER BY rowid").fetchall()
    header, pages = page_map(path, roots)
    stat = os.stat(path)
    return {
        "file": {"name": os.path.basename(path), "bytes": stat.st_size,
                 "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
                 **meta, "header": header},
        "integrity": {"check": integrity, "fk_violations": fk_violations},
        "objects": objects,
        "pages": pages,
        "at": datetime.datetime.now().isoformat(timespec="seconds"),
    }
