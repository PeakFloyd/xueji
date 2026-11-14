# 学籍管理系统（软件工程课程作业）

后端保留 **Java 17 + SQLite（JDBC）** 的实体与数据访问层，以及 Python 实现的本地 AI 查询 API；
前端已改为独立的 **Next.js / React / TypeScript** 工程。数据库设计满足第三范式（3NF）。

## 当前架构

| 组件 | 位置 | 用途 |
|---|---|---|
| Next.js 前端 | `frontend/` | App Router、Tailwind CSS、ESLint；目前是初始化后的起始页面 |
| AI HTTP API | `api_server.py`、`ai/` | `POST /api/ask`；身份与权限由 Python 数据层处理 |
| 数据层 | `src/xueji/entity/`、`src/xueji/dao/`、`db/` | Java JDBC 数据访问与 SQLite 建库脚本 |

> 当前仅初始化了新前端工程，尚未将 AI 查询或数据管理功能接入 Next.js 页面。

## 项目结构

```
xueji/
├─ frontend/               # Next.js + React + TypeScript（Bun 管理）
│  ├─ src/app/             # App Router 页面与布局
│  ├─ public/              # Next.js 脚手架自带资源
│  ├─ package.json
│  └─ bun.lock
├─ src/xueji/              # Java 实体、DAO 与数据库连接（无桌面界面）
│  ├─ entity/              # 实体类（对应表结构）
│  ├─ dao/                 # 数据访问层（JDBC，参数化 SQL）
│  └─ db/DbUtil.java       # 数据库连接与自动建库
├─ ai/                     # AI 查询层（四层，见 docs/AI层重构设计.md）
│  ├─ dbcore.py            # 地基：连接(唯一入口 db)、域常量、异常、身份与作用域
│  ├─ abilities.py         # 能力白名单：每个能力自带强制作用域
│  ├─ data_layer.py        # 执行器与门面：execute / preview / 角色校验
│  ├─ planner.py           # ②规划层：自然语言 → 结构化计划（LLM + 规则降级）
│  ├─ nlg.py               # ④表达层：数字确定性模板 + 温和拒绝 + 闲聊人格
│  └─ ai_layer.py          # 编排：会话管理、串起四层、对外 API
├─ tests/                  # 回归测试（在数据库副本上运行，不碰真库）
│  ├─ test_offline.py      # 离线测试：权限边界 / 数字准确性 / 模板 / 写入 / 约束
│  ├─ test_e2e.py          # 端到端：复合问 / 指代 / 越权 / 权限说明（需 Ollama）
│  └─ run_tests.bat        # 一键跑全部测试
├─ api_server.py           # AI 查询 HTTP API（不再包含网页）
├─ db/
│  ├─ schema.sql           # 核心 5 表结构（3NF，含范式注释与 CHECK 约束）
│  ├─ schema_ext.sql       # 扩展 3 表（teacher/teaching/graduation_requirement）
│  ├─ schema_views.sql     # 视图（学业情况 / 课程统计 / 教师授课）
│  ├─ gen_seed.py          # 演示数据生成器（确定性，输出 seed_data.sql）
│  ├─ seed_data.sql        # 全量演示数据
│  ├─ init_db.py           # 数据库初始化/重建脚本（带备份）
│  └─ xueji.db             # SQLite 运行时数据库（由初始化脚本生成）
├─ lib/sqlite-jdbc.jar     # SQLite JDBC 驱动
├─ docs/
│  ├─ 3NF说明文档.md        # 原 5 表逐表 3NF 论证
│  ├─ AI层重构设计.md       # AI 层架构（权限与自由度解耦）
│  └─ 设计说明.md           # 扩展表范式/身份模型/安全性/AI 层分层
├─ out/                    # Java 编译输出目录（build.bat 生成）
└─ build.bat               # 编译 Java 数据访问层
```

## 数据模型（均满足 3NF）

| 表 | 主键 | 说明 |
|---|---|---|
| department 系 | 系号 | 一个学校多个系 |
| clazz 班级 | 班号 | 一个系多个班级（外键系号）|
| student 学生 | 学号 | 一个班级多个学生（外键班号）|
| course 课程 | 课程号 | 学校开设的课程 |
| enroll 选修 | 学号+课程号 | 学生与课程的 m:n 联系表，记录成绩 |
| teacher 教师 | 教师号 | 教师归属某系；管理员 = 常量教师号 T001（本身是老师）|
| teaching 授课 | 教师号+课程号 | 教师与课程的 m:n 联系表 |
| graduation_requirement 毕业要求 | 系号 | 各系毕业所需总学分 |

> **身份模型**：不设账号表。身份 = 主键（学号 → 学生；教师号 → 老师）。
> 程序查 `student`/`teacher` 判定角色；删除某学生/老师即自动失去登录身份。

### 完整性约束（经典 DBMS 特性的落地）

| 特性 | 落地方式 |
|---|---|
| 实体完整性 | 每张表均有主键 |
| **参照完整性** | 外键 + **每条连接**开启 `PRAGMA foreign_keys=ON`（SQLite 默认关闭且为连接级，必须在 `DbUtil.getConnection()` 与 `dbcore.db()` 中显式开启） |
| 域完整性 | `NOT NULL` / `UNIQUE` / `CHECK`（成绩 0~100 或空、学分 > 0、性别限 男/女、**学号 8 位数字**） |
| 索引 | 为**外键列**建索引（SQLite 不会自动为外键建索引） |
| 视图 | `v_domain_rule`（域常量·单一来源）、`v_student_credit`（学业情况）、`v_course_stat`（课程统计）、`v_teacher_course`（教师授课） |
| 恢复 | `init_db.py` 每次执行前自动备份到 `db/backup/` |

> **学号策略：只发一次，永不复用**
> `issued_student_id` 台账记录**历史上发放过的全部学号**。新增学籍时校验该学号"从未发放过"；
> 学生即使被删除，其学号也**永久占用**。
> 原因：学号是终身标识，外部成绩单/档案都以学号对人；把已删除学生的学号补给他人，
> 历史材料就会张冠李戴。因此**空号是可以接受的正常现象，复用才是事故**。
> （删除学生**不会**删除台账行——这正是本策略的落点。）

> **两条刻意为之的设计原则**
> 1. **缺失必须显式**：某系未设置毕业要求时，视图返回 `NULL` 而**不默认成 0**，
>    否则 0 学分的学生会被误判为"已修满"。AI 层遇到 `NULL` 会明确回答"尚未设置毕业要求"。
> 2. **常量单一来源**：及格线只在 `v_domain_rule` 中定义一次，其它视图与
>    Java/Python 均引用它，杜绝多处硬编码导致的口径失配。
>    课程名加 `UNIQUE`，使自然语言按"课程名"定位课程时映射唯一、无歧义。

> **结构与数据分离**：`schema*.sql` 只定义结构（表 / 索引 / 视图），不含任何数据；
> 演示数据全部由 `seed_data.sql` 提供。因此结构可独立演进，数据可由生成器确定性复现。

## 运行

需要 Bun 和 Python；编译 Java 数据层另需 JDK 17。首次使用先运行 `python db\init_db.py` 初始化数据库。

```bat
cd frontend
bun dev                     :: Next.js 起始页 http://localhost:3000
```

另开终端，在项目根目录运行 API 或 Java 编译命令：

```bat
python api_server.py         :: AI HTTP API http://127.0.0.1:8090/api/ask
build.bat                    :: 可选：编译 Java 实体与 DAO
```

> Next.js 起始页尚未连接 Python API；启动 API 不会自动提供旧网页界面。

### 演示数据规模

| 项目 | 数量 |
|---|---|
| 系 | 3 |
| 班级 | 10（每系 3~4 个班）|
| 学生 | 50（每班 5 人）|
| 课程 | 18 |
| 教师 | 12（其中 T001 为管理员）|
| 授课关系 | 24 |
| 选课记录 | 350（约 15% 不及格）|

数据特点：成绩呈合理分布（含不及格、未修满、修满毕业学分三类学生）；
各系设有毕业学分要求，可用于演示"还差多少学分毕业"。

### 数据重置 / 重新生成

```bat
db\reset_demo.bat                :: 一键还原演示数据（手动测试后用这个）
python db\gen_seed.py            :: 重新生成 seed_data.sql（确定性）
python db\init_db.py             :: 应用数据到 xueji.db（自动备份到 db\backup\）
python db\init_db.py --fresh     :: 删库重建（结构 + 数据全部重建）
```
> `init_db.py` 幂等，可反复执行；每次执行前自动备份现有库。

> **手动测试后请用 `db\reset_demo.bat` 还原**（网页/命令行直接读写真库）。
> 注意：**有了学号台账后，"删掉就等于恢复"不再成立**——新增的测试学号即使删掉学生，
> 学号仍**永久留在台账**中不再复用；因此还原要用**重建**，而不是手工删除。
> 自动化测试（`tests\`）不受此影响：它们跑在**数据库副本**上，不碰真库。

## 数据维护

Java 实体和 DAO 仍保留，可用于数据库操作；原桌面管理界面及其启动脚本已移除。
新前端目前只包含脚手架，尚未提供数据管理页面。第 9 张表 `issued_student_id`（学号台账）仍由数据层维护，不应手工删除历史学号。

## 作业文档

范式设计与论证见 [`docs/3NF说明文档.md`](docs/3NF说明文档.md)（原 5 表）与
[`docs/设计说明.md`](docs/设计说明.md)（扩展 3 表、身份模型、安全性、AI 分层）；
建表脚本中的范式注释见 [`db/schema.sql`](db/schema.sql) 与 [`db/schema_ext.sql`](db/schema_ext.sql)。

---

## 扩展：角色化 + AI 查询层（见 [`docs/设计说明.md`](docs/设计说明.md)）

在原 5 表基础上扩充 3 张表（`schema_ext.sql`，写同一 `xueji.db`，均 3NF）：
`teacher`（含 admin=T001）、`teaching`（教师↔课程 m:n）、`graduation_requirement`（毕业学分）。

**身份 = 主键，无账号表**：输入学号 → 学生；输入教师号 → 老师；`T001` → 管理员（也是老师）。
角色由程序查库判定，删除即失去身份（权限动态给/收）。

**AI 查询层**（Python + 本地 Ollama，离线）采用**四层架构**，核心原则是
「**AI 给自由，数据层守边界**」：

| 层 | 文件 | 职责 |
|---|---|---|
| ① 上下文层 | `dbcore.py` | 身份 → 作用域（服务端派生，不经 LLM） |
| ② 规划层 | `planner.py` | 自然语言 → 结构化计划（能力+参数），**不生成 SQL** |
| ③ 执行层 | `data_layer.py` + `abilities.py` | 白名单能力 + **强制作用域**，RBAC 在此锁死 |
| ④ 表达层 | `nlg.py` | 数字走确定性模板；越权/闲聊走**温和人格** |

设计要点（详见 [`docs/AI层重构设计.md`](docs/AI层重构设计.md)）：
- **作用域由身份注入，绝不接受 LLM 传来的身份参数**（类似手机相册的"受限句柄"）
- **数字只由 SQL + 模板产生**：实测 LLM 计数不可靠（同一问题两次答 12 和 10）
- **越权显式拒绝且措辞温和**，不做静默改写（"以为看到别人数据、其实是自己的"更危险）
- **Ollama 未启动也能工作**：规划降级为规则、措辞降级为内置模板

### 用法一：AI HTTP API
```bat
python api_server.py     :: POST http://127.0.0.1:8090/api/ask
```
请求 JSON 包含 `user`（学号/教师号）、`question`，可选 `reset`；演示主键：学生 `20230001`、老师 `T002`、管理员 `T001`。

### 用法二：命令行（身份 = 主键）
```bat
python ai\ai_layer.py --user 20230001 ask 我的学分和毕业还差多少
python ai\ai_layer.py --user T002     ask 本院有多少学生
python ai\ai_layer.py --user T001     ask 一共多少老师
python ai\ai_layer.py --user T001     add 20240099 陈晓 男 SE2201
python ai\ai_layer.py --user T001     del 20240099
```
- 无额外第三方依赖（仅 Python 标准库 + 本地 Ollama 服务）。
- Ollama 未启动不影响数据查询（降级为规则路由 + 确定性模板作答）。

### 用法三：回归测试

```bat
tests\run_tests.bat          :: 一键跑全部
python tests\test_offline.py :: 离线测试（不需要 Ollama）
python tests\test_e2e.py     :: 端到端（需要 Ollama，未启动则自动跳过）
```

- **离线测试**覆盖最要紧的部分：权限边界、数字准确性、规划器规则、表达层模板、
  受控写入、数据库约束（外键 / CHECK / 唯一）。
- 测试全部在**数据库副本**上运行，不会污染 `db/xueji.db`。
- 改动 AI 层代码后请先跑离线测试——它能挡住绝大多数回归。
