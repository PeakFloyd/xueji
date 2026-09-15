#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 规划层 (planner.py)
==============================
职责（对应 docs/AI层重构设计.md 的②规划层）：

  把用户的自然语言问题，转成**结构化计划**：要调用哪些能力、带什么参数。
  支持"一句多查"（复合问）与"指代消解"（借助对话历史）。

关键约束
--------
  * LLM **只做理解与规划**，绝不生成 SQL、绝不接触数据
  * 规划结果必须经过**白名单校验**（未知名丢弃）
  * LLM 不可用时**降级为规则路由**，保证离线/Ollama 未启动也能做基本查询

输出结构
--------
  {"kind":"plan", "calls":[{"ability":..., "args":{...}}, ...]}
  {"kind":"chat"}                     供表达层走闲聊
"""
import json
import re
import urllib.request

from data_layer import CATALOG, db

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5:7b"
TIMEOUT = 60


# ----------------------------------------------------------------------
# 实体词表（供规划器把口语中的实体映射到库中的标识）
# ----------------------------------------------------------------------
def entity_glossary():
    """给出系名/课程名/班号等"目录类"实体，帮助规划器识别与抽取参数。

    注意：这些只是标识与名称（目录数据），不含任何个人明细；
    真正的行数据一律由数据层按作用域放行。
    """
    with db() as c:
        depts = [r[0] for r in c.execute("SELECT dept_name FROM department ORDER BY dept_id")]
        courses = [r[0] for r in c.execute("SELECT course_name FROM course ORDER BY course_id")]
        classes = [r[0] for r in c.execute("SELECT class_id FROM clazz ORDER BY class_id")]
    return depts, courses, classes


# ----------------------------------------------------------------------
# LLM 调用
# ----------------------------------------------------------------------
def _llm(prompt, num_predict=220):
    """调用本地 Ollama；失败（未启动/超时）返回 None，由调用方降级。"""
    try:
        body = json.dumps({
            "model": MODEL, "prompt": prompt, "stream": False,
            "options": {"temperature": 0, "num_predict": num_predict},
        }).encode("utf-8")
        req = urllib.request.Request(OLLAMA_URL, data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8")).get("response", "")
    except Exception:
        return None


def _extract_json(text):
    """从模型输出中抠出第一个 JSON 对象。"""
    if not text:
        return None
    i, j = text.find("{"), text.rfind("}")
    if i < 0 or j <= i:
        return None
    try:
        return json.loads(text[i:j + 1])
    except Exception:
        return None


# ----------------------------------------------------------------------
# 规划器主逻辑
# ----------------------------------------------------------------------
PLAN_SYSTEM = """你是一个"查询规划器"。你的唯一任务：把用户的问题翻译成对下列【能力】的调用计划。
规则：
1. 只能使用下面列出的能力，不得发明新能力，不得写 SQL。
2. 一句话若包含多件事，必须输出多个调用（不要漏掉任何一个）。
3. 结合【对话历史】理解指代（例如用户先说"有多少老师"，再说"学生呢"）。
4. 如果是打招呼、闲聊、问你能做什么等与数据无关的内容，输出 {"chat": true}。
5. 如果用户问的是"我有什么权限/我能查询什么/我能做什么"这类**关于自身权限**的问题，
   输出 {"capabilities": true}（注意：不要为此去调用任何数据能力）。
6. 只输出 JSON，不要任何解释文字。

能力清单：
%s

已知实体：
- 系名：%s
- 课程名：%s
- 班号：%s

参考示例（务必模仿这种"不漏问"的风格）：
问：一共有多少老师和学生
答：{"calls":[{"ability":"total_teachers","args":{}},{"ability":"total_students","args":{}}]}
问：有多少老师
答：{"calls":[{"ability":"total_teachers","args":{}}]}
问：我教的数据库原理有多少人不及格
答：{"calls":[{"ability":"course_fail","args":{"course_name":"数据库原理"}}]}
问：把没及格的同学姓名给我
答：{"calls":[{"ability":"my_failed_students","args":{}}]}
问：我教的数据库原理谁没及格
答：{"calls":[{"ability":"my_failed_students","args":{"course_name":"数据库原理"}}]}
问：把数据库原理的学生名单给我
答：{"calls":[{"ability":"my_course_students","args":{"course_name":"数据库原理"}}]}
问：数据库原理里张伟考了多少分
答：{"calls":[{"ability":"my_student_scores","args":{"course_name":"数据库原理","stu_name":"张伟"}}]}
问：20230001 在我课上考了多少分
答：{"calls":[{"ability":"my_student_scores","args":{"stu_id":"20230001"}}]}
问：我教的课分别有多少人不及格
答：{"calls":[{"ability":"my_courses_summary","args":{}}]}
问：我教的课程平均分多少，有多少人不及格
答：{"calls":[{"ability":"my_courses_summary","args":{}}]}
问：我教的课程情况怎么样
答：{"calls":[{"ability":"my_courses_summary","args":{}}]}
问：根据我的权限，我能查询什么
答：{"capabilities":true}
问：你好
答：{"chat":true}

输出格式（严格）：
{"calls": [{"ability": "能力名", "args": {"参数": "值"}}]}
用户问自身权限时：{"capabilities": true}
纯闲聊时输出：{"chat": true}
"""


def _build_prompt(question, history, glossary):
    depts, courses, classes = glossary
    sys = PLAN_SYSTEM % (
        "\n".join("- %s：%s%s" % (
            a.name, a.doc,
            ("，参数：" + "、".join(a.args.keys())) if a.args else "")
            for a in CATALOG.values()),
        "、".join(depts), "、".join(courses), "、".join(classes))
    hist = ""
    if history:
        hist = "\n【对话历史】\n" + "\n".join(
            "%s：%s" % ("用户" if h[0] == "user" else "助手", h[1]) for h in history[-6:])
    return sys + hist + "\n\n【当前问题】\n" + question + "\n\n请输出 JSON："


# 权限类问题：用确定性规则判定，**不交给 LLM**。
# 原因：LLM 可能把它误判为闲聊，进而"编造"一批并不存在的能力（已实测发生）。
_CAP_WORDS = ("权限", "能查询什么", "能查什么", "我能做什么", "可以查什么",
              "能干什么", "我的能力", "能做什么")


def plan(question, history=None):
    """生成计划。优先 LLM，失败则规则降级。返回 (plan_dict, used_llm)。"""
    # 自身权限类问题：确定性短路（必须先于 LLM）
    if any(w in question for w in _CAP_WORDS):
        return {"kind": "capabilities"}, False

    raw = _llm(_build_prompt(question, history or [], entity_glossary()))
    data = _extract_json(raw) if raw else None
    if isinstance(data, dict):
        if data.get("chat"):
            return {"kind": "chat"}, True
        if data.get("capabilities"):
            return {"kind": "capabilities"}, True
        calls = data.get("calls")
        if isinstance(calls, list):
            valid = []
            for c in calls:
                if not isinstance(c, dict):
                    continue
                name = c.get("ability")
                if name in CATALOG:                 # 白名单校验
                    args = c.get("args")
                    valid.append({"ability": name,
                                  "args": args if isinstance(args, dict) else {}})
            if valid:
                return {"kind": "plan", "calls": valid}, True
    # 降级：规则路由
    return _rule_plan(question), False


# ----------------------------------------------------------------------
# 规则降级（Ollama 不可用时仍可做基本查询）
# ----------------------------------------------------------------------
def _rule_plan(question):
    """关键词 → 单一能力的兜底路由（不支持复合问，但保证离线可用）。"""
    q = question

    def has(*ks):
        return any(k in q for k in ks)

    # 自身权限类问题优先于闲聊（"我能做什么" 含 "能做什么"，必须先判权限）
    if has("权限", "能查询什么", "能查什么", "我能做什么", "可以查什么"):
        return {"kind": "capabilities"}
    if has("你好", "你是谁", "介绍", "能做什么", "会什么", "在吗", "hello", "hi", "谢谢", "再见"):
        return {"kind": "chat"}
    # 写入：离线时尽力抽取字段，缺失的由"预览"提示补全（仍需二次确认才落库）
    if has("新增", "添加", "加一个", "录入", "增加", "新学生", "新生", "插入"):
        return {"kind": "plan", "calls": [{"ability": "add_student", "args": {
            "stu_id": _guess_new_sid(q),
            "stu_name": _guess_new_name(q),
            "gender": _guess_gender(q),
            "class_id": _guess_class(q)}}]}
    if has("删除", "移除", "去掉", "开除", "退学"):
        sid, sname = _guess_student(q)
        args = {}
        if sid:
            args["stu_id"] = sid
        elif sname:
            with db() as c:
                r = c.execute("SELECT stu_id FROM student WHERE stu_name=?", (sname,)).fetchone()
            if r:
                args["stu_id"] = r[0]
        return {"kind": "plan", "calls": [{"ability": "delete_student", "args": args}]}
    # 「不及格 / 平均分」这类**更具体**的意图必须排在「我的课」之前，
    # 否则"我教的课都有谁没及格"会被误判为"列出我教的课"。
    if has("不及格", "挂科", "没及格", "低于"):
        cname = _guess_course(q)
        # "要姓名/名单" → 列出具体学生（老师只能看本人授课范围）
        if has("姓名", "名单", "谁", "哪些人", "同学", "人名"):
            args = {"course_name": cname} if cname else {}
            return {"kind": "plan", "calls": [{"ability": "my_failed_students",
                                               "args": args}]}
        if cname:
            return {"kind": "plan", "calls": [{"ability": "course_fail",
                                               "args": {"course_name": cname}}]}
        # 未指明课程：给出"我所授各门课"的概况（含不及格人数）
        return {"kind": "plan", "calls": [{"ability": "my_courses_summary", "args": {}}]}
    if has("平均分", "均分", "达标"):
        cname = _guess_course(q)
        if cname:
            return {"kind": "plan", "calls": [{"ability": "course_avg",
                                               "args": {"course_name": cname}}]}
        # 未指明课程：同样给"各门课概况"（其中就含平均分与达标情况）
        return {"kind": "plan", "calls": [{"ability": "my_courses_summary", "args": {}}]}
    # 查"某个学生在我课上"的成绩
    if has("考了多少", "考了几分", "多少分", "成绩是多少", "得了多少"):
        args = {}
        sid, sname = _guess_student(q)
        if sid:
            args["stu_id"] = sid
        if sname:
            args["stu_name"] = sname
        cname = _guess_course(q)
        if cname:
            args["course_name"] = cname
        if sid or sname:
            return {"kind": "plan", "calls": [{"ability": "my_student_scores",
                                               "args": args}]}
    if has("学分", "毕业", "还差", "修了多少"):
        return {"kind": "plan", "calls": [{"ability": "my_credit", "args": {}}]}
    if has("我选的", "我选课", "选了什么"):
        return {"kind": "plan", "calls": [{"ability": "my_courses", "args": {}}]}
    if has("我教的课", "我的课", "教了哪些", "授课"):
        return {"kind": "plan", "calls": [{"ability": "my_teaching_courses", "args": {}}]}
    if has("本院", "我系", "本系", "系里", "院里"):
        return {"kind": "plan", "calls": [{"ability": "my_dept_students_count", "args": {}}]}
    if has("各系", "按系"):
        return {"kind": "plan", "calls": [{"ability": "students_by_dept", "args": {}}]}
    if has("老师", "教师") and has("多少", "几个", "位", "总数", "一共", "总共"):
        return {"kind": "plan", "calls": [{"ability": "total_teachers", "args": {}}]}
    if has("名单", "花名册", "学生"):
        # 指明课程 → 查该课学生名单（本人授课范围内即可满足）
        cname = _guess_course(q)
        if cname:
            return {"kind": "plan", "calls": [{"ability": "my_course_students",
                                               "args": {"course_name": cname}}]}
    if has("名单", "所有学生", "全部学生", "列学生"):
        return {"kind": "plan", "calls": [{"ability": "list_students", "args": {}}]}
    if has("在籍", "全校", "多少学生", "几个学生", "共有", "一共", "总共"):
        return {"kind": "plan", "calls": [{"ability": "total_students", "args": {}}]}
    return {"kind": "plan", "calls": [{"ability": "__unknown__", "args": {}}]}


def _guess_course(q):
    """从问题里找出库中存在的课程名（规则兜底用）。"""
    with db() as c:
        names = [r[0] for r in c.execute("SELECT course_name FROM course")]
    for n in names:
        if n in q:
            return n
    return ""


def _guess_student(q):
    """从问题里找出学号或姓名（规则兜底用）。返回 (stu_id, stu_name)。"""
    with db() as c:
        rows = c.execute("SELECT stu_id, stu_name FROM student").fetchall()
    # 先匹配学号（更精确）
    for sid, _name in rows:
        if sid in q:
            return sid, ""
    for _sid, name in rows:
        if name and name in q:
            return "", name
    return "", ""


def _guess_new_sid(q):
    """新增场景：抽取一个尚不存在的学号（连续 6~12 位数字）。"""
    m = re.search(r"\d{6,12}", q)
    return m.group(0) if m else ""


def _guess_new_name(q):
    """新增场景：抽取"叫X"/"姓名X"形式的姓名（离线尽力而为，失败则留空由预览提示）。"""
    m = re.search(r"(?:叫|姓名|名字是?)\s*([\u4e00-\u9fa5]{2,4})", q)
    return m.group(1) if m else ""


def _guess_gender(q):
    if "男" in q:
        return "男"
    if "女" in q:
        return "女"
    return ""


def _guess_class(q):
    with db() as c:
        ids = [r[0] for r in c.execute("SELECT class_id FROM clazz")]
    for cid in ids:
        if cid.lower() in q.lower():
            return cid
    return ""
