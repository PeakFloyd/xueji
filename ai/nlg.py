#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 表达层 (nlg.py)
==========================
职责（对应 docs/AI层重构设计.md 的④表达层与第九节"应答人格"）：

  * 数字类回答：用**确定性模板**精确拼装（LLM 不参与产生数字，防编数）
  * 越权/未找到：用 LLM 按**温和人格**措辞，并给出作用域内的替代方案
  * 闲聊：LLM 自由回应

人格规格
--------
  温和礼貌、以"我"为主语、先承接再说明后给替代、
  **逆来顺受但不松口**（明确告知做不到，绝不含糊）、绝不编造数据。
  LLM 不可用时回退到内置的温和模板，保证降级也能说话得体。
"""
import json
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "qwen2.5:7b"
TIMEOUT = 30

PERSONA = (
    "你叫「学籍助手」，是学籍管理系统的智能助手。语气温和、礼貌、亲切，"
    "多用「我」「您」，可以带轻微的语气词（如「～」「哈」），但不要过度卖萌。"
    "你只依据给定的事实说话，绝不编造任何数据或数字；不知道就直说不知道。"
    "**不要用问候语开头**：只有用户主动打招呼时才寒暄，其余情况直接说正事，"
    "不要每次都说「您好」「你好」。"
)


# ----------------------------------------------------------------------
# LLM 调用（失败返回 None，由调用方回退模板）
# ----------------------------------------------------------------------
def _chat(messages, num_predict=200):
    try:
        body = json.dumps({"model": MODEL, "messages": messages, "stream": False,
                           "options": {"temperature": 0.6, "num_predict": num_predict}}
                          ).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))["message"]["content"].strip()
    except Exception:
        return None


# ----------------------------------------------------------------------
# 数字格式化
# ----------------------------------------------------------------------
def _n(v):
    """60.0 -> "60"；76.37 保留；None -> "-"。"""
    if v is None:
        return "-"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _who(f):
    """取称呼：优先用数据层给出的 address（张伟同学 / 王老师 / 管理员）。"""
    return f.get("address") or f.get("name") or "您"


# ----------------------------------------------------------------------
# 确定性模板：数据类回答（数字只来自这里）
# ----------------------------------------------------------------------
def facts_text(kind, f):
    """把事实精确拼成人话。数字绝不经过 LLM。"""
    if kind == "student_credit":
        extra = ""
        if f.get("failed"):
            extra = "（已选 %d 门，其中不及格 %d 门，不及格课程不计学分）" % (
                f["enrolled"], f["failed"])
        if f["required"] is None:
            return ("%s（%s）已修 %d 学分；但%s【尚未设置毕业学分要求】，"
                    "暂时无法判断是否达到毕业要求。%s"
                    % (_who(f), f["id"], f["earned"], f["dept"], extra))
        state = "已修满，达到毕业要求" if f["gap"] == 0 else "还差 %d 学分" % f["gap"]
        return "%s（%s）已修 %d 学分，%s要求 %d 学分，%s。%s" % (
            _who(f), f["id"], f["earned"], f["dept"], f["required"], state, extra)

    if kind == "my_course_list":
        if not f["courses"]:
            return "%s 目前还没有选课记录。" % _who(f)
        items = ["%s《%s》%d学分%s" % (
            c["id"], c["name"], c["credit"],
            "" if c["score"] is None else "成绩%s" % _n(c["score"])) for c in f["courses"]]
        return "%s 已选 %d 门课程：%s。" % (_who(f), len(items), "；".join(items))

    if kind == "my_dept_students":
        if f.get("mates") is not None:
            return "%s 所在的%s共有学生 %d 人（除您之外 %d 人）。" % (
                _who(f), f["dept"], f["count"], f["mates"])
        return "%s 所在的%s共有学生 %d 人。" % (_who(f), f["dept"], f["count"])

    if kind == "my_courses":
        cs = "、".join(f["courses"]) if f["courses"] else "（暂无）"
        return "%s 目前授课：%s。" % (_who(f), cs)

    if kind == "course_avg":
        if f["avg"] is None:
            return "课程《%s》暂无成绩记录（选课 %d 人），暂时算不出平均分。" % (
                f["course"], f["count"])
        return "课程《%s》选课 %d 人，平均分 %s，达标线 %s，%s。" % (
            f["course"], f["count"], _n(f["avg"]), _n(f["pass_line"]),
            "已达标" if f["qualified"] else "未达标")

    if kind == "course_fail":
        return "课程《%s》低于 %s 分的有 %d 人。" % (
            f["course"], _n(f["pass_line"]), f["fail"])

    if kind == "course_students":
        if not f["list"]:
            return "《%s》目前还没有学生选课。" % f["course"]
        items = ["%s（%s）%s" % (
            x["name"], x["id"], "未考" if x["score"] is None else "成绩%s" % _n(x["score"]))
            for x in f["list"]]
        return "《%s》共 %d 名学生：%s。" % (f["course"], len(items), "；".join(items))

    if kind == "failed_students":
        pl = _n(f["pass_line"])
        if not f["list"]:
            return ("《%s》没有不及格的学生。" % f["course"]) if f["course"] \
                else "您所授课程中目前没有不及格的学生。"
        if f["course"]:
            return "《%s》低于 %s 分的学生共 %d 人：%s。" % (
                f["course"], pl, len(f["list"]),
                "、".join("%s（%s，%s分）" % (x["name"], x["id"], _n(x["score"]))
                          for x in f["list"]))
        by = {}
        for x in f["list"]:
            by.setdefault(x["course"], []).append(x)
        parts = ["《%s》：%s" % (
            c, "、".join("%s（%s，%s分）" % (y["name"], y["id"], _n(y["score"])) for y in v))
            for c, v in by.items()]
        return "您所授课程中低于 %s 分的学生共 %d 人 —— %s。" % (
            pl, len(f["list"]), "；".join(parts))

    if kind == "student_scores":
        if not f["list"]:
            return "没有查到相关的成绩记录。"
        if len(f["list"]) == 1:
            x = f["list"][0]
            sc = "未考" if x["score"] is None else "%s 分" % _n(x["score"])
            return "%s（%s）在《%s》的成绩是%s。" % (
                x["name"], x["id"], x["course"], sc)
        who = f["list"][0]["name"]
        return "%s（%s）在您所授课程中的成绩：%s。" % (
            who, f["list"][0]["id"],
            "；".join("《%s》%s" % (x["course"],
                                  "未考" if x["score"] is None else "%s 分" % _n(x["score"]))
                     for x in f["list"]))

    if kind == "courses_summary":
        if not f["list"]:
            return "%s 目前没有可统计的授课课程。" % _who(f)
        pl = _n(f["list"][0]["pass_line"])
        parts = []
        for x in f["list"]:
            if x["avg"] is None:
                parts.append("《%s》暂无成绩（选课 %d 人）" % (x["course"], x["enrolled"]))
            else:
                parts.append("《%s》平均分 %s（%s），不及格 %d 人" % (
                    x["course"], _n(x["avg"]),
                    "达标" if x["qualified"] else "未达标", x["fail"]))
        return "%s 所授课程情况（达标线 %s）：%s。" % (_who(f), pl, "；".join(parts))

    if kind == "dept_students":
        return "%s 共有学生 %d 人。" % (f["dept"], f["count"])

    if kind == "class_students":
        return "%s 共有学生 %d 人。" % (f["dept"], f["count"])

    if kind == "total_students":
        return "当前在籍学生共 %d 人。" % f["count"]

    if kind == "total_teachers":
        return "当前共有老师 %d 位。" % f["count"]

    if kind == "students_by_dept":
        return "各系在籍人数：" + "；".join(
            "%s %d 人" % (x["dept"], x["count"]) for x in f["list"])

    if kind == "list_students":
        return "在籍学生共 %d 人：\n%s" % (len(f["list"]), "\n".join(f["list"]))

    if kind == "list_teachers":
        return "教师共 %d 位：\n%s" % (len(f["list"]), "\n".join(f["list"]))

    if kind == "write_preview":
        lines = ["【待确认】%s" % f["action"]]
        for k, v in f["fields"]:
            lines.append("  · %s：%s" % (k, v))
        if f.get("warning"):
            lines.append("  注意：%s" % f["warning"])
        lines.append("")
        lines.append("请回复「确认」执行，或回复「取消」放弃。数据库尚未改动。")
        return "\n".join(lines)

    if kind == "write_done":
        return f["text"] + "。"

    return json.dumps(f, ensure_ascii=False)


# ----------------------------------------------------------------------
# 温和人格：越权 / 未找到 / 闲聊
# ----------------------------------------------------------------------
def _deny_messages(question, denial, scope_text, address=""):
    alts = "、".join(denial.alternatives) if denial.alternatives else "查询与您身份相符的数据"
    return [
        {"role": "system", "content": PERSONA},
        {"role": "user", "content":
            "用户刚提出了一个我无法满足的请求。请写一句回复，要求：\n"
            "1) 先承接他的意图，表示理解；\n"
            "2) 温和地说明我做不到，并说明原因；\n"
            "3) 主动提供一个我能做的替代方案：%s；\n"
            "4) 必须让他明确知道「这件事我做不到」，绝不含糊其辞；\n"
            "5) 不争辩、不说教、不重复拒绝；\n"
            "6) 绝不编造任何数据或数字；\n"
            "7) 称呼对方为「%s」；\n"
            "8) 只输出回复本身，1~3 句。\n\n"
            "【用户的请求】%s\n【我做不到的原因】%s\n【我能看到的范围】%s"
            % (alts, address or "您", question,
               denial.detail or "权限限制", scope_text)},
    ]


def deny_text(question, denial, scope_text, address=""):
    """温和拒绝。LLM 不可用时回退到内置的温和模板。"""
    out = _chat(_deny_messages(question, denial, scope_text, address))
    if out:
        return out
    alts = "、".join(denial.alternatives) if denial.alternatives else ""
    tail = "不过我可以帮您%s，需要的话说一声～" % alts if alts else "您可以问我力所能及的问题～"
    return "%s，抱歉哈，这件事我帮不上忙：%s。我这边只能看到%s。%s" % (
        address or "您好", denial.detail or "权限所限", scope_text, tail)


def not_found_text(question, detail, address=""):
    """温柔提示"没找到"。"""
    out = _chat([
        {"role": "system", "content": PERSONA},
        {"role": "user", "content":
            "用户的问题里有个信息我没查到。请温和地告诉他，并请他确认，1~2 句，"
            "不要编造数据。\n【用户的问题】%s\n【情况】%s" % (question, detail)},
    ])
    if out:
        return out
    return "我在系统里没找到对应的记录呢～ %s，麻烦您确认一下？" % detail


def unknown_text(question, role, catalog_lines):
    """没有对应能力时，说明"我能做什么"。"""
    out = _chat([
        {"role": "system", "content": PERSONA},
        {"role": "user", "content":
            "用户问了一件我做不到的事。请温和地回应，**明确告诉他这件事我做不到**，"
            "并顺势告诉他我能做什么，2~3 句，不要编造数据。\n"
            "**严禁承诺任何不在下方清单里的能力**（例如不要承诺「帮你列出某门课的学生名单」，"
            "除非它确实在清单里）。\n"
            "【用户的问题】%s\n【我能做的事】\n%s" % (question, catalog_lines)},
    ])
    if out:
        return out
    return "这个我暂时还不会呢～ 不过我目前可以帮您做这些：\n%s" % catalog_lines


def capabilities_text(role, catalog_lines, address="", scope_text=""):
    """回答"我能查询什么/我的权限是什么"——只描述能力，不查数据。"""
    out = _chat([
        {"role": "system", "content": PERSONA},
        {"role": "user", "content":
            "用户问自己当前能做什么。请以「%s」称呼他，温和、清楚地列出他能做的事，"
            "分点或一句话皆可，2~4 句，不要编造数据。\n"
            "【他的身份】%s\n【他能做的事】\n%s\n【他能看到的数据范围】%s"
            % (address or "您", role, catalog_lines, scope_text)},
    ])
    if out:
        return out
    return "%s，您目前可以做这些事：\n%s\n可查看的数据范围：%s" % (
        address or "您好", catalog_lines, scope_text)


def smalltalk_text(question, scope_text, role_cn, address="", history=None):
    """闲聊：LLM 自由回应（不涉及数据）。

    **禁止罗列能力**：闲聊路径拿不到能力清单，一旦让它"说说能做什么"，
    它就会编造出并不存在的能力（已实测发生）。需要清单时走 capabilities 路径。
    """
    msgs = [{"role": "system", "content":
             PERSONA + " 现在用户是在闲聊或打招呼，请自然、简短、友好地回应，"
             "称呼对方为「%s」。"
             "**不要罗列或承诺任何具体功能/能力**（例如不要说「我可以查全校名单」）；"
             "如果对方问你能做什么，只需邀请他直接问「我能查询什么」。"
             "**绝不编造数据，也绝不编造能力。**"
             % (address or "您")}]
    for h in (history or [])[-4:]:
        msgs.append({"role": h[0], "content": h[1]})
    msgs.append({"role": "user", "content": question})
    out = _chat(msgs, num_predict=160)
    if out:
        return out
    return ("你好呀，%s～我是学籍助手。作为%s，我可以帮您查看%s。"
            "有什么想问的直接说就好～" % (address or "您好", role_cn, scope_text))
