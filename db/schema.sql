-- =====================================================================
--  学籍管理系统 · 数据库模式 (schema)
--  数据库：SQLite  (符合 第三范式 3NF)
--
--  【本文件只定义结构，不含任何数据】
--    数据由 seed_data.sql 提供（演示数据），两者严格分离，
--    这样结构可独立演进、数据可由生成器确定性复现。
--
--  完整性设计（对应经典 DBMS 的完整性约束）：
--    * 实体完整性：每张表都有主键
--    * 参照完整性：外键 + 运行期强制开启 PRAGMA foreign_keys=ON
--    * 域完整性  ：NOT NULL / UNIQUE / CHECK
--    * 索引      ：为外键列建索引（SQLite 不会自动为外键建索引）
-- =====================================================================

-- 说明：此 PRAGMA 仅对当前连接有效。连接池/每次连接都必须重新设置，
--       故 Java 的 DbUtil.getConnection() 与 Python 的 _conn() 都会设置。
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
--  表1: 系(department)
--  属性: dept_id(系号,主键), dept_name(系名)
--  函数依赖: dept_id -> dept_name
--  -- 主键为单属性，不存在部分函数依赖；
--  -- dept_name 是唯一非主属性，彼此无传递依赖。=> 3NF
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS department (
    dept_id     TEXT PRIMARY KEY,   -- 系号
    dept_name   TEXT NOT NULL UNIQUE-- 系名
);

-- ---------------------------------------------------------------------
--  表2: 班级(clazz)
--  属性: class_id(班号,主键), class_name(班名), dept_id(所属系,外键)
--  函数依赖: class_id -> class_name, dept_id
--  -- class_id 决定本班所有属性，主键单属性，无部分依赖；
--  -- class_name、dept_id 都只依赖主键 class_id，无传递依赖。=> 3NF
--  说明: 系名(系的信息)不冗余在本表，而通过 dept_id 关联 department 表，
--        避免依赖传递，这是达到 3NF 的关键。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clazz (
    class_id    TEXT PRIMARY KEY,   -- 班号
    class_name  TEXT NOT NULL,      -- 班名
    dept_id     TEXT NOT NULL,      -- 所属系(外键)
    FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

CREATE INDEX IF NOT EXISTS idx_clazz_dept ON clazz(dept_id);

-- ---------------------------------------------------------------------
--  表3: 学生(student)
--  属性: stu_id(学号,主键), stu_name(姓名), gender(性别),
--        class_id(所在班级,外键)
--  函数依赖: stu_id -> stu_name, gender, class_id
--  -- 学号为主键，单属性无部分依赖；
--  -- 姓名/性别/班号均直接依赖学号，不依赖其它非主属性，无传递依赖。
--  说明: 班级名、系名等均不放入本表，只保留班级外键 class_id。
--  域约束: 性别限定为 男/女（或未知）；学号为 8 位数字（业务编号规则）。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student (
    stu_id      TEXT PRIMARY KEY,   -- 学号（8 位数字）
                -- 学号是"智能编号"（入学年份+班级+序号）。此处只校验形式，
                -- 真正的"只发一次"由 issued_student_id 台账保证。
    stu_name    TEXT NOT NULL,      -- 姓名
    gender      TEXT                -- 性别(男/女)
                CHECK (gender IS NULL OR gender IN ('男', '女')),
    class_id    TEXT NOT NULL,      -- 所在班级(外键)
    CHECK (length(stu_id) = 8 AND stu_id NOT GLOB '*[^0-9]*'),
    FOREIGN KEY (class_id) REFERENCES clazz(class_id)
);

CREATE INDEX IF NOT EXISTS idx_student_class ON student(class_id);

-- ---------------------------------------------------------------------
--  学号发放台账(issued_student_id)
--  记录【历史上发放过的全部学号】。新增学籍时校验学号"从未发放过"；
--  学生即使被删除，其学号也**永久占用**，绝不回收复用。
--
--  为什么？学号是终身标识，外部成绩单/档案都以学号对人。
--  若把已删除学生的学号补给另一个人，历史材料就会张冠李戴（严重事故）。
--  因此：**编号只增不复用**；出现的"空号"是可以接受的正常现象。
--
--  说明：本表不设外键——它要比学生记录**活得更久**（学生删了，台账仍在）。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS issued_student_id (
    stu_id    TEXT PRIMARY KEY
              CHECK (length(stu_id) = 8 AND stu_id NOT GLOB '*[^0-9]*'),
    issued_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
--  表4: 课程(course)
--  属性: course_id(课程号,主键), course_name(课程名), credit(学分)
--  函数依赖: course_id -> course_name, credit
--  -- 单属性主键，无部分依赖；非主属性均依赖主键，无传递依赖。=> 3NF
--  域约束: 学分必须为正；课程名唯一。
--  说明: 课程名唯一是【有意为之】——AI 层用自然语言按"课程名"定位课程，
--        名字必须能唯一映射到一门课，否则按名查找会产生歧义。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS course (
    course_id   TEXT PRIMARY KEY,   -- 课程号
    course_name TEXT NOT NULL UNIQUE, -- 课程名(唯一，供自然语言按名定位)
    credit      INTEGER NOT NULL    -- 学分
                CHECK (credit > 0 AND credit <= 20)
);

-- ---------------------------------------------------------------------
--  表5: 选修(enroll)  —— 学生与课程之间的 m:n 联系转换而来的关系表
--  属性: stu_id(学号), course_id(课程号), score(成绩)
--  主键: (stu_id, course_id)  复合主键
--  函数依赖: (stu_id, course_id) -> score
--  -- 主键由两个外键组成，但非主属性 score 完整依赖整个主键，
--     不存在"部分函数依赖"；
--  -- score 只依赖复合主键，不依赖其它非主属性，无传递依赖。=> 3NF
--  说明: 学生与课程是多对多(m:n)关系，无法用 1:n 直接表达，故拆成
--        一张独立的"选修"联系表，这正是 3NF 设计的要求。
--  域约束: 成绩为 NULL(未考) 或 0~100 之间。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enroll (
    stu_id      TEXT NOT NULL,
    course_id   TEXT NOT NULL,
    score       REAL                -- 成绩(可为空表示未考)
                CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    PRIMARY KEY (stu_id, course_id),
    FOREIGN KEY (stu_id)    REFERENCES student(stu_id),
    FOREIGN KEY (course_id) REFERENCES course(course_id)
);

-- 复合主键已隐含 (stu_id, course_id) 索引，可支撑按学号的查询；
-- 但按课程号单独筛选无法利用该索引，故额外建立。
CREATE INDEX IF NOT EXISTS idx_enroll_course ON enroll(course_id);
