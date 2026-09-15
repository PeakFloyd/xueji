-- =====================================================================
--  学籍系统 · 角色化扩展结构 (schema_ext)
--  说明：为支撑"学生/老师/管理员"三角色、教师授课、毕业学分要求，
--        在原 5 表(见 schema.sql)基础上扩充 3 张表，均满足 3NF。
--
--  【本文件只定义结构，不含任何数据】数据由 seed_data.sql 提供。
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  表6: 教师(teacher)
--  属性: teacher_id(主键), teacher_name, dept_id(所属系,外键)
--  函数依赖: teacher_id -> teacher_name, dept_id
--  -- 单属性主键，无部分依赖；非主属性均依赖主键，无传递依赖。=> 3NF
--  用途: 老师归属某系，用于"老师只能看本院学生"的权限判定；
--        管理员 = 常量教师号 T001(本身是老师)，见 docs/设计说明.md。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher (
    teacher_id   TEXT PRIMARY KEY,
    teacher_name TEXT NOT NULL,
    dept_id      TEXT NOT NULL,
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_dept ON teacher(dept_id);

-- ---------------------------------------------------------------------
--  表7: 授课(teaching) —— 教师与课程的 m:n 关系表
--  属性: teacher_id, course_id; 复合主键 (teacher_id, course_id)
--  非主属性为空，无部分/传递依赖 => 3NF(联系表)
--  用途: 通过 teaching 判定"我教的课程X"，并据此做权限过滤与均分统计。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teaching (
    teacher_id TEXT NOT NULL,
    course_id  TEXT NOT NULL,
    PRIMARY KEY (teacher_id, course_id),
    FOREIGN KEY (teacher_id) REFERENCES teacher(teacher_id),
    FOREIGN KEY (course_id)  REFERENCES course(course_id)
);

CREATE INDEX IF NOT EXISTS idx_teaching_course ON teaching(course_id);

-- ---------------------------------------------------------------------
--  表8: 毕业学分要求(graduation_requirement)
--  属性: dept_id(主键,外键), required_credit(毕业所需总学分)
--  函数依赖: dept_id -> required_credit; 单属性主键 => 3NF
--  用途: 由该系要求学分与学生已修学分合计，算出"还差多少毕业"。
--  域约束: 学分为非负整数。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS graduation_requirement (
    dept_id         TEXT PRIMARY KEY,
    required_credit INTEGER NOT NULL
                    CHECK (required_credit >= 0 AND required_credit <= 300),
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

-- 注: 不建 user_account。身份 = 主键(学号/教师号)，角色由程序查 student/teacher 判定；
--     管理员 = 常量教师号 T001。删除某学生/老师即自动失去登录身份。
