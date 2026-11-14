#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 数据层门面与执行器 (data_layer.py)
=============================================
对外只暴露这一层；Python 桥接器与测试从这里取用。

职责：
  * 按能力名执行（`execute`）与写操作预览（`preview`）
  * 角色校验与拒绝措辞（`_check_role` 等）
  * 能力目录渲染（`catalog_text`）

并把底层基础（连接/异常/身份/作用域/域常量）与能力目录**再导出**，
使调用方只需 `import data_layer as dl` 一处即可。
"""

from dbcore import (DB_PATH, ADMIN_ID, db, pass_line, Denied, NotFound,
                    resolve_identity, derive_scope, scope_desc, address_of)
from abilities import Ability, CATALOG


# ----------------------------------------------------------------------
# 执行器
# ----------------------------------------------------------------------
def _resolve_hint(value, role, default=None):
    """deny_hint / deny_alternatives 可以是字符串（通用）或 {角色: 值}（按角色定制）。"""
    if isinstance(value, dict):
        v = value.get(role)
        return v if v is not None else default
    return value if value is not None else default


def _default_alternatives(scope):
    """按角色给出"我能帮你做什么"的默认替代方案。"""
    if scope["role"] == "STUDENT":
        return ["查询我自己的学分与选课情况", "查询本系同学人数"]
    if scope["role"] == "TEACHER":
        return ["查询本院学生人数", "查询您本人所授课程的情况"]
    return ["查询全校统计数据", "查询学生或教师名单"]


def _check_role(scope, ab):
    """角色不足 → 抛 Denied（措辞按当前角色定制）。"""
    if scope["role"] not in ab.roles:
        hint = _resolve_hint(ab.deny_hint, scope["role"],
                             "该操作仅 %s 可用" % "/".join(ab.roles))
        alts = _resolve_hint(ab.deny_alternatives, scope["role"],
                             _default_alternatives(scope))
        raise Denied("ROLE_NOT_ALLOWED", hint, alts)


def execute(scope, name, args=None):
    """按能力名执行；未知名/越权/不存在 → 抛异常，由编排层转成结构化结果。"""
    args = args or {}
    ab = CATALOG.get(name)
    if ab is None:
        raise NotFound("我没有「%s」这项能力" % name)
    _check_role(scope, ab)
    return ab.fn(scope, args)


def preview(scope, name, args=None):
    """写操作的**预览**：只校验并生成待确认概要，**不写库**。

    真正落库由用户在下一轮确认后调用 `execute()`。
    """
    args = args or {}
    ab = CATALOG.get(name)
    if ab is None:
        raise NotFound("我没有「%s」这项能力" % name)
    if not ab.write or ab.preview is None:
        raise NotFound("「%s」不是需要确认的写操作" % name)
    _check_role(scope, ab)
    return ab.preview(scope, args)


def catalog_text(role=None):
    """把能力目录渲染成给规划器/用户看的文本。role 为 None 时给全部。

    对非管理员，末尾附一句**范围说明**，避免把"受限能力"说成"全都能查"。
    """
    lines = []
    for a in CATALOG.values():
        if role and role not in a.roles:
            continue
        argtxt = ("，参数：" + "、".join("%s(%s)" % (k, v) for k, v in a.args.items())) \
            if a.args else "，无参数"
        lines.append("- %s：%s%s" % (a.name, a.doc, argtxt))
    text = "\n".join(lines)
    if role == "STUDENT":
        text += "\n（说明：学生只能查询本人数据、本班人数与本系聚合数据）"
    elif role == "TEACHER":
        text += "\n（说明：教师只能查询本院范围内的数据，以及本人所授课程的明细）"
    return text
