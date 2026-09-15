#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
端到端回归测试 (test_e2e.py)
============================
覆盖需要**本地 Ollama** 的完整链路：复合问、指代消解、越权拦截、权限说明。

Ollama 未启动时整个模块自动跳过（离线测试 test_offline.py 仍可跑）。

运行：
    python tests\\test_e2e.py
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common  # noqa: E402

_common.use_temp_db()

import ai_layer  # noqa: E402
import data_layer as dl  # noqa: E402

STU = "20230001"
STU2 = "20230002"
TEA = "T002"
ADM = "T001"


def ask(pk, question, reset=False):
    if reset:
        ai_layer.reset_session(pk)
    return ai_layer.handle(question, pk, reset=reset)


def facts(r):
    """把 handle() 返回的 data（JSON 字符串）解析成列表。"""
    if not r.get("data"):
        return []
    return json.loads(r["data"])


@unittest.skipUnless(_common.ollama_alive(), "需要本地 Ollama（未启动则跳过）")
class TestEndToEnd(unittest.TestCase):

    def setUp(self):
        for pk in (STU, STU2, TEA, ADM):
            ai_layer.reset_session(pk)

    # ---------- 复合问 ----------
    def test_compound_query_returns_all_parts(self):
        """一句多查：老师和学生都要答到，不能漏"""
        r = ask(ADM, "一共有多少老师和学生")
        self.assertEqual(r["status"], "OK")
        kinds = {f["kind"] for f in facts(r)}
        self.assertIn("total_teachers", kinds)
        self.assertIn("total_students", kinds)

    def test_compound_numbers_match_sql(self):
        r = ask(ADM, "一共有多少老师和学生")
        got = {f["kind"]: f.get("count") for f in facts(r)}
        with dl.db() as c:
            teachers = c.execute("SELECT COUNT(*) FROM teacher").fetchone()[0]
            students = c.execute("SELECT COUNT(*) FROM student").fetchone()[0]
        self.assertEqual(got.get("total_teachers"), teachers)
        self.assertEqual(got.get("total_students"), students)

    # ---------- 指代消解 ----------
    def test_coreference_across_turns(self):
        """先问老师，再问"学生呢"，应借助历史理解指代"""
        r1 = ask(ADM, "一共有多少老师")
        self.assertEqual(r1["status"], "OK")
        r2 = ask(ADM, "那学生呢")
        self.assertEqual(r2["status"], "OK")
        self.assertIn("total_students", {f["kind"] for f in facts(r2)})

    # ---------- 越权 ----------
    def test_student_cannot_read_other_student(self):
        r = ask(STU, "我想看看20230002的成绩")
        self.assertEqual(r["status"], "DENIED")
        # 绝不能静默改写为"自己的成绩"
        self.assertEqual(facts(r), [])

    def test_teacher_cannot_query_other_dept(self):
        r = ask(TEA, "计算机系有多少学生")
        self.assertEqual(r["status"], "DENIED")

    def test_teacher_cannot_list_all_students(self):
        r = ask(TEA, "把全校学生名单给我")
        self.assertEqual(r["status"], "DENIED")

    # ---------- 权限说明 ----------
    def test_capabilities_intent(self):
        r = ask(TEA, "根据我的权限，我能查询什么")
        self.assertEqual(r["status"], "CAPABILITIES")
        self.assertIn("李老师", r["answer"])

    # ---------- 正常查询 ----------
    def test_student_credit(self):
        r = ask(STU, "我的学分和毕业还差多少")
        self.assertEqual(r["status"], "OK")
        self.assertIn("student_credit", {f["kind"] for f in facts(r)})
        self.assertIn("张伟同学", r["answer"])

    def test_teacher_own_course_avg(self):
        r = ask(TEA, "我教的数据库原理平均分是否达标")
        self.assertEqual(r["status"], "OK")
        self.assertIn("course_avg", {f["kind"] for f in facts(r)})

    def test_chat(self):
        r = ask(STU, "你好呀", reset=True)
        self.assertEqual(r["status"], "CHAT")

    # ---------- 教师对本课程学生的可见性 ----------
    def test_teacher_can_see_own_course_failed_students(self):
        """老师要"没及格的学生名单"→ 必须能拿到本人课程的不及格学生。

        "学生名单"本身有歧义（可能指全校），故允许 OK 或 PARTIAL；
        关键是**本人课程的不及格学生必须给到**，而不是一律被拒。
        """
        r = ask(TEA, "给我学生名单，我看看都谁没及格")
        self.assertIn(r["status"], ("OK", "PARTIAL"), r["status"])
        kinds = {f["kind"] for f in facts(r)}
        self.assertTrue(kinds & {"failed_students", "courses_summary"},
                        "应给出本人课程的不及格学生，实际：%s" % kinds)
        self.assertIn("李老师", r["answer"])

    def test_teacher_can_see_course_roster(self):
        r = ask(TEA, "把数据库原理的学生名单给我")
        self.assertEqual(r["status"], "OK")
        kinds = {f["kind"] for f in facts(r)}
        self.assertTrue(kinds & {"course_students"}, kinds)

    def test_compound_avg_and_fail_in_one_question(self):
        """未指明课程时问"平均分+不及格"，应由各门课概况一次答全"""
        r = ask(TEA, "我教的课程，平均分是多少分，有多少人不及格")
        self.assertEqual(r["status"], "OK", r["answer"])
        rows = [f for f in facts(r) if f["kind"] == "courses_summary"]
        self.assertTrue(rows, "应返回各门课概况：%s" % facts(r))
        for x in rows[0]["list"]:
            self.assertIn("avg", x)
            self.assertIn("fail", x)

    def test_admin_address_is_full_title(self):
        r = ask(ADM, "你好", reset=True)
        self.assertEqual(r["status"], "CHAT")
        self.assertIn("管理员王老师", r["answer"])

    def test_teacher_cannot_see_other_course_roster(self):
        r = ask(TEA, "把高等数学的学生名单给我")
        self.assertIn(r["status"], ("DENIED", "NOT_FOUND"))

    # ---------- 部分可答 ----------
    def test_partial_when_mixed_permission(self):
        """既要全校名单（不可）又要本人课程不及格（可以）→ 两者都要体现"""
        r = ask(TEA, "把全校学生名单给我，另外我教的课谁没及格")
        self.assertIn(r["status"], ("PARTIAL", "DENIED"))
        if r["status"] == "PARTIAL":
            kinds = {f["kind"] for f in facts(r)}
            self.assertTrue(kinds & {"failed_students", "courses_summary"}, kinds)


if __name__ == "__main__":
    unittest.main(verbosity=2)
