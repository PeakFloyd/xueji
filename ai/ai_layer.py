#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · AI 查询层 编排 (ai_layer.py)
======================================
把四层串起来（见 docs/AI层重构设计.md）：

  ① 上下文层 data_layer.derive_scope   身份 → 作用域（服务端派生）
  ② 规划层   planner.plan             自然语言 → 结构化计划（能力+参数）
  ③ 执行层   data_layer.execute        白名单能力 + 强制作用域
  ④ 表达层   nlg.*                     数字走模板；拒绝/闲聊走温和人格

设计要点
--------
  * AI 自由，数据守界：LLM 只理解与规划，没有任何直接数据权限
  * 作用域由身份派生，绝不接受 LLM 传入的身份参数
  * 数字只由 SQL + 确定性模板产生
  * 登录即刷新会话（作用域随身份变，历史不得跨身份复用）
  * Ollama 未启动也能工作：规划降级为规则、措辞降级为模板

对外接口
--------
  handle(question, pk, reset=False) -> dict   # 推荐（api_server 使用）
  run(question, pk) -> (answer, data)         # 兼容旧调用
"""
import argparse
import json
import sys
import time

import data_layer as dl
import nlg
import planner

ROLE_CN = {"STUDENT": "学生", "TEACHER": "老师", "ADMIN": "管理员"}

# 会话：pk -> {"history": [(role, text), ...], "pending": {...} | None}
_SESSIONS = {}

# 写操作的"待确认"有效期（秒）；超时自动作废，避免隔很久误确认
PENDING_TTL = 300

_YES = {"确认", "确定", "是", "是的", "好", "好的", "好呀", "可以", "执行", "嗯",
        "对", "对的", "没问题", "就这样", "继续", "yes", "y", "ok", "okay"}
_NO = {"取消", "不", "不用", "不要", "算了", "别", "放弃", "不要了", "no", "n"}


def reset_session(pk):
    """登录时调用：清空该身份的对话历史与待确认动作（作用域随身份变化，历史不得沿用）。"""
    _SESSIONS.pop(pk, None)


def _session(pk):
    return _SESSIONS.setdefault(pk, {"history": [], "pending": None})


def _history(pk):
    return _session(pk)["history"]


def _push(pk, who, text):
    h = _history(pk)
    h.append((who, text))
    del h[:-12]                                   # 只保留最近若干轮


def _norm_reply(text):
    """归一化用户回复：去掉空白与常见标点，便于判定"确认/取消"。"""
    return "".join(ch for ch in (text or "").strip().lower()
                   if ch not in "　 \t\r\n。，,！!？?~～.、")


def _take_pending(pk):
    """取出并清空待确认动作；超时视为作废。返回 pending 或 None。"""
    sess = _session(pk)
    p = sess.get("pending")
    sess["pending"] = None
    if not p:
        return None
    if time.time() - p.get("ts", 0) > PENDING_TTL:
        return None
    return p


def handle(question, pk, reset=False):
    """处理一次问答，返回结构化结果。

    :param question: 用户问题
    :param pk:       身份主键（学号/教师号）
    :param reset:    True 表示"登录/切换身份"，清空历史与待确认动作
    :return: {"status", "answer", "data", "role", "ref", "display"}
    """
    identity = dl.resolve_identity(pk)
    if not identity:
        reset_session(pk)
        return _result("NOT_FOUND",
                       "我在系统里没找到这个身份的记录呢～ 麻烦确认一下学号或教师号是否输入正确？"
                       "（演示可用：学生 20230001 / 老师 T002 / 管理员 T001）",
                       None, None, pk, "")

    role, ref, display = identity["role"], identity["ref_id"], identity["display"]
    if reset:
        reset_session(pk)

    scope = dl.derive_scope(identity)
    scope_text = dl.scope_desc(scope)
    address = scope["address"]
    history = _history(pk)

    # ①.5 待确认动作：先处理"确认/取消"，避免它被当成新问题重新规划
    notice = ""                                  # 需要附加在回答前的提示
    pending = _session(pk).get("pending")
    if pending:
        reply = _norm_reply(question)
        if reply in _YES:
            p = _take_pending(pk)
            if p:
                try:
                    f = dl.execute(scope, p["ability"], p["args"])
                    answer = nlg.facts_text(f["kind"], f)
                    status = "WRITE_DONE"
                except (dl.Denied, dl.NotFound) as e:
                    answer = "抱歉，执行时出了问题：%s" % e
                    status = "NOT_FOUND"
                _push(pk, "user", question)
                _push(pk, "assistant", answer)
                return _result(status, answer, None, role, ref, display)
            # 走到了这里说明待确认【已超时作废】——必须明说，不能让用户以为执行了
            answer = ("抱歉，上一个待确认的操作已经超时作废，**没有执行任何改动**。"
                      "如果你还需要，请重新发起一次。")
            _push(pk, "user", question)
            _push(pk, "assistant", answer)
            return _result("PENDING_EXPIRED", answer, None, role, ref, display)
        elif reply in _NO:
            _take_pending(pk)
            answer = "好的，已取消，没有做任何改动。"
            _push(pk, "user", question)
            _push(pk, "assistant", answer)
            return _result("WRITE_CANCELLED", answer, None, role, ref, display)
        else:
            # 说了别的：放弃上一个待确认动作，但**必须告知**，不能静默丢弃
            _take_pending(pk)
            notice = "（提示：上一个待确认的操作已放弃，没有做任何改动）\n\n"
    elif _norm_reply(question) in (_YES | _NO):
        # 没有待确认动作却回了"确认/取消"——明确说明，避免被当成闲聊而误导
        answer = "现在没有待确认的操作哦～ 如果你想新增或删除学籍，请直接说明要做什么。"
        _push(pk, "user", question)
        _push(pk, "assistant", answer)
        return _result("NOTHING_PENDING", answer, None, role, ref, display)

    # ② 规划
    plan, _ = planner.plan(question, history)     # 第二返回值=是否用了 LLM，此处不需要

    # 闲聊
    if plan.get("kind") == "chat":
        answer = nlg.smalltalk_text(question, scope_text, ROLE_CN.get(role, role),
                                    address, history)
        answer = notice + answer
        _push(pk, "user", question)
        _push(pk, "assistant", answer)
        return _result("CHAT", answer, None, role, ref, display)

    # 自身权限/能力清单（只描述能力，不查数据）
    if plan.get("kind") == "capabilities":
        answer = nlg.capabilities_text(role, dl.catalog_text(role), address, scope_text)
        answer = notice + answer
        _push(pk, "user", question)
        _push(pk, "assistant", answer)
        return _result("CAPABILITIES", answer, None, role, ref, display)

    # ③ 执行（写操作只做"预览"，不落库；等用户确认）
    facts_list, denied, not_found, unknown = [], None, None, None
    preview_fact = None
    for call in plan.get("calls", []):
        name, args = call["ability"], call.get("args", {})
        if name == "__unknown__" or name not in dl.CATALOG:
            unknown = name
            continue
        try:
            if dl.CATALOG[name].write:
                preview_fact = dl.preview(scope, name, args)
            else:
                facts_list.append(dl.execute(scope, name, args))
        except dl.Denied as d:
            if denied is None:
                denied = d
        except dl.NotFound as nf:
            if not_found is None:
                not_found = nf

    # 写操作 → 返回待确认（此时数据库尚未改动）
    if preview_fact is not None:
        _session(pk)["pending"] = {"ability": preview_fact["ability"],
                                   "args": preview_fact["args"],
                                   "ts": time.time()}
        # 同一句里可能既要求写入、又问了别的问题：**不能把已取到的查询结果丢掉**
        parts = [nlg.facts_text(f["kind"], f) for f in facts_list]
        if denied is not None:
            parts.append(nlg.deny_text(question, denied, scope_text, address))
        parts.append(nlg.facts_text("write_preview", preview_fact))
        answer = notice + "\n\n".join(parts)
        _push(pk, "user", question)
        _push(pk, "assistant", answer)
        return _result("PENDING_CONFIRM", answer,
                       json.dumps(facts_list + [preview_fact], ensure_ascii=False),
                       role, ref, display)

    # ④ 表达
    if denied is not None and facts_list:
        # 部分成功：能答的先答（不丢弃已取到的结果），再温和说明做不到的那部分
        answer = "\n".join(nlg.facts_text(f["kind"], f) for f in facts_list)
        answer += "\n\n" + nlg.deny_text(question, denied, scope_text, address)
        status = "PARTIAL"
    elif denied is not None:
        answer = nlg.deny_text(question, denied, scope_text, address)
        status = "DENIED"
    elif unknown is not None and not facts_list:
        answer = nlg.unknown_text(question, role, dl.catalog_text(role))
        status = "UNKNOWN"
    elif not_found is not None and not facts_list:
        answer = nlg.not_found_text(question, not_found.detail, address)
        status = "NOT_FOUND"
    elif facts_list:
        answer = "\n".join(nlg.facts_text(f["kind"], f) for f in facts_list)
        status = "OK"
    else:
        answer = nlg.unknown_text(question, role, dl.catalog_text(role))
        status = "UNKNOWN"

    answer = notice + answer
    _push(pk, "user", question)
    _push(pk, "assistant", answer)
    return _result(status, answer,
                   json.dumps(facts_list, ensure_ascii=False) if facts_list else None,
                   role, ref, display)


def _result(status, answer, data, role, ref, display):
    return {"status": status, "answer": answer, "data": data,
            "role": role, "ref": ref, "display": display}


def run(question, pk=""):
    """兼容旧调用：返回 (answer, data)。"""
    r = handle(question, pk)
    return r["answer"], r["data"]


# ----------------------------------------------------------------------
# 命令行
# ----------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="学籍 AI 查询层")
    ap.add_argument("--user", default="20230001", help="身份主键（学号/教师号）")
    ap.add_argument("sub", nargs="?", help="ask（默认）/ add / del")
    ap.add_argument("args", nargs="*")
    a = ap.parse_args()

    pk = a.user
    # 说明：CLI 的子命令 add/del 是**显式且无歧义**的指令，直接执行；
    #       而自然语言路径（ask 里说"新增一个学生…"）会先出"待确认"，等回复确认后才落库。
    if a.sub in ("add", "del"):
        ident = dl.resolve_identity(pk)
        if not ident:
            print("身份不存在")
            sys.exit(1)
        scope = dl.derive_scope(ident)
        if a.sub == "add":
            if len(a.args) != 4:
                print("用法: --user T001 add <学号> <姓名> <性别> <班号>")
                sys.exit(1)
            args = {"stu_id": a.args[0], "stu_name": a.args[1],
                    "gender": a.args[2], "class_id": a.args[3]}
            name = "add_student"
        else:
            if len(a.args) != 1:
                print("用法: --user T001 del <学号>")
                sys.exit(1)
            args = {"stu_id": a.args[0]}
            name = "delete_student"
        try:
            f = dl.execute(scope, name, args)
            print("[受控写入] " + f["text"])
        except (dl.Denied, dl.NotFound) as e:
            print("[拒绝] " + str(e))
            sys.exit(1)
        return

    question = " ".join([a.sub] + a.args) if a.sub else "你好"
    r = handle(question, pk, reset=True)
    print("提问: %s   (角色: %s / 身份: %s)" % (question, r["role"], r["ref"]))
    print("[状态] " + r["status"])
    if r["data"]:
        print("[数据层] " + r["data"])
    print("[回答]\n" + r["answer"])


if __name__ == "__main__":
    main()
