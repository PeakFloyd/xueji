import type { Role } from "./types";

export const ROLE: Record<Role, { en: string; zh: string }> = {
  STUDENT: { en: "STUDENT", zh: "学生" },
  TEACHER: { en: "TEACHER", zh: "教师" },
  ADMIN: { en: "ADMIN", zh: "管理员" },
};

/** Whitelisted backend abilities (ai/abilities.py) -> what the console calls them while they run. */
export const TOOL_LABEL: Record<string, string> = {
  my_credit: "本人学分与毕业差距",
  my_courses: "本人选课与成绩",
  student_credit_of: "指定学生的学分",
  student_courses_of: "指定学生的选课与成绩",
  my_dept_students_count: "本系学生人数",
  my_teaching_courses: "本人所授课程",
  course_avg: "课程平均分",
  course_fail: "课程不及格人数",
  my_courses_summary: "授课概况",
  my_course_students: "课程学生名单",
  my_failed_students: "不及格学生",
  my_student_scores: "学生在本人课程的成绩",
  count_students_by_dept: "系学生人数",
  count_students_by_class: "班级学生人数",
  total_students: "全校学生总数",
  total_teachers: "全校教师总数",
  students_by_dept: "各系学生人数",
  list_students: "在籍学生名单",
  list_teachers: "教师名单",
  add_student: "新增学籍 · 仅预览",
  delete_student: "删除学籍 · 仅预览",
};

/**
 * A quick command. `ask` is sent as-is; a `{value}` in it marks an example the user is expected to
 * replace - the command is put into the input with that span selected instead of being sent.
 */
export type Command = { en: string; zh: string; ask: string };

export const COMMANDS: Record<Role, Command[]> = {
  STUDENT: [
    { en: "CREDIT", zh: "学分与毕业差距", ask: "我的学分和毕业还差多少？" },
    { en: "GRADES", zh: "选课与成绩", ask: "我的选课与成绩" },
    { en: "DEPARTMENT", zh: "本系学生人数", ask: "我所在的系有多少学生？" },
    { en: "CLASS", zh: "班级人数", ask: "班级 {CS2301} 有多少学生？" },
    { en: "HELP", zh: "你能做什么", ask: "你好，你可以帮我查询哪些内容？" },
  ],
  TEACHER: [
    { en: "OVERVIEW", zh: "授课概况", ask: "我所授每门课程的选课人数、平均分与不及格人数" },
    { en: "COURSES", zh: "我教的课程", ask: "列出我所授的课程" },
    { en: "FAILING", zh: "不及格学生", ask: "列出我所授课程中不及格的学生" },
    { en: "ROSTER", zh: "课程学生名单", ask: "列出「{数据库原理}」的选课学生名单及该课成绩" },
    { en: "AVERAGE", zh: "课程平均分", ask: "「{数据库原理}」的平均分是多少？" },
    { en: "FACULTY", zh: "本院学生人数", ask: "本院有多少学生？" },
  ],
  ADMIN: [
    { en: "OVERVIEW", zh: "全校概况", ask: "全校学生和教师总数，以及各系学生人数" },
    { en: "STUDENTS", zh: "在籍学生名单", ask: "列出全部在籍学生名单" },
    { en: "STAFF", zh: "教师名单", ask: "列出全部教师名单" },
    { en: "RECORD", zh: "学生学分档案", ask: "学号 {20230001} 的学分与毕业情况" },
    { en: "ENROL", zh: "新增学籍", ask: "新增学生：学号 {20240001}，姓名 林夏，性别 女，班号 CS2301" },
    { en: "REMOVE", zh: "删除学籍", ask: "删除学号 {20240001} 的学籍" },
  ],
};

/** The question the console asks by itself when a session opens: the role's first command. */
export const briefing = (role: Role) => COMMANDS[role][0].ask;

/** Demo identities from the seed database (README / docs/API.md). */
export const DEMO = [
  { id: "20230001", zh: "学生", en: "STUDENT" },
  { id: "T002", zh: "教师", en: "TEACHER" },
  { id: "T001", zh: "管理员", en: "ADMIN" },
];

/** Classify what is being typed at the gate. */
export function idKind(v: string): { en: string; zh: string } | null {
  if (/^\d{8}$/.test(v)) return { en: "STUDENT ID", zh: "学号" };
  if (/^T\d{3}$/i.test(v)) return { en: "STAFF ID", zh: "教师号" };
  return null;
}

/** "本院（软件工程系）以及…" -> "软件工程系". */
export const deptOf = (scope: string) => scope.match(/（([^）]+)）/)?.[1] ?? null;
