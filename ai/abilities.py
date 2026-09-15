#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 能力目录 (abilities.py)
==================================
**白名单能力**的唯一定义处。每个能力都自带**强制作用域**：

  * 身份类参数一律不由调用方提供，而是取自会话身份（scope）
  * 实体类参数（系名/课程名/班号/学号）必须落在作用域内，越界即拒绝
  * 写操作（write=True）必须同时提供 `preview`：只校验、不落库

供 `data_layer.execute()` / `data_layer.preview()` 按名调用。
"""

from dbcore import db, pass_line, Denied, NotFound, address_of


# ----------------------------------------------------------------------
# 能力目录（白名单）
# ----------------------------------------------------------------------
class Ability:
    """一个受控能力：名称、允许角色、参数说明、执行体。

    deny_hint / deny_alternatives 用于角色不足时给出**具体、可替代**的温和拒绝，
    而不是一句笼统的"仅 ADMIN 可用"。

    写操作（write=True）必须同时提供 `preview`：它只做**校验并生成待确认概要**，
    **不写库**；真正落库要等用户确认后再调用 `fn`。
    """

    def __init__(self, name, roles, args, doc, fn, write=False, preview=None,
                 deny_hint=None, deny_alternatives=None):
        self.name = name
        self.roles = roles          # 允许的角色集合
        self.args = args            # {参数名: 说明}，空表示无参
        self.doc = doc              # 给规划器看的中文说明
        self.fn = fn                # 执行体（写操作=确认后的落库动作）
        self.write = write          # 是否为写操作（需二次确认）
        self.preview = preview      # 写操作的预览/校验函数
        self.deny_hint = deny_hint
        self.deny_alternatives = deny_alternatives


CATALOG = {}


def _ability(name, roles, args, doc, write=False, preview=None,
             deny_hint=None, deny_alternatives=None):
    def deco(fn):
        CATALOG[name] = Ability(name, roles, args, doc, fn, write, preview,
                                deny_hint, deny_alternatives)
        return fn
    return deco


# ---------- 学生 ----------
@_ability("my_credit", ("STUDENT",), {}, "查询我自己的已修学分与毕业差距")
def _my_credit(scope, args):
    with db() as c:
        r = c.execute(
            "SELECT stu_name, dept_name, earned_credit, required_credit, "
            "enrolled_count, failed_count FROM v_student_credit WHERE stu_id=?",
            (scope["self_stu"],)).fetchone()
    if not r:
        raise NotFound("未找到您的学业记录")
    earned, required = r[2], r[3]
    return {"kind": "student_credit", "name": r[0], "address": address_of("STUDENT", r[0]),
            "id": scope["self_stu"], "dept": r[1],
            "earned": earned, "required": required,
            "gap": None if required is None else max(0, required - earned),
            "enrolled": r[4], "failed": r[5]}


@_ability("my_courses", ("STUDENT",), {}, "查询我自己选修的课程与成绩")
def _my_courses(scope, args):
    with db() as c:
        rows = c.execute(
            "SELECT c.course_id, c.course_name, c.credit, e.score FROM enroll e "
            "JOIN course c ON c.course_id=e.course_id WHERE e.stu_id=? "
            "ORDER BY c.course_id", (scope["self_stu"],)).fetchall()
    return {"kind": "my_course_list", "name": scope["display"],
            "address": scope["address"],
            "courses": [{"id": r[0], "name": r[1], "credit": r[2], "score": r[3]} for r in rows]}


# ---------- 指定学生的学业数据（角色限 ADMIN；他人调用将被显式拒绝）----------
# 说明：把"查别人"的能力也纳入目录，是为了让这类意图有处安放——
# 规划器能识别出来，执行器再按角色**明确拒绝**，而不是静默退回"查自己"。
@_ability("student_credit_of", ("ADMIN",), {"stu_id": "学号"},
          "查询指定学号学生的已修学分与毕业情况",
          deny_hint={
              "STUDENT": "您只能查看本人的学业数据，无法查看其他同学的",
              "TEACHER": "学生的个人学业数据不对教师开放（仅管理员可查）",
          },
          deny_alternatives={
              "STUDENT": ["查询我自己的学分与毕业差距", "查询我自己的选课与成绩"],
              "TEACHER": ["查询本院学生人数", "查询您所授课程的情况"],
          })
def _student_credit_of(scope, args):
    sid = (args.get("stu_id") or "").strip()
    if not sid:
        raise NotFound("请告诉我要查询的学号")
    with db() as c:
        r = c.execute("SELECT stu_name, dept_name, earned_credit, required_credit, "
                      "enrolled_count, failed_count FROM v_student_credit WHERE stu_id=?",
                      (sid,)).fetchone()
    if not r:
        raise NotFound("没有找到学号 %s" % sid)
    earned, required = r[2], r[3]
    return {"kind": "student_credit", "name": r[0], "address": address_of("STUDENT", r[0]),
            "id": sid, "dept": r[1],
            "earned": earned, "required": required,
            "gap": None if required is None else max(0, required - earned),
            "enrolled": r[4], "failed": r[5]}


@_ability("student_courses_of", ("ADMIN",), {"stu_id": "学号"},
          "查询指定学号学生的选课与成绩",
          deny_hint={
              "STUDENT": "您只能查看本人的选课与成绩，无法查看其他同学的",
              "TEACHER": "学生的个人选课与成绩明细不对教师开放（仅管理员可查）",
          },
          deny_alternatives={
              "STUDENT": ["查询我自己选修的课程与成绩"],
              "TEACHER": ["查询本院学生人数", "查询您所授课程的均分或不及格人数"],
          })
def _student_courses_of(scope, args):
    sid = (args.get("stu_id") or "").strip()
    if not sid:
        raise NotFound("请告诉我要查询的学号")
    with db() as c:
        r = c.execute("SELECT stu_name FROM student WHERE stu_id=?", (sid,)).fetchone()
        if not r:
            raise NotFound("没有找到学号 %s" % sid)
        rows = c.execute(
            "SELECT c.course_id, c.course_name, c.credit, e.score FROM enroll e "
            "JOIN course c ON c.course_id=e.course_id WHERE e.stu_id=? "
            "ORDER BY c.course_id", (sid,)).fetchall()
    return {"kind": "my_course_list", "name": "%s（%s）" % (r[0], sid),
            "address": address_of("STUDENT", r[0]),
            "courses": [{"id": x[0], "name": x[1], "credit": x[2], "score": x[3]}
                        for x in rows]}


# ---------- 学生 / 教师 共用 ----------
@_ability("my_dept_students_count", ("STUDENT", "TEACHER", "ADMIN"), {},
          "查询我所在系（本院）的学生人数")
def _my_dept_students_count(scope, args):
    if not scope["dept_id"]:
        raise NotFound("未找到您所属的系")
    with db() as c:
        n = c.execute("SELECT COUNT(*) FROM student s JOIN clazz cl "
                      "ON cl.class_id=s.class_id WHERE cl.dept_id=?",
                      (scope["dept_id"],)).fetchone()[0]
    mates = max(0, n - 1) if scope["role"] == "STUDENT" else None
    return {"kind": "my_dept_students", "name": scope["display"],
            "address": scope["address"], "dept": scope["dept_name"],
            "count": n, "mates": mates}


# ---------- 教师 ----------
@_ability("my_teaching_courses", ("TEACHER", "ADMIN"), {}, "列出我自己所授的课程")
def _my_teaching_courses(scope, args):
    with db() as c:
        rows = c.execute("SELECT course_name FROM v_teacher_course "
                         "WHERE teacher_id=? ORDER BY course_id",
                         (scope["self_teacher"],)).fetchall()
    return {"kind": "my_courses", "name": scope["display"], "address": scope["address"],
            "courses": [r[0] for r in rows]}


def _require_own_course(scope, course):
    """权限判据：该课程必须出现在"本人授课"视图中。"""
    with db() as c:
        r = c.execute("SELECT course_id, course_name FROM v_teacher_course "
                      "WHERE teacher_id=? AND course_name=?",
                      (scope["self_teacher"], course)).fetchone()
    if not r:
        raise Denied("OUT_OF_SCOPE",
                     "您未教授课程「%s」" % course,
                     ["查询我教的课程", "查询本人所授课程的均分或不及格人数"])
    return r


@_ability("course_avg", ("TEACHER", "ADMIN"), {"course_name": "课程名称"},
          "查询我所授某门课程的考试平均分及是否达标")
def _course_avg(scope, args):
    course = (args.get("course_name") or "").strip()
    if not course:
        raise NotFound("请告诉我课程名称")
    cid, cname = _require_own_course(scope, course)
    with db() as c:
        st = c.execute("SELECT enrolled_count, avg_score, pass_line, avg_qualified "
                       "FROM v_course_stat WHERE course_id=?", (cid,)).fetchone()
    return {"kind": "course_avg", "name": scope["display"], "address": scope["address"],
            "course": cname,
            "count": (st[0] or 0) if st else 0,
            "avg": st[1] if st else None,
            "pass_line": st[2] if st else pass_line(),
            "qualified": bool(st[3]) if (st and st[3] is not None) else None}


@_ability("course_fail", ("TEACHER", "ADMIN"), {"course_name": "课程名称"},
          "查询我所授某门课程的不及格人数")
def _course_fail(scope, args):
    course = (args.get("course_name") or "").strip()
    if not course:
        raise NotFound("请告诉我课程名称")
    cid, cname = _require_own_course(scope, course)
    with db() as c:
        st = c.execute("SELECT fail_count FROM v_course_stat WHERE course_id=?",
                       (cid,)).fetchone()
    return {"kind": "course_fail", "name": scope["display"], "address": scope["address"],
            "course": cname,
            "fail": (st[0] or 0) if st else 0, "pass_line": pass_line()}


@_ability("my_courses_summary", ("TEACHER", "ADMIN"), {},
          "列出我所授每门课程的选课人数、平均分与不及格人数（未指明具体课程时用）")
def _my_courses_summary(scope, args):
    with db() as c:
        rows = c.execute(
            "SELECT v.course_name, s.enrolled_count, s.avg_score, s.avg_qualified, "
            "s.fail_count, s.pass_line FROM v_teacher_course v "
            "JOIN v_course_stat s ON s.course_id = v.course_id "
            "WHERE v.teacher_id=? ORDER BY v.course_id",
            (scope["self_teacher"],)).fetchall()
    return {"kind": "courses_summary", "name": scope["display"],
            "address": scope["address"],
            "list": [{"course": r[0], "enrolled": r[1] or 0, "avg": r[2],
                      "qualified": (None if r[3] is None else bool(r[3])),
                      "fail": r[4] or 0, "pass_line": r[5]} for r in rows]}


# ---------- 教师查看"本人所授课程"的学生明细 ----------
# 业务依据：现实中老师对本课程的学生名单与本课成绩是可见的（教学必需）；
# 但看不到学生的其它课程成绩、总学分/毕业进度，以及非本人授课的学生。
@_ability("my_course_students", ("TEACHER", "ADMIN"), {"course_name": "课程名称"},
          "列出我所授某门课程的选课学生名单及该课成绩")
def _my_course_students(scope, args):
    course = (args.get("course_name") or "").strip()
    if not course:
        raise NotFound("请告诉我课程名称")
    cid, cname = _require_own_course(scope, course)
    with db() as c:
        rows = c.execute(
            "SELECT s.stu_id, s.stu_name, e.score FROM enroll e "
            "JOIN student s ON s.stu_id = e.stu_id "
            "WHERE e.course_id = ? ORDER BY s.stu_id", (cid,)).fetchall()
    return {"kind": "course_students", "address": scope["address"], "course": cname,
            "pass_line": pass_line(),
            "list": [{"id": r[0], "name": r[1], "score": r[2]} for r in rows]}


@_ability("my_failed_students", ("TEACHER", "ADMIN"),
          {"course_name": "课程名称（可省略；省略则列出我教的全部课程）"},
          "列出我所授课程中不及格的学生姓名与分数")
def _my_failed_students(scope, args):
    course = (args.get("course_name") or "").strip()
    cid, cname = (None, None)
    if course:
        cid, cname = _require_own_course(scope, course)
    base = ("SELECT c.course_name, s.stu_id, s.stu_name, e.score "
            "FROM enroll e "
            "JOIN student s ON s.stu_id = e.stu_id "
            "JOIN course c  ON c.course_id = e.course_id ")
    cond = ("WHERE e.score IS NOT NULL AND e.score < "
            "(SELECT pass_line FROM v_domain_rule) ")
    with db() as c:
        if cid:
            rows = c.execute(base + cond + "AND e.course_id = ? ORDER BY e.score",
                             (cid,)).fetchall()
        else:
            rows = c.execute(
                base + "JOIN teaching te ON te.course_id = c.course_id " + cond
                + "AND te.teacher_id = ? ORDER BY c.course_id, e.score",
                (scope["self_teacher"],)).fetchall()
    return {"kind": "failed_students", "address": scope["address"],
            "course": cname, "pass_line": pass_line(),
            "list": [{"course": r[0], "id": r[1], "name": r[2], "score": r[3]}
                     for r in rows]}


@_ability("my_student_scores", ("TEACHER", "ADMIN"),
          {"stu_id": "学号（可选）", "stu_name": "姓名（可选）",
           "course_name": "课程名称（可选）"},
          "查询某个学生在我所授课程中的成绩（可指定课程）")
def _my_student_scores(scope, args):
    """作用域：整条查询锚定在 `teaching.teacher_id = 本人` 上，
    因此即便调用方传入任意学号，也只能取到"本人所授课程"内的成绩。"""
    sid = (args.get("stu_id") or "").strip()
    sname = (args.get("stu_name") or "").strip()
    course = (args.get("course_name") or "").strip()
    if not (sid or sname):
        raise NotFound("请告诉我要查询的学生的学号或姓名")
    sql = ("SELECT c.course_name, s.stu_id, s.stu_name, e.score "
           "FROM teaching te "
           "JOIN course c  ON c.course_id = te.course_id "
           "JOIN enroll e  ON e.course_id = c.course_id "
           "JOIN student s ON s.stu_id = e.stu_id "
           "WHERE te.teacher_id = ? ")
    params = [scope["self_teacher"]]
    if sid:
        sql += "AND s.stu_id = ? "
        params.append(sid)
    if sname:
        sql += "AND s.stu_name = ? "
        params.append(sname)
    if course:
        sql += "AND c.course_name = ? "
        params.append(course)
    sql += "ORDER BY c.course_id, s.stu_id"
    with db() as c:
        rows = c.execute(sql, tuple(params)).fetchall()
    if not rows:
        raise NotFound("在您所授课程中没有找到该学生的成绩记录")
    return {"kind": "student_scores", "address": scope["address"],
            "list": [{"course": r[0], "id": r[1], "name": r[2], "score": r[3]}
                     for r in rows]}


# ---------- 按系 / 按班统计（带参数，需作用域校验）----------
@_ability("count_students_by_dept", ("TEACHER", "ADMIN"), {"dept_name": "系名"},
          "查询某个系的学生人数")
def _count_students_by_dept(scope, args):
    dept = (args.get("dept_name") or "").strip()
    if not dept:
        raise NotFound("请告诉我系名")
    if not scope["all"] and dept != scope["dept_name"]:
        # 教师越界：明确拒绝，并给出作用域内的替代
        raise Denied("OUT_OF_SCOPE",
                     "您只能查询本院（%s）的数据" % (scope["dept_name"] or "未知"),
                     ["查询本院学生人数", "查询本人所授课程的情况"])
    with db() as c:
        r = c.execute("SELECT dept_id, dept_name FROM department WHERE dept_name=?",
                      (dept,)).fetchone()
        if not r:
            raise NotFound("没有找到名为「%s」的系" % dept)
        n = c.execute("SELECT COUNT(*) FROM student s JOIN clazz cl "
                      "ON cl.class_id=s.class_id WHERE cl.dept_id=?", (r[0],)).fetchone()[0]
    return {"kind": "dept_students", "name": scope["display"], "address": scope["address"],
            "dept": r[1], "count": n}


@_ability("count_students_by_class", ("STUDENT", "TEACHER", "ADMIN"),
          {"class_id": "班号，如 CS2301"}, "查询某个班级的学生人数")
def _count_students_by_class(scope, args):
    cid = (args.get("class_id") or "").strip().upper()
    if not cid:
        raise NotFound("请告诉我班号")
    with db() as c:
        r = c.execute("SELECT class_id, class_name, dept_id FROM clazz WHERE class_id=?",
                      (cid,)).fetchone()
    if not r:
        raise NotFound("没有找到班号「%s」" % cid)
    # 作用域校验：学生仅限本班；教师仅限本院；管理员不限
    if scope["role"] == "STUDENT":
        with db() as c:
            own = c.execute("SELECT class_id FROM student WHERE stu_id=?",
                            (scope["self_stu"],)).fetchone()[0]
        if cid != own:
            raise Denied("OUT_OF_SCOPE", "您只能查询自己所在班级（%s）" % own,
                         ["查询本班人数"])
    elif scope["role"] == "TEACHER" and r[2] != scope["dept_id"]:
        raise Denied("OUT_OF_SCOPE", "您只能查询本院班级",
                     ["查询本院学生人数"])
    with db() as c:
        n = c.execute("SELECT COUNT(*) FROM student WHERE class_id=?", (cid,)).fetchone()[0]
    return {"kind": "class_students", "name": scope["display"], "address": scope["address"],
            "dept": r[1], "count": n}


# ---------- 管理员 ----------
def _require_admin(scope):
    if not scope["all"]:
        raise Denied("ROLE_NOT_ALLOWED", "该查询仅管理员可用",
                     ["查询本人相关的数据"])


@_ability("total_students", ("ADMIN",), {}, "查询全校在籍学生总数")
def _total_students(scope, args):
    _require_admin(scope)
    with db() as c:
        n = c.execute("SELECT COUNT(*) FROM student").fetchone()[0]
    return {"kind": "total_students", "count": n}


@_ability("total_teachers", ("ADMIN",), {}, "查询全校教师总数")
def _total_teachers(scope, args):
    _require_admin(scope)
    with db() as c:
        n = c.execute("SELECT COUNT(*) FROM teacher").fetchone()[0]
    return {"kind": "total_teachers", "count": n}


@_ability("students_by_dept", ("ADMIN",), {}, "按系列出各系学生人数")
def _students_by_dept(scope, args):
    _require_admin(scope)
    with db() as c:
        rows = c.execute(
            "SELECT d.dept_name, COUNT(s.stu_id) FROM department d "
            "LEFT JOIN clazz cl ON cl.dept_id=d.dept_id "
            "LEFT JOIN student s ON s.class_id=cl.class_id "
            "GROUP BY d.dept_id ORDER BY d.dept_id").fetchall()
    return {"kind": "students_by_dept",
            "list": [{"dept": r[0], "count": r[1]} for r in rows]}


@_ability("list_students", ("ADMIN",), {}, "列出全部在籍学生名单",
          deny_hint={
              "STUDENT": "全校学生名单仅管理员可以查看",
              "TEACHER": "全校学生名单仅管理员可以查看；不过您所授课程的学生名单，我可以帮您查",
          },
          deny_alternatives={
              "STUDENT": ["查询本系同学人数"],
              "TEACHER": ["查询您所授某门课程的学生名单", "查询您所授课程中不及格的学生"],
          })
def _list_students(scope, args):
    _require_admin(scope)
    with db() as c:
        rows = c.execute("SELECT stu_id, stu_name, gender, class_id FROM student "
                         "ORDER BY stu_id").fetchall()
    return {"kind": "list_students",
            "list": ["%s %s（%s，%s）" % (r[0], r[1], r[2] or "?", r[3]) for r in rows]}


@_ability("list_teachers", ("ADMIN",), {}, "列出全部教师名单")
def _list_teachers(scope, args):
    _require_admin(scope)
    with db() as c:
        rows = c.execute("SELECT t.teacher_id, t.teacher_name, d.dept_name FROM teacher t "
                         "JOIN department d ON d.dept_id=t.dept_id "
                         "ORDER BY t.teacher_id").fetchall()
    return {"kind": "list_teachers",
            "list": ["%s %s（%s）" % (r[0], r[1], r[2]) for r in rows]}


# ---------- 受控写入（仅管理员；须"预览 → 确认 → 落库"两步）----------
def _sid_format_ok(sid):
    """学号形式校验：8 位数字（业务编号规则）。"""
    return len(sid) == 8 and all(ch in "0123456789" for ch in sid)


def _norm_add(args):
    """规整并校验新增学籍的四个字段，返回 (sid, name, gender, klass)。"""
    sid = (args.get("stu_id") or "").strip()
    name = (args.get("stu_name") or "").strip()
    gender = (args.get("gender") or "").strip()
    klass = (args.get("class_id") or "").strip().upper()
    if not (sid and name and gender and klass):
        missing = [k for k, v in (("学号", sid), ("姓名", name),
                                  ("性别", gender), ("班号", klass)) if not v]
        raise NotFound("新增学籍还缺：%s" % "、".join(missing))
    if not _sid_format_ok(sid):
        raise NotFound("学号应为 8 位数字（例如 20240001），请核对")
    return sid, name, gender, klass


def _check_sid_available(c, sid):
    """学号可用性：必须【从未发放过】。

    学号只增不复用——已删除学生的学号永久占用，否则外部档案会张冠李戴。
    """
    if c.execute("SELECT 1 FROM issued_student_id WHERE stu_id=?", (sid,)).fetchone():
        raise NotFound("学号 %s 曾经发放过。学号不予复用（避免与历史档案冲突），"
                       "请换一个新学号" % sid)
    if c.execute("SELECT 1 FROM student WHERE stu_id=?", (sid,)).fetchone():
        raise NotFound("学号 %s 已存在" % sid)


def _preview_add_student(scope, args):
    """预览：只校验，不写库。"""
    sid, name, gender, klass = _norm_add(args)
    with db() as c:
        row = c.execute("SELECT class_name FROM clazz WHERE class_id=?",
                        (klass,)).fetchone()
        if not row:
            raise NotFound("班级 %s 不存在" % klass)
        _check_sid_available(c, sid)
    return {"kind": "write_preview", "ability": "add_student", "action": "新增学籍",
            "args": args,
            "fields": [("学号", sid), ("姓名", name), ("性别", gender),
                       ("班号", "%s（%s）" % (klass, row[0]))],
            "warning": ""}


def _preview_delete_student(scope, args):
    """预览：只校验，不写库；并提示将被连带删除的选课记录数。"""
    sid = (args.get("stu_id") or "").strip()
    if not sid:
        raise NotFound("请告诉我要删除的学号")
    with db() as c:
        row = c.execute("SELECT stu_name, class_id FROM student WHERE stu_id=?",
                        (sid,)).fetchone()
        if not row:
            raise NotFound("学号 %s 不存在" % sid)
        n = c.execute("SELECT COUNT(*) FROM enroll WHERE stu_id=?", (sid,)).fetchone()[0]
    warn = "将同时删除该生的 %d 条选课/成绩记录，且无法撤销" % n if n else ""
    return {"kind": "write_preview", "ability": "delete_student", "action": "删除学籍",
            "args": args,
            "fields": [("学号", sid), ("姓名", row[0]), ("所在班号", row[1]),
                       ("学号去向", "永久占用，不再发放给他人")],
            "warning": warn}


@_ability("add_student", ("ADMIN",),
          {"stu_id": "学号(8位数字)", "stu_name": "姓名",
           "gender": "性别(男/女)", "class_id": "班号"},
          "新增一名学生的学籍", write=True, preview=_preview_add_student)
def _add_student(scope, args):
    _require_admin(scope)
    sid, name, gender, klass = _norm_add(args)
    # 同一事务内：写学生 + 记台账（任一失败则整体回滚）
    with db() as c:
        if not c.execute("SELECT 1 FROM clazz WHERE class_id=?", (klass,)).fetchone():
            raise NotFound("班级 %s 不存在" % klass)
        _check_sid_available(c, sid)
        c.execute("INSERT INTO student(stu_id,stu_name,gender,class_id) VALUES(?,?,?,?)",
                  (sid, name, gender, klass))
        c.execute("INSERT INTO issued_student_id(stu_id) VALUES(?)", (sid,))
    return {"kind": "write_done", "action": "新增学籍",
            "text": "已新增学生 %s（%s，%s，%s）" % (sid, name, gender, klass)}


@_ability("delete_student", ("ADMIN",), {"stu_id": "学号"}, "删除一名学生的学籍",
          write=True, preview=_preview_delete_student)
def _delete_student(scope, args):
    """删除学籍。注意：**不删除学号台账**——学号永久占用，不予复用。"""
    _require_admin(scope)
    sid = (args.get("stu_id") or "").strip()
    if not sid:
        raise NotFound("请告诉我要删除的学号")
    with db() as c:
        if not c.execute("SELECT 1 FROM student WHERE stu_id=?", (sid,)).fetchone():
            raise NotFound("学号 %s 不存在" % sid)
        # 先清理其选课记录再删学生（同一连接内为事务）
        c.execute("DELETE FROM enroll WHERE stu_id=?", (sid,))
        c.execute("DELETE FROM student WHERE stu_id=?", (sid,))
    return {"kind": "write_done", "action": "删除学籍",
            "text": "已删除学号 %s，其登录身份随之失效（该学号不再发放给他人）" % sid}
