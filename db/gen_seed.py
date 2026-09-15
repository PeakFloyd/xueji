#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · 演示数据生成器 (gen_seed.py)
=====================================
确定性生成规模合理、数值真实的演示数据，输出同目录下 seed_data.sql。

规模：3 系 / 10 班 / 50 学生 / 18 课程 / 12 教师 / 约 350 条选课。
特点：
  * 确定性：固定随机种子，重复运行结果一致。
  * 数值真实：约 15% 不及格（<60）；部分学生修满毕业学分（gap=0），部分明显不足。
  * 保留演示主键：学生 20230001、教师 T001/T002/T003（T002 必授「数据库原理」）。

用法： python gen_seed.py   ->  生成 seed_data.sql（可用 init_db.py 应用）
"""
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "seed_data.sql")
PASS_LINE = 60

# ----------------------------------------------------------------------
# 基础数据
# ----------------------------------------------------------------------
DEPARTMENTS = [
    ("D01", "计算机科学系"),
    ("D02", "软件工程系"),
    ("D03", "数学系"),
]

# (班号, 班名, 系号)
CLASSES = [
    ("CS2301", "计算机2301班", "D01"),
    ("CS2302", "计算机2302班", "D01"),
    ("CS2303", "计算机2303班", "D01"),
    ("CS2304", "计算机2304班", "D01"),
    ("SE2201", "软工2201班", "D02"),
    ("SE2202", "软工2202班", "D02"),
    ("SE2203", "软工2203班", "D02"),
    ("MA2401", "数学2401班", "D03"),
    ("MA2402", "数学2402班", "D03"),
    ("MA2403", "数学2403班", "D03"),
]
CLASS_DEPT = {c[0]: c[2] for c in CLASSES}

# (课程号, 课程名, 学分)
COURSES = [
    ("C001", "软件工程", 3),
    ("C002", "数据结构", 4),
    ("C003", "高等数学", 5),
    ("C004", "数据库原理", 3),
    ("C005", "Java程序设计", 4),
    ("C006", "计算机网络", 3),
    ("C007", "操作系统", 4),
    ("C008", "计算机组成原理", 4),
    ("C009", "离散数学", 3),
    ("C010", "软件测试", 3),
    ("C011", "需求工程", 3),
    ("C012", "软件项目管理", 3),
    ("C013", "线性代数", 4),
    ("C014", "概率论与数理统计", 4),
    ("C015", "数学分析", 5),
    ("C016", "大学英语", 3),
    ("C017", "程序设计基础", 3),
    ("C018", "人机交互", 2),
]
CREDIT = {c[0]: c[2] for c in COURSES}

# (教师号, 姓名, 所属系) —— T001 为管理员(本身是老师)
TEACHERS = [
    ("T001", "王建国", "D01"),
    ("T002", "李文静", "D02"),
    ("T003", "张明远", "D03"),
    ("T004", "陈国华", "D01"),
    ("T005", "刘志强", "D01"),
    ("T006", "杨慧敏", "D01"),
    ("T007", "黄文博", "D02"),
    ("T008", "周雅琴", "D02"),
    ("T009", "吴建华", "D03"),
    ("T010", "徐丽娟", "D03"),
    ("T011", "马俊杰", "D01"),
    ("T012", "朱晓东", "D02"),
]

# 授课关系 (teacher_id, course_id) —— T002 必授 C004「数据库原理」
TEACHING = [
    ("T001", "C001"), ("T001", "C002"),
    ("T002", "C004"), ("T002", "C012"),
    ("T003", "C003"), ("T003", "C015"),
    ("T004", "C006"), ("T004", "C007"),
    ("T005", "C005"), ("T005", "C008"),
    ("T006", "C009"), ("T006", "C017"),
    ("T007", "C010"), ("T007", "C011"),
    ("T008", "C016"), ("T008", "C018"),
    ("T009", "C013"), ("T009", "C014"),
    ("T010", "C003"), ("T010", "C016"),
    ("T011", "C002"), ("T011", "C005"),
    ("T012", "C004"), ("T012", "C017"),
]

# 保留的演示学生（学号/姓名/性别/班号）
LEGACY = [
    ("20230001", "张伟", "男", "CS2301"),
    ("20230002", "李娜", "女", "CS2301"),
    ("20230003", "王强", "男", "CS2302"),
    ("20230004", "赵敏", "女", "SE2201"),
    ("20240005", "孙磊", "男", "MA2401"),
]

# 各系的选课池（专业主干 + 公共课）
POOL = {
    "D01": ["C001", "C002", "C004", "C005", "C006", "C007", "C008", "C009", "C017"],
    "D02": ["C001", "C002", "C004", "C005", "C009", "C010", "C011", "C012", "C017"],
    "D03": ["C003", "C013", "C014", "C015", "C016", "C017", "C005", "C002"],
}

SURNAMES = list("王李张刘陈杨黄赵周吴徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万钱严武戴莫孔向汤")
GIVEN_M = list("伟强磊军洋勇杰涛超明刚平辉鹏华飞宇浩鑫健凯睿博晨铭轩阳斌峰亮")
GIVEN_F = list("娜敏静丽艳娟霞芳燕玲婷雪倩颖琳梅莉慧洁欣怡萱妍薇茜彤雯鑫雅")

rng = random.Random(20240909)


def gen_name(gender, used):
    """生成不重复的中文姓名。"""
    given = GIVEN_M if gender == "男" else GIVEN_F
    for _ in range(100000):
        n = rng.choice(SURNAMES) + rng.choice(given)
        if n not in used:
            used.add(n)
            return n
    raise RuntimeError("名字池已耗尽")


def build_students():
    """构建 50 名学生（每班 5 人，保留既有演示学号）。"""
    used = set(s[1] for s in LEGACY)
    students = []
    for idx, (cid, _cname, _dept) in enumerate(CLASSES, start=1):
        roster = [s for s in LEGACY if s[3] == cid]
        seq = 1
        while len(roster) < 5:
            sid = "2023%02d%02d" % (idx, seq)
            seq += 1
            if any(s[0] == sid for s in roster):
                continue
            gender = "男" if rng.random() < 0.55 else "女"
            roster.append((sid, gen_name(gender, used), gender, cid))
        students.extend(roster)
    return students


def build_enrolls(students):
    """为学生生成选课与成绩：优秀(全及格)、困难(多挂科)、普通三档。"""
    enrolls = []
    for i, (sid, _name, _gender, cid) in enumerate(students):
        dept = CLASS_DEPT[cid]
        pool = POOL[dept]
        if i % 8 == 0:                      # 优秀：修满全部课程且全部及格
            chosen, mode = list(pool), "top"
        elif i % 7 == 3:                    # 困难：修得少、挂科多
            chosen, mode = rng.sample(pool, 5), "risk"
        else:                               # 普通
            chosen, mode = rng.sample(pool, 7), "normal"
        for c in chosen:
            if mode == "top":
                sc = rng.randint(76, 98)
            elif mode == "risk":
                sc = rng.randint(35, 59) if rng.random() < 0.5 else rng.randint(60, 78)
            else:
                sc = rng.randint(35, 59) if rng.random() < 0.15 else rng.randint(60, 96)
            enrolls.append((sid, c, sc))
    return enrolls


def compute_requirements(students, enrolls):
    """按各系已修学分的分布，把毕业要求定在约前 40%，使部分学生刚好修满。"""
    req = {}
    for dept in ("D01", "D02", "D03"):
        earned = []
        for sid, _n, _g, cid in students:
            if CLASS_DEPT[cid] != dept:
                continue
            e = sum(CREDIT[c] for (s, c, sc) in enrolls
                    if s == sid and sc is not None and sc >= PASS_LINE)
            earned.append(e)
        earned.sort(reverse=True)
        k = max(1, int(round(len(earned) * 0.4)))
        val = earned[min(k, len(earned) - 1)]
        if val % 2:                          # 取偶数，数值更整齐
            val -= 1
        req[dept] = max(2, val)
    return req


# ----------------------------------------------------------------------
# 输出 SQL
# ----------------------------------------------------------------------
def q(v):
    """SQL 字面量转义。"""
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def emit(lines, table, cols, rows, per=20):
    for i in range(0, len(rows), per):
        chunk = rows[i:i + per]
        vals = ",\n".join("(" + ", ".join(q(v) for v in r) + ")" for r in chunk)
        lines.append("INSERT INTO %s(%s) VALUES\n%s;" % (table, ", ".join(cols), vals))
        lines.append("")


def main():
    students = build_students()
    enrolls = build_enrolls(students)
    req = compute_requirements(students, enrolls)

    lines = []
    lines.append("-- =====================================================================")
    lines.append("--  学籍系统 · 演示数据 (seed_data.sql)")
    lines.append("--  由 gen_seed.py 确定性生成，请勿手工编辑；改数据请改生成器后重跑。")
    lines.append("--  规模: %d 学生 / %d 课程 / %d 教师 / %d 选课记录 / %d 班级"
                 % (len(students), len(COURSES), len(TEACHERS), len(enrolls), len(CLASSES)))
    lines.append("--  说明: 本脚本会先清空各业务表，再写入全量数据(幂等，可重复执行)。")
    lines.append("-- =====================================================================")
    lines.append("")
    lines.append("PRAGMA foreign_keys = OFF;")
    lines.append("")
    lines.append("DELETE FROM enroll;")
    lines.append("DELETE FROM teaching;")
    lines.append("DELETE FROM graduation_requirement;")
    lines.append("DELETE FROM issued_student_id;")
    lines.append("DELETE FROM student;")
    lines.append("DELETE FROM clazz;")
    lines.append("DELETE FROM course;")
    lines.append("DELETE FROM teacher;")
    lines.append("DELETE FROM department;")
    lines.append("")

    emit(lines, "department", ["dept_id", "dept_name"], DEPARTMENTS)
    emit(lines, "clazz", ["class_id", "class_name", "dept_id"],
         [(c[0], c[1], c[2]) for c in CLASSES])
    emit(lines, "student", ["stu_id", "stu_name", "gender", "class_id"], students)
    # 学号台账：演示数据中的学号同样视为"已发放"，保证删除后不被复用
    emit(lines, "issued_student_id", ["stu_id"], [(s[0],) for s in students])
    emit(lines, "course", ["course_id", "course_name", "credit"], COURSES)
    emit(lines, "teacher", ["teacher_id", "teacher_name", "dept_id"], TEACHERS)
    emit(lines, "teaching", ["teacher_id", "course_id"], TEACHING)
    emit(lines, "graduation_requirement", ["dept_id", "required_credit"],
         [(d, req[d]) for d, _ in DEPARTMENTS])
    emit(lines, "enroll", ["stu_id", "course_id", "score"], enrolls, per=25)

    lines.append("PRAGMA foreign_keys = ON;")

    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    # 统计摘要
    fails = sum(1 for (_s, _c, sc) in enrolls if sc is not None and sc < PASS_LINE)
    print("已生成 %s" % OUT)
    print("  班级 %d | 学生 %d | 课程 %d | 教师 %d | 选课 %d"
          % (len(CLASSES), len(students), len(COURSES), len(TEACHERS), len(enrolls)))
    print("  不及格记录 %d 条 (%.1f%%)" % (fails, 100.0 * fails / len(enrolls)))
    print("  毕业要求学分: " + ", ".join("%s=%d" % (d, req[d]) for d, _ in DEPARTMENTS))
    for dept in ("D01", "D02", "D03"):
        n = sum(1 for s in students if CLASS_DEPT[s[3]] == dept)
        done = 0
        for sid, _n, _g, cid in students:
            if CLASS_DEPT[cid] != dept:
                continue
            e = sum(CREDIT[c] for (s, c, sc) in enrolls
                    if s == sid and sc is not None and sc >= PASS_LINE)
            if e >= req[dept]:
                done += 1
        print("  %s: %d 人，其中修满毕业学分 %d 人" % (dept, n, done))


if __name__ == "__main__":
    main()
