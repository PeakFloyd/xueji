#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bridge protocol, authorization, deterministic facts, and write safety tests.

Run with ``python -m unittest discover -s tests -v``. Every mutation targets a
private database copy; the test process never writes to db/xueji.db.
"""

import json
import os
import sqlite3
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common  # noqa: E402

_common.use_temp_db()

import dbcore  # type: ignore[reportMissingImports]  # noqa: E402
import facts  # type: ignore[reportMissingImports]  # noqa: E402
import tool_bridge as bridge  # type: ignore[reportMissingImports]  # noqa: E402

STUDENT = "20230001"
OTHER_STUDENT = "20230002"
TEACHER = "T002"
ADMIN = "T001"


def invoke(user, ability, mode="read", args=None):
    request = {"action": "invoke", "user": user, "ability": ability, "mode": mode}
    if args is not None:
        request["args"] = args
    return bridge.handle(request)


class TestIdentityAndCatalog(unittest.TestCase):
    def test_identity_is_resolved_and_scope_is_server_derived(self):
        for user, role, address in (
            (STUDENT, "STUDENT", "张伟同学"),
            (TEACHER, "TEACHER", "李老师"),
            (ADMIN, "ADMIN", "管理员王老师"),
        ):
            with self.subTest(user=user):
                result = bridge.handle({"action": "identity", "user": user})
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["identity"]["role"], role)
                self.assertEqual(result["identity"]["ref_id"], user)
                self.assertEqual(result["identity"]["address"], address)
                self.assertTrue(result["identity"]["scope_text"])
        self.assertIn("全校", bridge.handle({"action": "identity", "user": ADMIN})
                      ["identity"]["scope_text"])

    def test_missing_or_unknown_identity_cannot_access_catalog(self):
        for user in ("", "not-a-user", None, 123):
            with self.subTest(user=user):
                result = bridge.handle({"action": "catalog", "user": user})
                self.assertFalse(result["ok"])
                self.assertIn(result["code"], ("INVALID", "DENIED"))
                self.assertNotIn("catalog", result)

    def test_catalog_is_role_scoped_and_contains_schema(self):
        student = bridge.handle({"action": "catalog", "user": STUDENT})
        teacher = bridge.handle({"action": "catalog", "user": TEACHER})
        admin = bridge.handle({"action": "catalog", "user": ADMIN})
        self.assertTrue(all(r["ok"] for r in (student, teacher, admin)))
        student_names = {entry["name"] for entry in student["catalog"]}
        teacher_names = {entry["name"] for entry in teacher["catalog"]}
        admin_names = {entry["name"] for entry in admin["catalog"]}
        self.assertIn("my_credit", student_names)
        self.assertNotIn("student_courses_of", student_names)
        self.assertNotIn("add_student", student_names | teacher_names)
        self.assertIn("add_student", admin_names)
        add = next(entry for entry in admin["catalog"] if entry["name"] == "add_student")
        self.assertTrue(add["write"])
        self.assertEqual(add["roles"], ["ADMIN"])
        self.assertEqual(set(add["args"]), {"stu_id", "stu_name", "gender", "class_id"})
        self.assertTrue(add["doc"])
        for role, result in (("STUDENT", student), ("TEACHER", teacher), ("ADMIN", admin)):
            self.assertTrue(all(role in entry["roles"] for entry in result["catalog"]))


class TestAuthorizationAndFacts(unittest.TestCase):
    def test_denied_other_student_and_admin_data_without_fallback(self):
        for user, ability, args in (
            (STUDENT, "student_courses_of", {"stu_id": OTHER_STUDENT}),
            (TEACHER, "student_credit_of", {"stu_id": STUDENT}),
            (STUDENT, "total_students", {}),
        ):
            with self.subTest(user=user, ability=ability):
                result = invoke(user, ability, args=args)
                self.assertEqual(result["code"], "DENIED", result)
                self.assertTrue(result["alternatives"])
                self.assertNotIn("fact", result)

    def test_teacher_restricted_to_department_and_taught_courses(self):
        for ability, args in (
            ("count_students_by_dept", {"dept_name": "计算机科学系"}),
            ("count_students_by_class", {"class_id": "CS2301"}),
            ("course_avg", {"course_name": "高等数学"}),
            ("my_course_students", {"course_name": "高等数学"}),
        ):
            with self.subTest(ability=ability):
                denied = invoke(TEACHER, ability, args=args)
                self.assertEqual(denied["code"], "DENIED", denied)
        allowed = invoke(TEACHER, "my_course_students", args={"course_name": "数据库原理"})
        self.assertTrue(allowed["ok"], allowed)
        self.assertEqual(allowed["fact"]["course"], "数据库原理")
        self.assertTrue(allowed["fact"]["list"])

    def test_fact_values_match_database_and_text_is_deterministic(self):
        result = invoke(STUDENT, "my_credit")
        self.assertTrue(result["ok"], result)
        with dbcore.db() as connection:
            earned = connection.execute(
                "SELECT COALESCE(SUM(c.credit),0) FROM enroll e "
                "JOIN course c ON e.course_id=c.course_id "
                "WHERE e.stu_id=? AND e.score IS NOT NULL "
                "AND e.score >= (SELECT pass_line FROM v_domain_rule)",
                (STUDENT,),
            ).fetchone()[0]
        self.assertEqual(result["fact"]["earned"], earned)
        self.assertEqual(result["text"], facts.facts_text(result["fact"]["kind"],
                                                          result["fact"]))
        self.assertIn(STUDENT, result["text"])
        admin_read = invoke(ADMIN, "student_credit_of", args={"stu_id": OTHER_STUDENT})
        self.assertTrue(admin_read["ok"], admin_read)
        self.assertEqual(admin_read["fact"]["id"], OTHER_STUDENT)
        self.assertNotEqual(admin_read["fact"]["id"], STUDENT)

    def test_unknown_ability_and_missing_entity_have_structured_errors(self):
        missing_ability = invoke(STUDENT, "drop_database")
        self.assertEqual(missing_ability["code"], "NOT_FOUND")
        self.assertNotIn("add_student", missing_ability["alternatives"])
        missing_entity = invoke(ADMIN, "student_credit_of", args={"stu_id": "20997777"})
        self.assertEqual(missing_entity["code"], "NOT_FOUND")
        self.assertNotIn("fact", missing_entity)


class TestRequestValidation(unittest.TestCase):
    def test_bad_actions_and_extra_protocol_fields(self):
        for request in (None, [], 4, {}, {"action": "other", "user": ADMIN},
                        {"action": "identity", "user": ADMIN, "role": "ADMIN"},
                        {"action": "catalog", "user": ADMIN, "scope": {"all": True}}):
            with self.subTest(request=request):
                result = bridge.handle(request)
                self.assertEqual(result["code"], "INVALID", result)

    def test_mode_and_ability_validation(self):
        for request in (
            {"action": "invoke", "user": ADMIN, "ability": "total_students", "mode": "write"},
            {"action": "invoke", "user": ADMIN, "ability": "total_students", "mode": True},
            {"action": "invoke", "user": ADMIN, "ability": 123, "mode": "read"},
        ):
            with self.subTest(request=request):
                self.assertEqual(bridge.handle(request)["code"], "INVALID")
        self.assertTrue(bridge.handle({"action": "invoke", "user": ADMIN,
                                       "ability": "total_students"})["ok"])
        self.assertEqual(bridge.handle({"action": "invoke", "user": ADMIN,
                                        "ability": "add_student"})["code"], "INVALID")
        self.assertEqual(invoke(ADMIN, "total_students", "preview")["code"], "INVALID")
        self.assertEqual(invoke(ADMIN, "total_students", "execute")["code"], "INVALID")
        self.assertEqual(invoke(ADMIN, "add_student", "read")["code"], "INVALID")
        self.assertEqual(invoke(STUDENT, "add_student", "read")["code"], "DENIED")

    def test_args_reject_non_strings_unknown_and_injected_scope(self):
        for args in ([], "{}", None, {"stu_id": 20230001}, {"stu_id": True},
                     {"stu_id": STUDENT, "scope": "all"}, {"self_stu": OTHER_STUDENT}):
            with self.subTest(args=args):
                request = {"action": "invoke", "user": ADMIN, "ability": "student_credit_of",
                           "mode": "read", "args": args}
                self.assertEqual(bridge.handle(request)["code"], "INVALID")
        self.assertEqual(invoke(STUDENT, "my_credit", args={"stu_id": OTHER_STUDENT})
                         ["code"], "INVALID")

    def test_json_lines_stdout_stays_machine_readable(self):
        requests = ["{not json}\n", json.dumps({"action": "identity", "user": STUDENT}) + "\n",
                    json.dumps({"action": "invoke", "user": STUDENT,
                                "ability": "my_credit", "mode": "read"}) + "\n"]
        process = subprocess.run(
            [sys.executable, os.path.join(_common.AI_DIR, "tool_bridge.py")],
            input="".join(requests), text=True, encoding="utf-8",
            capture_output=True, env=os.environ.copy(), check=True,
        )
        lines = process.stdout.splitlines()
        self.assertEqual(len(lines), len(requests))
        parsed = [json.loads(line) for line in lines]
        self.assertEqual([result.get("code") for result in parsed], ["INVALID", None, None])
        self.assertEqual(parsed[1]["identity"]["ref_id"], STUDENT)
        self.assertEqual(parsed[2]["fact"]["id"], STUDENT)
        self.assertEqual(process.stderr, "")


class TestWrites(unittest.TestCase):
    STUDENT_ID = "20998888"
    ARGS = {"stu_id": STUDENT_ID, "stu_name": "桥接测试", "gender": "男", "class_id": "CS2301"}

    def tearDown(self):
        # Test-only reset of the temporary copy; production never reissues IDs.
        with dbcore.db() as connection:
            connection.execute("DELETE FROM enroll WHERE stu_id=?", (self.STUDENT_ID,))
            connection.execute("DELETE FROM student WHERE stu_id=?", (self.STUDENT_ID,))
            connection.execute("DELETE FROM issued_student_id WHERE stu_id=?", (self.STUDENT_ID,))

    def student_exists(self):
        with dbcore.db() as connection:
            return connection.execute("SELECT 1 FROM student WHERE stu_id=?",
                                      (self.STUDENT_ID,)).fetchone() is not None

    def test_preview_never_writes_and_execute_requires_write_ability(self):
        result = invoke(ADMIN, "add_student", "preview", dict(self.ARGS))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["fact"]["kind"], "write_preview")
        self.assertIn("数据库尚未改动", result["text"])
        self.assertFalse(self.student_exists())
        self.assertEqual(invoke(STUDENT, "add_student", "preview", dict(self.ARGS))
                         ["code"], "DENIED")
        self.assertEqual(invoke(STUDENT, "add_student", "execute", dict(self.ARGS))
                         ["code"], "DENIED")
        self.assertFalse(self.student_exists())

    def test_execute_add_then_delete_rechecks_identity_and_preserves_issued_id(self):
        preview = invoke(ADMIN, "add_student", "preview", dict(self.ARGS))
        self.assertTrue(preview["ok"], preview)
        added = invoke(ADMIN, "add_student", "execute", dict(self.ARGS))
        self.assertTrue(added["ok"], added)
        self.assertEqual(added["fact"]["kind"], "write_done")
        self.assertTrue(self.student_exists())
        self.assertEqual(bridge.handle({"action": "identity", "user": self.STUDENT_ID})
                         ["identity"]["role"], "STUDENT")
        delete_args = {"stu_id": self.STUDENT_ID}
        ready = invoke(ADMIN, "delete_student", "preview", delete_args)
        self.assertTrue(ready["ok"], ready)
        self.assertTrue(self.student_exists(), "delete preview must not write")
        deleted = invoke(ADMIN, "delete_student", "execute", delete_args)
        self.assertTrue(deleted["ok"], deleted)
        self.assertFalse(self.student_exists())
        self.assertEqual(bridge.handle({"action": "identity", "user": self.STUDENT_ID})
                         ["code"], "DENIED")
        with dbcore.db() as connection:
            self.assertIsNotNone(connection.execute(
                "SELECT 1 FROM issued_student_id WHERE stu_id=?", (self.STUDENT_ID,)
            ).fetchone())
        self.assertEqual(invoke(ADMIN, "add_student", "preview", dict(self.ARGS))
                         ["code"], "NOT_FOUND", "issued IDs must not be recycled")

    def test_invalid_write_args_leave_database_unchanged(self):
        for mode in ("preview", "execute"):
            with self.subTest(mode=mode):
                request = invoke(ADMIN, "add_student", mode,
                                 {**self.ARGS, "stu_name": {"spoof": "user"}})
                self.assertEqual(request["code"], "INVALID")
                self.assertFalse(self.student_exists())
        self.assertEqual(invoke(ADMIN, "add_student", "preview",
                                {**self.ARGS, "stu_id": "bad"})["code"], "NOT_FOUND")
        self.assertFalse(self.student_exists())


class TestAcademicRegressions(unittest.TestCase):
    """Carry forward SQL truth, authorization, and course-scope regressions."""

    def test_self_abilities_do_not_accept_an_identity_override(self):
        for ability in ("my_credit", "my_courses", "my_teaching_courses"):
            with self.subTest(ability=ability):
                schema = bridge.handle({"action": "catalog", "user": ADMIN if ability ==
                                        "my_teaching_courses" else STUDENT})["catalog"]
                args = next(item["args"] for item in schema if item["name"] == ability)
                self.assertNotIn("stu_id", args)
                self.assertNotIn("teacher_id", args)
        self.assertEqual(invoke(STUDENT, "my_credit", args={"stu_id": OTHER_STUDENT})
                         ["code"], "INVALID")

    def test_student_cannot_query_another_class_or_teacher_roster(self):
        self.assertEqual(invoke(STUDENT, "count_students_by_class",
                                args={"class_id": "MA2401"})["code"], "DENIED")
        self.assertEqual(invoke(STUDENT, "my_course_students",
                                args={"course_name": "数据库原理"})["code"], "DENIED")

    def test_department_population_matches_scoped_sql(self):
        own = invoke(STUDENT, "my_dept_students_count")
        self.assertTrue(own["ok"], own)
        dept = invoke(ADMIN, "count_students_by_dept",
                      args={"dept_name": "计算机科学系"})
        self.assertTrue(dept["ok"], dept)
        with dbcore.db() as connection:
            expected = connection.execute(
                "SELECT COUNT(*) FROM student s JOIN clazz cl ON s.class_id=cl.class_id "
                "WHERE cl.dept_id='D01'"
            ).fetchone()[0]
        self.assertEqual(own["fact"]["count"], expected)
        self.assertEqual(own["fact"]["mates"], expected - 1)
        self.assertEqual(dept["fact"]["count"], expected)

    def test_teacher_count_and_course_average_match_sql(self):
        teachers = invoke(ADMIN, "total_teachers")
        course = invoke(TEACHER, "course_avg", args={"course_name": "数据库原理"})
        self.assertTrue(teachers["ok"], teachers)
        self.assertTrue(course["ok"], course)
        with dbcore.db() as connection:
            teacher_count = connection.execute("SELECT COUNT(*) FROM teacher").fetchone()[0]
            average = connection.execute(
                "SELECT ROUND(AVG(score),2) FROM enroll e JOIN course c "
                "ON c.course_id=e.course_id WHERE c.course_name='数据库原理'"
            ).fetchone()[0]
        self.assertEqual(teachers["fact"]["count"], teacher_count)
        self.assertEqual(course["fact"]["avg"], average)

    def test_pass_line_is_database_derived_not_model_generated(self):
        with dbcore.db() as connection:
            expected = connection.execute("SELECT pass_line FROM v_domain_rule").fetchone()[0]
        failed = invoke(TEACHER, "course_fail", args={"course_name": "数据库原理"})
        self.assertTrue(failed["ok"], failed)
        self.assertEqual(failed["fact"]["pass_line"], expected)
        self.assertIn(str(int(expected)), failed["text"])
        self.assertNotIn("60.0", failed["text"])

    def test_teacher_failed_students_remain_in_own_courses(self):
        taught = invoke(TEACHER, "my_teaching_courses")
        failed = invoke(TEACHER, "my_failed_students")
        self.assertTrue(taught["ok"], taught)
        self.assertTrue(failed["ok"], failed)
        self.assertTrue(failed["fact"]["list"])
        own_courses = set(taught["fact"]["courses"])
        for student in failed["fact"]["list"]:
            self.assertIn(student["course"], own_courses)
            self.assertTrue(student["id"])
            self.assertLess(student["score"], failed["fact"]["pass_line"])

    def test_teacher_student_scores_require_target_and_own_course(self):
        own = invoke(TEACHER, "my_student_scores",
                     args={"stu_id": STUDENT, "course_name": "数据库原理"})
        self.assertTrue(own["ok"], own)
        self.assertEqual(len(own["fact"]["list"]), 1)
        self.assertEqual(own["fact"]["list"][0]["id"], STUDENT)
        self.assertEqual(invoke(TEACHER, "my_student_scores")["code"], "NOT_FOUND")
        self.assertEqual(invoke(TEACHER, "my_student_scores",
                                args={"stu_id": STUDENT, "course_name": "高等数学"})
                         ["code"], "NOT_FOUND")

    def test_course_summary_includes_all_components(self):
        summary = invoke(TEACHER, "my_courses_summary")
        self.assertTrue(summary["ok"], summary)
        self.assertTrue(summary["fact"]["list"])
        for course in summary["fact"]["list"]:
            self.assertGreaterEqual(course.keys(),
                                    {"course", "enrolled", "avg", "qualified", "fail", "pass_line"})
        with dbcore.db() as connection:
            count = connection.execute(
                "SELECT COUNT(*) FROM v_teacher_course v JOIN v_course_stat s "
                "ON s.course_id=v.course_id WHERE v.teacher_id=?", (TEACHER,)
            ).fetchone()[0]
        self.assertEqual(len(summary["fact"]["list"]), count)
        self.assertEqual(summary["text"], facts.facts_text("courses_summary", summary["fact"]))

    def test_missing_graduation_requirement_and_ungraded_average_are_explicit(self):
        credit = facts.facts_text("student_credit", {
            "kind": "student_credit", "address": "李四同学", "id": "X",
            "dept": "新建系", "earned": 0, "required": None,
            "gap": None, "enrolled": 0, "failed": 0,
        })
        self.assertIn("尚未设置", credit)
        self.assertNotIn("已修满", credit)
        average = facts.facts_text("course_avg", {
            "kind": "course_avg", "course": "某课", "count": 0,
            "avg": None, "pass_line": 60.0, "qualified": None,
        })
        self.assertIn("暂无成绩", average)
        self.assertNotIn("60.0", facts.facts_text("course_fail", {
            "kind": "course_fail", "course": "某课", "pass_line": 60.0, "fail": 0,
        }))


class TestWriteAndSchemaRegressions(unittest.TestCase):
    """Preserve original immutable-ID and SQLite backstop checks on a copy."""

    def test_all_write_abilities_have_non_mutating_previews(self):
        for ability in bridge.dl.CATALOG.values():
            if ability.write:
                self.assertIsNotNone(ability.preview, ability.name)
        preview = invoke(ADMIN, "delete_student", "preview", {"stu_id": STUDENT})
        self.assertTrue(preview["ok"], preview)
        self.assertIn("选课", preview["fact"]["warning"])
        self.assertEqual(bridge.handle({"action": "identity", "user": STUDENT})
                         ["identity"]["role"], "STUDENT")

    def test_preview_missing_fields_and_bad_class_report_not_found(self):
        missing = invoke(ADMIN, "add_student", "preview", {"stu_id": "20997777"})
        self.assertEqual(missing["code"], "NOT_FOUND")
        self.assertIn("姓名", missing["error"])
        bad_class = invoke(ADMIN, "add_student", "execute", {
            "stu_id": "20997777", "stu_name": "测试", "gender": "男", "class_id": "NO_SUCH_CLASS",
        })
        self.assertEqual(bad_class["code"], "NOT_FOUND")
        self.assertEqual(bridge.handle({"action": "identity", "user": "20997777"})
                         ["code"], "DENIED")

    def test_student_id_formats_and_issued_ledger(self):
        with dbcore.db() as connection:
            students = connection.execute("SELECT COUNT(*) FROM student").fetchone()[0]
            issued = connection.execute("SELECT COUNT(*) FROM issued_student_id").fetchone()[0]
            missing = connection.execute(
                "SELECT COUNT(*) FROM student s WHERE NOT EXISTS "
                "(SELECT 1 FROM issued_student_id i WHERE i.stu_id=s.stu_id)"
            ).fetchone()[0]
        self.assertEqual(missing, 0)
        self.assertGreaterEqual(issued, students)
        for invalid in ("666666", "abcdefgh", "2023000a", "202300012", ""):
            with self.subTest(id=invalid):
                response = invoke(ADMIN, "add_student", "preview", {
                    "stu_id": invalid, "stu_name": "测试", "gender": "男", "class_id": "CS2301",
                })
                self.assertEqual(response["code"], "NOT_FOUND")
        valid = invoke(ADMIN, "add_student", "preview", {
            "stu_id": "20998888", "stu_name": "测试", "gender": "男", "class_id": "CS2301",
        })
        self.assertTrue(valid["ok"], valid)

    def test_teacher_cannot_delete_any_student(self):
        self.assertEqual(invoke(TEACHER, "delete_student", "preview",
                                {"stu_id": OTHER_STUDENT})["code"], "DENIED")
        self.assertEqual(invoke(TEACHER, "delete_student", "execute",
                                {"stu_id": OTHER_STUDENT})["code"], "DENIED")

    def test_database_enforces_student_id_check(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dbcore.db() as connection:
                connection.execute(
                    "INSERT INTO student(stu_id,stu_name,gender,class_id) "
                    "VALUES('666666','乱来','男','CS2301')"
                )

    def test_database_enforces_foreign_keys(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dbcore.db() as connection:
                connection.execute(
                    "INSERT INTO enroll(stu_id,course_id,score) VALUES('NO_SUCH','C001',50)"
                )

    def test_database_enforces_score_range(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dbcore.db() as connection:
                connection.execute(
                    "INSERT INTO enroll(stu_id,course_id,score) VALUES(?, 'C003', 999)",
                    (STUDENT,),
                )

    def test_database_enforces_unique_course_name(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with dbcore.db() as connection:
                connection.execute(
                    "INSERT INTO course(course_id,course_name,credit) "
                    "VALUES('C999','软件工程',3)"
                )


class TestBackstageSchema(unittest.TestCase):
    """后台结构快照：仅管理员可见、只读、与数据库逐项一致。"""

    def test_schema_snapshot_is_admin_only(self):
        for user in (STUDENT, TEACHER):
            with self.subTest(user=user):
                result = bridge.handle({"action": "schema", "user": user})
                self.assertFalse(result["ok"])
                self.assertEqual(result["code"], "DENIED")
                self.assertNotIn("schema", result)
        self.assertEqual(bridge.handle({"action": "schema", "user": "nobody"})["code"], "DENIED")
        extra = bridge.handle({"action": "schema", "user": ADMIN, "sql": "SELECT 1"})
        self.assertEqual(extra["code"], "INVALID")

    def test_schema_snapshot_matches_database(self):
        result = bridge.handle({"action": "schema", "user": ADMIN})
        self.assertTrue(result["ok"], result)
        snap = result["schema"]
        json.dumps(snap, ensure_ascii=False)  # must survive the JSON-lines boundary
        objs = {o["name"]: o for o in snap["objects"]}
        with sqlite3.connect(dbcore.DB_PATH) as c:
            names = [r[0] for r in c.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table','view') "
                "AND name NOT LIKE 'sqlite_%'")]
            self.assertCountEqual(objs, names)
            for name in names:
                self.assertEqual(objs[name]["row_count"],
                                 c.execute('SELECT COUNT(*) FROM "%s"' % name).fetchone()[0], name)
                self.assertEqual(len(objs[name]["rows"]), objs[name]["row_count"], name)
            page_count = c.execute("PRAGMA page_count").fetchone()[0]
        enroll = objs["enroll"]
        self.assertEqual([col["name"] for col in enroll["columns"] if col["pk"]], ["stu_id", "course_id"])
        self.assertCountEqual([(fk["from"], fk["table"]) for fk in enroll["fks"]],
                              [("stu_id", "student"), ("course_id", "course")])
        self.assertIn("score IS NULL OR (score >= 0 AND score <= 100)",
                      [chk for col in enroll["columns"] for chk in col["checks"]])
        self.assertIn("函数依赖", enroll["note"])
        self.assertIn("v_domain_rule", objs["v_course_stat"]["deps"])
        self.assertEqual(snap["integrity"], {"check": ["ok"], "fk_violations": 0})
        # every page of the file is attributed, and table leaf cells add up to the row counts
        pages = snap["pages"]
        self.assertEqual([p["no"] for p in pages], list(range(1, page_count + 1)))
        self.assertFalse([p for p in pages if p["kind"] == "unknown"])
        for name in ("student", "enroll", "course"):
            leaf_cells = sum(p["cells"] for p in pages if p["owner"] == name and p["kind"] == "leaf")
            self.assertEqual(leaf_cells, objs[name]["row_count"], name)

    def test_schema_snapshot_cannot_write(self):
        import introspect  # type: ignore[reportMissingImports]
        with dbcore.db_readonly() as c:
            with self.assertRaises(sqlite3.OperationalError):
                c.execute("DELETE FROM enroll")
        before = os.path.getmtime(dbcore.DB_PATH)
        introspect.snapshot()
        self.assertEqual(os.path.getmtime(dbcore.DB_PATH), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
