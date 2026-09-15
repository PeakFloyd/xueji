#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线回归测试 (test_offline.py)
==============================
**不需要 Ollama**，随时可跑。覆盖最要紧的部分：权限边界、数字准确性、
规划器规则兜底、表达层模板、受控写入、数据库约束。

运行（在 xueji 目录下）：
    python -m unittest discover -s tests -v
或   python tests\\test_offline.py
"""
import os
import sqlite3
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common  # noqa: E402

_common.use_temp_db()

import ai_layer  # noqa: E402
import data_layer as dl  # noqa: E402
import nlg  # noqa: E402
import planner  # noqa: E402

STU = "20230001"      # 张伟（学生，计算机科学系）
STU2 = "20230002"     # 李娜（学生）
TEA = "T002"          # 李文静（老师，软件工程系）
ADM = "T001"          # 王建国（管理员，计算机科学系）


def setUpModule():
    _common.use_temp_db()


def purge_student(sid):
    """测试清理：删学生**并清掉学号台账行**，使用例可重复运行。

    生产语义是"学号不复用"，但测试需要把状态还原干净。
    """
    with dl.db() as c:
        c.execute("DELETE FROM enroll WHERE stu_id=?", (sid,))
        c.execute("DELETE FROM student WHERE stu_id=?", (sid,))
        c.execute("DELETE FROM issued_student_id WHERE stu_id=?", (sid,))


class TestIdentityAndScope(unittest.TestCase):
    """① 上下文层：身份解析与作用域派生"""

    def test_student_identity(self):
        i = dl.resolve_identity(STU)
        self.assertEqual(i["role"], "STUDENT")
        self.assertEqual(i["ref_id"], STU)

    def test_teacher_and_admin_identity(self):
        self.assertEqual(dl.resolve_identity(TEA)["role"], "TEACHER")
        self.assertEqual(dl.resolve_identity(ADM)["role"], "ADMIN")

    def test_unknown_identity(self):
        self.assertIsNone(dl.resolve_identity("NO_SUCH_ID"))

    def test_scope_of_student(self):
        s = dl.derive_scope(dl.resolve_identity(STU))
        self.assertEqual(s["self_stu"], STU)
        self.assertIsNotNone(s["dept_id"])
        self.assertFalse(s["all"], "学生不应拥有全局作用域")

    def test_scope_of_admin_is_global(self):
        s = dl.derive_scope(dl.resolve_identity(ADM))
        self.assertTrue(s["all"], "管理员应拥有全局作用域")

    def test_address_convention(self):
        """称呼规范：学生→XX同学；老师→X老师；管理员→管理员X老师"""
        self.assertEqual(dl.address_of("STUDENT", "张伟"), "张伟同学")
        self.assertEqual(dl.address_of("TEACHER", "李文静"), "李老师")
        self.assertEqual(dl.address_of("ADMIN", "王建国"), "管理员王老师")

    def test_scope_carries_address(self):
        s = dl.derive_scope(dl.resolve_identity(TEA))
        self.assertEqual(s["address"], "李老师")


class TestRbacBoundary(unittest.TestCase):
    """② 权限边界：这是最重要的一组测试"""

    def scope(self, pk):
        return dl.derive_scope(dl.resolve_identity(pk))

    def test_student_cannot_call_admin_ability(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(STU), "total_students")

    def test_student_cannot_read_other_student(self):
        """越权查他人 → 必须显式拒绝（绝不能静默返回自己的数据）"""
        with self.assertRaises(dl.Denied) as cm:
            dl.execute(self.scope(STU), "student_courses_of", {"stu_id": STU2})
        self.assertEqual(cm.exception.reason, "ROLE_NOT_ALLOWED")

    def test_teacher_cannot_query_other_dept(self):
        with self.assertRaises(dl.Denied) as cm:
            dl.execute(self.scope(TEA), "count_students_by_dept",
                       {"dept_name": "计算机科学系"})
        self.assertEqual(cm.exception.reason, "OUT_OF_SCOPE")

    def test_teacher_cannot_query_course_not_taught(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(TEA), "course_avg", {"course_name": "高等数学"})

    def test_teacher_cannot_query_class_outside_dept(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(TEA), "count_students_by_class",
                       {"class_id": "CS2301"})

    def test_student_cannot_query_other_class(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(STU), "count_students_by_class",
                       {"class_id": "MA2401"})

    def test_teacher_cannot_list_all_students(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(TEA), "list_students")

    def test_deny_wording_is_role_aware(self):
        """同一能力，学生与老师的拒绝理由必须不同（不能给学生口径给老师）"""
        student_hint = dl.CATALOG["student_courses_of"].deny_hint["STUDENT"]
        teacher_hint = dl.CATALOG["student_courses_of"].deny_hint["TEACHER"]
        self.assertNotEqual(student_hint, teacher_hint)
        self.assertIn("本人", student_hint)
        self.assertIn("教师", teacher_hint)

    def test_identity_abilities_take_no_identity_arg(self):
        """架构约束：自带身份语义的能力不得暴露身份参数，杜绝 LLM 传入他人主键"""
        for name in ("my_credit", "my_courses", "my_teaching_courses"):
            self.assertNotIn("stu_id", dl.CATALOG[name].args, name)
            self.assertNotIn("teacher_id", dl.CATALOG[name].args, name)

    def test_unknown_ability_rejected(self):
        with self.assertRaises(dl.NotFound):
            dl.execute(self.scope(ADM), "drop_database")

    def test_admin_can_read_any_student(self):
        f = dl.execute(self.scope(ADM), "student_credit_of", {"stu_id": STU2})
        self.assertEqual(f["id"], STU2)

    def test_capability_list_is_role_scoped(self):
        """能力清单必须按角色裁剪：老师/学生都不能看到"全部学生名单"这类管理员能力，
        否则提示词会把越权能力"报"给模型，进而编造。"""
        for role in ("STUDENT", "TEACHER"):
            text = dl.catalog_text(role)
            self.assertNotIn("list_students", text, role)
            self.assertNotIn("total_students", text, role)
            self.assertNotIn("add_student", text, role)
        self.assertIn("list_students", dl.catalog_text("ADMIN"))


class TestNumberAccuracy(unittest.TestCase):
    """③ 数字准确性：能力返回值必须与 SQL 真值一致"""

    def scope(self, pk):
        return dl.derive_scope(dl.resolve_identity(pk))

    def test_credit_matches_sql(self):
        f = dl.execute(self.scope(STU), "my_credit")
        with dl.db() as c:
            truth = c.execute(
                "SELECT COALESCE(SUM(co.credit),0) FROM enroll e "
                "JOIN course co ON co.course_id=e.course_id "
                "WHERE e.stu_id=? AND e.score IS NOT NULL AND e.score >= "
                "(SELECT pass_line FROM v_domain_rule)", (STU,)).fetchone()[0]
        self.assertEqual(f["earned"], truth)
        self.assertEqual(f["gap"], max(0, f["required"] - truth))

    def test_dept_count_matches_sql(self):
        f = dl.execute(self.scope(ADM), "count_students_by_dept",
                       {"dept_name": "计算机科学系"})
        with dl.db() as c:
            truth = c.execute(
                "SELECT COUNT(*) FROM student s JOIN clazz cl ON cl.class_id=s.class_id "
                "WHERE cl.dept_id='D01'").fetchone()[0]
        self.assertEqual(f["count"], truth)

    def test_teacher_count_matches_sql(self):
        f = dl.execute(self.scope(ADM), "total_teachers")
        with dl.db() as c:
            truth = c.execute("SELECT COUNT(*) FROM teacher").fetchone()[0]
        self.assertEqual(f["count"], truth)

    def test_course_avg_matches_sql(self):
        f = dl.execute(self.scope(TEA), "course_avg", {"course_name": "数据库原理"})
        with dl.db() as c:
            truth = c.execute(
                "SELECT ROUND(AVG(score),2) FROM enroll e JOIN course c "
                "ON c.course_id=e.course_id WHERE c.course_name='数据库原理'").fetchone()[0]
        self.assertEqual(f["avg"], truth)

    def test_pass_line_single_source(self):
        """及格线唯一来源：v_domain_rule"""
        with dl.db() as c:
            v = c.execute("SELECT pass_line FROM v_domain_rule").fetchone()[0]
        self.assertEqual(dl.pass_line(), v)


class TestPlannerRules(unittest.TestCase):
    """④ 规划层：确定性部分（不需要 LLM）"""

    def test_capabilities_shortcut_bypasses_llm(self):
        """权限类问题必须确定性短路，不交给 LLM（否则会编造能力）"""
        for q in ("根据我的权限，我能查询什么", "我能做什么", "我的权限范围"):
            plan, used = planner.plan(q)
            self.assertEqual(plan["kind"], "capabilities", q)
            self.assertFalse(used, "不应调用 LLM")

    def test_rule_fallback_intents(self):
        cases = {
            "我的学分还差多少": "my_credit",
            "我教的课有哪些": "my_teaching_courses",
            "各系有多少学生": "students_by_dept",
            "一共多少老师": "total_teachers",
        }
        for q, ability in cases.items():
            plan = planner._rule_plan(q)
            self.assertEqual(plan["kind"], "plan", q)
            self.assertEqual(plan["calls"][0]["ability"], ability, q)

    def test_rule_fallback_chat(self):
        self.assertEqual(planner._rule_plan("你好")["kind"], "chat")

    def test_rule_fallback_failed_names_when_asking_who(self):
        """问"谁没及格"→ 要的是人，不是人数"""
        plan = planner._rule_plan("我教的课都有谁没及格")
        self.assertEqual(plan["calls"][0]["ability"], "my_failed_students")

    def test_rule_fallback_fail_summary_when_asking_counts(self):
        """问"各有多少人不及格"→ 要的是各门课概况"""
        plan = planner._rule_plan("我教的课分别有多少人不及格")
        self.assertEqual(plan["calls"][0]["ability"], "my_courses_summary")

    def test_rule_fallback_avg_without_course_uses_summary(self):
        """未指明课程问平均分 → 各门课概况（内含平均分），而不是报"缺课程名\""""
        plan = planner._rule_plan("我教的课程平均分是多少分，有多少人不及格")
        self.assertEqual(plan["calls"][0]["ability"], "my_courses_summary")

    def test_rule_fallback_course_roster(self):
        plan = planner._rule_plan("把数据库原理的学生名单给我")
        self.assertEqual(plan["calls"][0]["ability"], "my_course_students")

    def test_whitelist_filters_hallucinated_ability(self):
        """模型编造的能力名必须被白名单过滤掉"""
        orig = planner._llm
        planner._llm = lambda *a, **k: (
            '{"calls":[{"ability":"drop_database","args":{}},'
            '{"ability":"total_teachers","args":{}}]}')
        try:
            plan, used = planner.plan("随便问一句")
        finally:
            planner._llm = orig
        self.assertTrue(used)
        names = [c["ability"] for c in plan["calls"]]
        self.assertNotIn("drop_database", names)
        self.assertIn("total_teachers", names)


class TestNlgTemplates(unittest.TestCase):
    """⑤ 表达层：数字模板（确定性，不依赖 LLM）"""

    def test_credit_template(self):
        t = nlg.facts_text("student_credit", {
            "kind": "student_credit", "address": "张伟同学", "name": "张伟",
            "id": STU, "dept": "计算机科学系", "earned": 31, "required": 20,
            "gap": 0, "enrolled": 9, "failed": 0})
        self.assertIn("31", t)
        self.assertIn("20", t)
        self.assertIn("已修满", t)
        self.assertIn("张伟同学", t)

    def test_missing_requirement_is_explicit(self):
        """未设置毕业要求 → 必须明说，绝不能报"已修满"（曾发生过的缺陷）"""
        t = nlg.facts_text("student_credit", {
            "kind": "student_credit", "address": "李四同学", "name": "李四",
            "id": "X", "dept": "新建系", "earned": 0, "required": None,
            "gap": None, "enrolled": 0, "failed": 0})
        self.assertIn("尚未设置", t)
        self.assertNotIn("已修满", t)

    def test_course_avg_no_scores(self):
        t = nlg.facts_text("course_avg", {
            "kind": "course_avg", "address": "李老师", "course": "某课",
            "count": 0, "avg": None, "pass_line": 60.0, "qualified": None})
        self.assertIn("暂无成绩", t)

    def test_pass_line_rendered_without_decimal(self):
        """60.0 应显示为 60"""
        t = nlg.facts_text("course_fail", {
            "kind": "course_fail", "address": "李老师", "course": "数据库原理",
            "fail": 6, "pass_line": 60.0})
        self.assertIn("60", t)
        self.assertNotIn("60.0", t)

    def test_courses_summary_includes_avg_and_fail(self):
        """同一能力同时给出平均分与不及格人数——复合问一次答全"""
        t = nlg.facts_text("courses_summary", {
            "kind": "courses_summary", "address": "李老师",
            "list": [{"course": "数据库原理", "enrolled": 30, "avg": 70.37,
                      "qualified": True, "fail": 6, "pass_line": 60.0},
                     {"course": "软件项目管理", "enrolled": 12, "avg": 58.5,
                      "qualified": False, "fail": 2, "pass_line": 60.0}]})
        self.assertIn("数据库原理", t)
        self.assertIn("70.37", t)
        self.assertIn("6", t)
        self.assertIn("未达标", t)
        self.assertNotIn("60.0", t)


class TestControlledWrites(unittest.TestCase):
    """⑥ 受控写入：仅管理员，且受外键约束"""

    def scope(self, pk):
        return dl.derive_scope(dl.resolve_identity(pk))

    def test_student_cannot_write(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(STU), "add_student",
                       {"stu_id": "20999997", "stu_name": "测试", "gender": "男",
                        "class_id": "CS2301"})

    def test_teacher_cannot_delete(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(TEA), "delete_student", {"stu_id": STU2})

    def test_admin_add_then_delete(self):
        sid = "20999999"
        try:
            f = dl.execute(self.scope(ADM), "add_student",
                           {"stu_id": sid, "stu_name": "测试员", "gender": "男",
                            "class_id": "CS2301"})
            self.assertIn(sid, f["text"])
            self.assertIsNotNone(dl.resolve_identity(sid), "新增后应可登录")
            # 重复新增应被拒
            with self.assertRaises(dl.NotFound):
                dl.execute(self.scope(ADM), "add_student",
                           {"stu_id": sid, "stu_name": "测试员", "gender": "男",
                            "class_id": "CS2301"})
            dl.execute(self.scope(ADM), "delete_student", {"stu_id": sid})
            self.assertIsNone(dl.resolve_identity(sid), "删除后应失去身份")
        finally:
            purge_student(sid)

    def test_add_with_bad_class_rejected(self):
        with self.assertRaises(dl.NotFound):
            dl.execute(self.scope(ADM), "add_student",
                       {"stu_id": "20999998", "stu_name": "测试", "gender": "男",
                        "class_id": "NO_SUCH_CLASS"})
        purge_student("20999998")


class TestStudentIdPolicy(unittest.TestCase):
    """⑪ 学号策略：格式校验 + 只发一次（不复用）"""

    SID = "20997777"

    def scope(self, pk="T001"):
        return dl.derive_scope(dl.resolve_identity(pk))

    def tearDown(self):
        purge_student(self.SID)

    def test_ledger_covers_seeded_students(self):
        """演示数据里的学号同样视为"已发放"，删除后不得复用"""
        with dl.db() as c:
            n_stu = c.execute("SELECT COUNT(*) FROM student").fetchone()[0]
            n_led = c.execute("SELECT COUNT(*) FROM issued_student_id").fetchone()[0]
            missing = c.execute(
                "SELECT COUNT(*) FROM student s WHERE NOT EXISTS "
                "(SELECT 1 FROM issued_student_id i WHERE i.stu_id = s.stu_id)"
            ).fetchone()[0]
        self.assertEqual(missing, 0, "每个在册学生都应已登记在台账中")
        self.assertGreaterEqual(n_led, n_stu)

    def test_bad_format_rejected(self):
        for bad in ("666666", "abcdefgh", "2023000a", "202300012", ""):
            with self.assertRaises(dl.NotFound, msg=bad):
                dl.preview(self.scope(), "add_student",
                           {"stu_id": bad, "stu_name": "测试", "gender": "男",
                            "class_id": "CS2301"})

    def test_valid_format_accepted(self):
        f = dl.preview(self.scope(), "add_student",
                       {"stu_id": self.SID, "stu_name": "测试", "gender": "男",
                        "class_id": "CS2301"})
        self.assertEqual(f["kind"], "write_preview")

    def test_id_is_not_reused_after_delete(self):
        """核心：删除后学号**永久占用**，不得补给他人"""
        dl.execute(self.scope(), "add_student",
                   {"stu_id": self.SID, "stu_name": "张三", "gender": "男",
                    "class_id": "CS2301"})
        dl.execute(self.scope(), "delete_student", {"stu_id": self.SID})
        self.assertIsNone(dl.resolve_identity(self.SID))
        with self.assertRaises(dl.NotFound) as cm:
            dl.preview(self.scope(), "add_student",
                       {"stu_id": self.SID, "stu_name": "李四", "gender": "女",
                        "class_id": "CS2302"})
        self.assertIn("复用", str(cm.exception))

    def test_delete_keeps_ledger_row(self):
        dl.execute(self.scope(), "add_student",
                   {"stu_id": self.SID, "stu_name": "张三", "gender": "男",
                    "class_id": "CS2301"})
        dl.execute(self.scope(), "delete_student", {"stu_id": self.SID})
        with dl.db() as c:
            row = c.execute("SELECT 1 FROM issued_student_id WHERE stu_id=?",
                            (self.SID,)).fetchone()
        self.assertIsNotNone(row, "删除学生不应删除台账行")

    def test_db_check_backstop(self):
        """绕过应用层直接插库，也应被 CHECK 挡住"""
        with self.assertRaises(sqlite3.IntegrityError):
            with dl.db() as c:
                c.execute("INSERT INTO student(stu_id,stu_name,gender,class_id) "
                          "VALUES('666666','乱来','男','CS2301')")


class TestTeacherCourseScope(unittest.TestCase):
    """⑨ 教师对本课程学生的可见性：业务上应可见，但不得越出本人授课范围"""

    def scope(self, pk):
        return dl.derive_scope(dl.resolve_identity(pk))

    def test_teacher_sees_own_course_roster(self):
        f = dl.execute(self.scope(TEA), "my_course_students",
                       {"course_name": "数据库原理"})
        self.assertTrue(f["list"], "老师应能看到本人授课的学生名单")
        for k in ("id", "name", "score"):
            self.assertIn(k, f["list"][0], "名单应包含学号/姓名/成绩")

    def test_teacher_sees_failed_students_with_ids(self):
        f = dl.execute(self.scope(TEA), "my_failed_students",
                       {"course_name": "数据库原理"})
        self.assertTrue(f["list"])
        for x in f["list"]:
            self.assertIsNotNone(x["score"])
            self.assertLess(x["score"], f["pass_line"])
            self.assertTrue(x["id"], "不及格名单也应带学号")

    def test_failed_students_stay_within_own_courses(self):
        f = dl.execute(self.scope(TEA), "my_failed_students", {})
        taught = set(dl.execute(self.scope(TEA), "my_teaching_courses")["courses"])
        self.assertTrue(f["list"])
        for x in f["list"]:
            self.assertIn(x["course"], taught, "不得出现非本人授课课程")

    def test_teacher_cannot_see_other_course_roster(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(TEA), "my_course_students",
                       {"course_name": "高等数学"})

    def test_student_cannot_use_teacher_roster_ability(self):
        with self.assertRaises(dl.Denied):
            dl.execute(self.scope(STU), "my_course_students",
                       {"course_name": "数据库原理"})

    def test_student_score_lookup_is_scoped_to_own_courses(self):
        """查"本人课上某学生成绩"：非本人课程应查不到（且不泄露存在性）"""
        f = dl.execute(self.scope(TEA), "my_student_scores",
                       {"stu_id": STU, "course_name": "数据库原理"})
        self.assertEqual(len(f["list"]), 1)
        self.assertEqual(f["list"][0]["id"], STU)
        with self.assertRaises(dl.NotFound):
            dl.execute(self.scope(TEA), "my_student_scores",
                       {"stu_id": STU, "course_name": "高等数学"})

    def test_student_score_lookup_requires_target(self):
        with self.assertRaises(dl.NotFound):
            dl.execute(self.scope(TEA), "my_student_scores", {})

    def test_courses_summary_has_avg_and_fail(self):
        """复合问（平均分 + 不及格）由同一个能力一次给全，不能只给一半或报"缺课程名\""""
        f = dl.execute(self.scope(TEA), "my_courses_summary", {})
        self.assertTrue(f["list"])
        for x in f["list"]:
            for k in ("course", "enrolled", "avg", "qualified", "fail", "pass_line"):
                self.assertIn(k, x, "概况应同时含平均分与不及格人数")
        with dl.db() as c:
            truth = c.execute(
                "SELECT COUNT(*) FROM v_teacher_course v JOIN v_course_stat s "
                "ON s.course_id=v.course_id WHERE v.teacher_id=?", (TEA,)).fetchone()[0]
        self.assertEqual(len(f["list"]), truth)


class TestWriteConfirmation(unittest.TestCase):
    """⑩ 写入二次确认：预览不落库 → 确认才写 → 取消/超时/换话题都不写"""

    SID = "20998888"
    ARGS = {"stu_id": SID, "stu_name": "测试同学", "gender": "男", "class_id": "CS2301"}

    def scope(self, pk="T001"):
        return dl.derive_scope(dl.resolve_identity(pk))

    def tearDown(self):
        ai_layer.reset_session("T001")
        purge_student(self.SID)

    def _arm(self, ability="add_student", args=None, sid=None):
        """模拟"已生成待确认动作"的状态。"""
        ai_layer.reset_session("T001")
        ai_layer._session("T001")["pending"] = {
            "ability": ability, "args": args or dict(self.ARGS), "ts": time.time()}

    # ---- 预览不落库 ----
    def test_preview_does_not_write(self):
        f = dl.preview(self.scope(), "add_student", dict(self.ARGS))
        self.assertEqual(f["kind"], "write_preview")
        self.assertIsNone(dl.resolve_identity(self.SID), "预览阶段绝不能写库")

    def test_preview_reports_missing_fields(self):
        with self.assertRaises(dl.NotFound) as cm:
            dl.preview(self.scope(), "add_student", {"stu_id": self.SID})
        self.assertIn("姓名", str(cm.exception))

    def test_delete_preview_warns_about_enrollments(self):
        f = dl.preview(self.scope(), "delete_student", {"stu_id": STU})
        self.assertIn("选课", f["warning"], "删除预览应提示连带影响")

    def test_non_admin_cannot_preview_write(self):
        with self.assertRaises(dl.Denied):
            dl.preview(self.scope(STU), "add_student", dict(self.ARGS))

    def test_every_write_ability_has_preview(self):
        """架构约束：写操作必须注册预览函数，否则无法二次确认"""
        for ab in dl.CATALOG.values():
            if ab.write:
                self.assertIsNotNone(ab.preview, "%s 缺少 preview" % ab.name)

    # ---- 确认 / 取消 ----
    def test_confirm_executes(self):
        self._arm()
        r = ai_layer.handle("确认", "T001")
        self.assertEqual(r["status"], "WRITE_DONE")
        self.assertIsNotNone(dl.resolve_identity(self.SID), "确认后应已落库")
        self.assertIsNone(ai_layer._session("T001")["pending"], "确认后应清空待确认")

    def test_cancel_discards(self):
        self._arm()
        r = ai_layer.handle("取消", "T001")
        self.assertEqual(r["status"], "WRITE_CANCELLED")
        self.assertIsNone(dl.resolve_identity(self.SID), "取消后绝不能落库")

    def test_unrelated_message_discards_pending(self):
        self._arm()
        ai_layer.handle("我教的课有哪些", "T001")
        self.assertIsNone(dl.resolve_identity(self.SID))
        self.assertIsNone(ai_layer._session("T001")["pending"])

    def test_expired_pending_is_discarded(self):
        self._arm()
        # 人为把时间戳拨早，使其超过有效期
        ai_layer._session("T001")["pending"]["ts"] = time.time() - ai_layer.PENDING_TTL - 10
        r = ai_layer.handle("确认", "T001")
        self.assertNotEqual(r["status"], "WRITE_DONE")
        self.assertIsNone(dl.resolve_identity(self.SID), "过期后不得落库")

    def test_login_reset_clears_pending(self):
        self._arm()
        ai_layer.handle("你好", "T001", reset=True)
        self.assertIsNone(ai_layer._session("T001")["pending"], "登录重置应清空待确认")

    def test_confirm_word_variants(self):
        """每种确认词都应触发执行；各变体用独立学号，避免撞上"学号不复用"策略"""
        for i, w in enumerate(("确认", "确定", "好", "OK", "执行")):
            sid = "2099880%d" % i
            self._arm(args=dict(self.ARGS, stu_id=sid))
            r = ai_layer.handle(w, "T001")
            self.assertEqual(r["status"], "WRITE_DONE", w)
            self.assertIsNotNone(dl.resolve_identity(sid), w)
            purge_student(sid)

    def test_question_containing_confirm_word_is_not_a_confirmation(self):
        """严格匹配：'是不是有奖学金' 不应被当成确认"""
        self._arm()
        r = ai_layer.handle("是不是有奖学金", "T001")
        self.assertNotEqual(r["status"], "WRITE_DONE")
        self.assertIsNone(dl.resolve_identity(self.SID))

    # ---- 三个已修复的缺陷（防回归）----

    def test_preview_does_not_swallow_read_facts(self):
        """缺陷1：同一句里既写入又查询时，查询结果不得被吞掉"""
        orig = planner.plan
        planner.plan = lambda q, h=None: ({"kind": "plan", "calls": [
            {"ability": "add_student", "args": dict(self.ARGS)},
            {"ability": "total_teachers", "args": {}},
        ]}, True)
        try:
            ai_layer.reset_session("T001")
            r = ai_layer.handle("新增一个学生，另外一共多少老师", "T001")
        finally:
            planner.plan = orig
        self.assertEqual(r["status"], "PENDING_CONFIRM")
        self.assertIn("待确认", r["answer"], "应给出待确认")
        self.assertIn("老师", r["answer"], "查询结果不得丢失")

    def test_discarded_pending_is_announced(self):
        """缺陷2：放弃待确认动作时必须告知用户，不能静默丢弃"""
        self._arm()
        r = ai_layer.handle("你好呀", "T001")
        self.assertIn("放弃", r["answer"], "应提示上一个待确认已放弃")
        self.assertIsNone(dl.resolve_identity(self.SID))

    def test_expired_confirm_is_reported(self):
        """缺陷3a：待确认超时后回"确认"，必须说明已作废且未执行"""
        self._arm()
        ai_layer._session("T001")["pending"]["ts"] = \
            time.time() - ai_layer.PENDING_TTL - 10
        r = ai_layer.handle("确认", "T001")
        self.assertEqual(r["status"], "PENDING_EXPIRED")
        self.assertIn("超时", r["answer"])
        self.assertIsNone(dl.resolve_identity(self.SID), "超时后绝不能落库")

    def test_confirm_without_pending_is_not_smalltalk(self):
        """缺陷3b：没有待确认却回"确认"，不能被当成闲聊而含糊应付"""
        ai_layer.reset_session("T001")
        r = ai_layer.handle("确认", "T001")
        self.assertEqual(r["status"], "NOTHING_PENDING")
        self.assertNotEqual(r["status"], "CHAT")


class TestDatabaseIntegrity(unittest.TestCase):
    """⑦ 数据库约束：外键 / CHECK / 域常量（绕过应用层直接写库，也必须被挡住）"""

    def test_foreign_key_enforced(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dl.db() as c:
                c.execute("INSERT INTO enroll(stu_id,course_id,score) "
                          "VALUES('NO_SUCH','C001',50)")

    def test_check_constraint_score_range(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dl.db() as c:
                c.execute("INSERT INTO enroll(stu_id,course_id,score) "
                          "VALUES(?, 'C003', 999)", (STU,))

    def test_course_name_unique(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dl.db() as c:
                c.execute("INSERT INTO course(course_id,course_name,credit) "
                          "VALUES('C999','软件工程',3)")


class TestEndToEndOffline(unittest.TestCase):
    """⑧ 编排层：即使 Ollama 不可用（规则降级 + 模板措辞）也应能工作"""

    def test_identity_not_found(self):
        ai_layer.reset_session("NO_SUCH")
        r = ai_layer.handle("你好", "NO_SUCH")
        self.assertEqual(r["status"], "NOT_FOUND")

    def test_student_credit_offline(self):
        ai_layer.reset_session(STU)
        r = ai_layer.handle("我的学分和毕业还差多少", STU)
        self.assertEqual(r["status"], "OK")
        self.assertIn("学分", r["answer"])

    def test_capabilities_offline(self):
        ai_layer.reset_session(TEA)
        r = ai_layer.handle("根据我的权限，我能查询什么", TEA)
        self.assertEqual(r["status"], "CAPABILITIES")
        self.assertIn("李老师", r["answer"])

    def test_session_reset_on_login(self):
        ai_layer.handle("你好", STU, reset=True)
        self.assertTrue(ai_layer._history(STU))
        ai_layer.handle("你好", STU, reset=True)
        self.assertEqual(len(ai_layer._history(STU)), 2, "重置后只应剩本轮两跳")


if __name__ == "__main__":
    unittest.main(verbosity=2)
