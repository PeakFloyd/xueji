-- =====================================================================
--  学籍系统 · 视图定义 (schema_views)
--  说明：把"跨表聚合"的常用查询封装成视图，供 Java 与 AI 层复用，
--        避免同一段统计 SQL 在多处重复（一处修改，处处生效）。
--
--  注意：视图不改变权限。AI 层在视图之上仍需按登录身份追加 WHERE 条件，
--        RBAC 依旧由数据层强制（见 docs/AI层重构设计.md）。
--
--  依赖：需在 schema.sql 与 schema_ext.sql 之后执行。
--  幂等：每个视图先 DROP 再 CREATE，保证重复执行时定义得到更新。
-- =====================================================================

-- ---------------------------------------------------------------------
--  视图0: 域常量(v_domain_rule) —— 单一事实来源
--  把"及格线"等域级常量集中定义在一处，其它视图与 Java/Python 均引用它，
--  避免在多个文件里各自硬编码同一数值而导致失配。
--  修改及格线只需改这一行。
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_domain_rule;
CREATE VIEW v_domain_rule AS
SELECT 60.0 AS pass_line;          -- 及格线（唯一来源）

-- ---------------------------------------------------------------------
--  视图1: 学生学业情况(v_student_credit)
--  汇总每个学生的：已修学分(仅及格课程)、毕业要求学分、选课门数、不及格门数。
--  用途: 学生查"我的学分与毕业差距"；管理员查学业预警。
--
--  【重要】required_credit 在"该系未设置毕业要求"时为 NULL，
--  绝不默认成 0——否则 0 学分的学生会被误判为"已修满"。
--  调用方必须显式处理 NULL（提示"未设置毕业要求"）。
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_student_credit;
CREATE VIEW v_student_credit AS
SELECT
    s.stu_id,
    s.stu_name,
    s.class_id,
    cl.dept_id,
    d.dept_name,
    COALESCE((SELECT SUM(co.credit)
              FROM enroll e JOIN course co ON co.course_id = e.course_id
              WHERE e.stu_id = s.stu_id
                AND e.score IS NOT NULL
                AND e.score >= (SELECT pass_line FROM v_domain_rule)), 0) AS earned_credit,
    g.required_credit AS required_credit,   -- 可为 NULL：表示该系未设置要求
    (SELECT COUNT(*) FROM enroll e2 WHERE e2.stu_id = s.stu_id) AS enrolled_count,
    (SELECT COUNT(*) FROM enroll e3
     WHERE e3.stu_id = s.stu_id
       AND e3.score IS NOT NULL
       AND e3.score < (SELECT pass_line FROM v_domain_rule)) AS failed_count
FROM student s
JOIN clazz cl      ON cl.class_id = s.class_id
JOIN department d  ON d.dept_id = cl.dept_id
LEFT JOIN graduation_requirement g ON g.dept_id = cl.dept_id;

-- ---------------------------------------------------------------------
--  视图2: 课程统计(v_course_stat)
--  每门课程的选课人数、平均分、不及格人数，以及"均分是否达标"。
--  达标判断在 SQL 内完成，调用方无需自行持有及格线常量。
--  用途: 教师查"我授课程的均分/不及格人数"；管理员看整体教学情况。
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_course_stat;
CREATE VIEW v_course_stat AS
SELECT
    c.course_id,
    c.course_name,
    c.credit,
    COUNT(e.stu_id) AS enrolled_count,
    ROUND(AVG(e.score), 2) AS avg_score,
    SUM(CASE WHEN e.score IS NOT NULL
              AND e.score < (SELECT pass_line FROM v_domain_rule)
             THEN 1 ELSE 0 END) AS fail_count,
    (SELECT pass_line FROM v_domain_rule) AS pass_line,
    CASE
        WHEN AVG(e.score) IS NULL THEN NULL
        WHEN AVG(e.score) >= (SELECT pass_line FROM v_domain_rule) THEN 1
        ELSE 0
    END AS avg_qualified
FROM course c
LEFT JOIN enroll e ON e.course_id = c.course_id
GROUP BY c.course_id, c.course_name, c.credit;

-- ---------------------------------------------------------------------
--  视图3: 教师授课(v_teacher_course)
--  教师与其所授课程的对应关系（已展开 m:n）。
--  用途: 教师查"我教的课"；并作为"是否本人授课"的权限判据。
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_teacher_course;
CREATE VIEW v_teacher_course AS
SELECT
    t.teacher_id,
    t.teacher_name,
    t.dept_id,
    c.course_id,
    c.course_name
FROM teacher t
JOIN teaching te ON te.teacher_id = t.teacher_id
JOIN course c    ON c.course_id = te.course_id;
