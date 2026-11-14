#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 数据库基础 (dbcore.py)
=================================
数据层的最底层，不含任何业务能力：

  * 连接：`db()` —— **唯一**入口，自动开启外键、提交/回滚、关闭
  * 域常量：`pass_line()` —— 及格线，唯一来源是视图 v_domain_rule
  * 异常：`Denied`（越权）/ `NotFound`（不存在）
  * 身份与作用域：身份 = 主键；作用域由身份派生（服务端唯一来源）

上层：`abilities.py`（能力目录）、`data_layer.py`（执行器与对外门面）。
"""

import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get(
    "XUEJI_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db", "xueji.db"),
)
ADMIN_ID = "T001"                 # 常量：唯一管理员（其本身是老师）


# ----------------------------------------------------------------------
# 连接与域常量
# ----------------------------------------------------------------------
@contextmanager
def db():
    """数据库连接的**唯一**入口。

    * 每条连接都开启 `PRAGMA foreign_keys = ON`（SQLite 的连接级开关，默认关闭）
    * 正常结束自动提交；出错自动回滚
    * **确保关闭连接**（注意：SQLite 的 Connection 上下文管理器只处理事务、不关闭连接）
    """
    c = sqlite3.connect(DB_PATH)
    c.execute("PRAGMA foreign_keys = ON")
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


_pass_line_cache = None


def pass_line():
    """及格线：唯一来源是视图 v_domain_rule；缺失时显式报错，不回退默认值。"""
    global _pass_line_cache
    if _pass_line_cache is None:
        with db() as c:
            row = c.execute("SELECT pass_line FROM v_domain_rule").fetchone()
        if not row or row[0] is None:
            raise RuntimeError("域常量缺失：视图 v_domain_rule 未提供 pass_line")
        _pass_line_cache = row[0]
    return _pass_line_cache


# ----------------------------------------------------------------------
# 异常：越权 / 未找到
# ----------------------------------------------------------------------
class Denied(Exception):
    """越权或角色不允许。携带原因码、作用域说明与可替代方案，供表达层温和措辞。"""

    def __init__(self, reason, detail="", alternatives=None):
        super().__init__(detail or reason)
        self.reason = reason            # ROLE_NOT_ALLOWED / OUT_OF_SCOPE
        self.detail = detail            # 内部说明（也用作模板兜底）
        self.alternatives = alternatives or []


class NotFound(Exception):
    """实体不存在。"""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


# ----------------------------------------------------------------------
# 身份与作用域
# ----------------------------------------------------------------------
def resolve_identity(pk):
    """身份 = 主键。先查学生，再查老师。返回 {role, ref_id, display} 或 None。"""
    with db() as c:
        s = c.execute("SELECT stu_id, stu_name FROM student WHERE stu_id=?",
                      (pk,)).fetchone()
        t = None
        if not s:
            t = c.execute("SELECT teacher_id, teacher_name FROM teacher "
                          "WHERE teacher_id=?", (pk,)).fetchone()
    if s:
        return {"role": "STUDENT", "ref_id": s[0], "display": s[1]}
    if t:
        role = "ADMIN" if t[0] == ADMIN_ID else "TEACHER"
        return {"role": role, "ref_id": t[0], "display": t[1]}
    return None


def derive_scope(identity):
    """由身份派生作用域（服务端唯一来源，不经过 LLM）。

    返回的 scope 是整个数据层的"权限上下文"：所有能力都只依据它决定可见范围。
    """
    role = identity["role"]
    scope = {"role": role, "ref_id": identity["ref_id"], "display": identity["display"],
             "self_stu": None, "self_teacher": None, "dept_id": None, "dept_name": None,
             "all": False}

    with db() as c:
        if role == "STUDENT":
            scope["self_stu"] = identity["ref_id"]
            r = c.execute("SELECT cl.dept_id, d.dept_name FROM student s "
                          "JOIN clazz cl ON cl.class_id=s.class_id "
                          "JOIN department d ON d.dept_id=cl.dept_id "
                          "WHERE s.stu_id=?", (identity["ref_id"],)).fetchone()
            if r:
                scope["dept_id"], scope["dept_name"] = r[0], r[1]
        else:
            scope["self_teacher"] = identity["ref_id"]
            r = c.execute("SELECT t.dept_id, d.dept_name FROM teacher t "
                          "JOIN department d ON d.dept_id=t.dept_id "
                          "WHERE t.teacher_id=?", (identity["ref_id"],)).fetchone()
            if r:
                scope["dept_id"], scope["dept_name"] = r[0], r[1]
            scope["all"] = (role == "ADMIN")
    scope["address"] = address_of(role, identity["display"])
    return scope


def scope_desc(scope):
    """把作用域翻译成一句人话，供表达层温和说明"我能看到什么"。"""
    if scope["role"] == "STUDENT":
        return "您本人%s的数据" % ("（" + scope["dept_name"] + "）" if scope["dept_name"] else "")
    if scope["role"] == "TEACHER":
        return "本院（%s）以及您本人授课的数据" % (scope["dept_name"] or "未知")
    return "全校数据"


def address_of(role, name):
    """称呼规范：
    * 学生   → 「张伟同学」
    * 老师   → 「王老师」（姓 + 老师）
    * 管理员 → 「管理员王老师」（管理员本身也是老师：既点明身份，也带上称呼）
    """
    if role == "ADMIN":
        return ("管理员%s老师" % name[:1]) if name else "管理员"
    if role == "TEACHER":
        return ((name or "")[:1] + "老师") if name else "老师"
    return ((name or "") + "同学") if name else "同学"
