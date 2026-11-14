"""Deterministic formatting of trusted ability facts; no model or network access."""

import json


def _n(value):
    """Format an integral float without decimals and a missing value as a dash."""
    if value is None:
        return "-"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _who(fact):
    return fact.get("address") or fact.get("name") or "您"


def facts_text(kind, f):
    """Render SQL-derived facts without allowing a language model to alter numbers."""
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
            course, "、".join("%s（%s，%s分）" % (y["name"], y["id"], _n(y["score"])) for y in items))
            for course, items in by.items()]
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

    if kind in ("dept_students", "class_students"):
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
        for key, value in f["fields"]:
            lines.append("  · %s：%s" % (key, value))
        if f.get("warning"):
            lines.append("  注意：%s" % f["warning"])
        lines.append("")
        lines.append("请回复「确认」执行，或回复「取消」放弃。数据库尚未改动。")
        return "\n".join(lines)

    if kind == "write_done":
        return f["text"] + "。"

    return json.dumps(f, ensure_ascii=False)
