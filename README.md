# 学籍管理系统（软件工程课程作业）

后端使用 **Bun / TypeScript + pi-agent-core** 运行会话与工具；Python 只负责 SQLite 业务能力与权限检查，Java 17 JDBC 实体/DAO 继续保留。前端是独立的 **Next.js / React / TypeScript** 工程，本次不改前端页面。数据库设计满足第三范式（3NF）。

## 当前架构

| 组件 | 位置 | 用途 |
|---|---|---|
| Next.js 前端 | `frontend/` | App Router；业务页面与后端对接待实现 |
| Agent HTTP API | `backend/` | pi-agent-core 会话、模型、流式响应、自定义工具与写操作二次确认 |
| 受控数据能力 | `ai/` | Python SQLite 能力白名单、作用域/RBAC、事实模板；不直接调用模型 |
| 数据层 | `src/xueji/entity/`、`src/xueji/dao/`、`db/` | Java JDBC 数据访问与 SQLite 建库脚本 |

> 模型由服务端环境变量选择 pi-ai 支持的 provider/model，不再绑定本地 Ollama。不要在 Next.js 客户端暴露模型密钥；对接方法见 [`docs/API.md`](docs/API.md)。

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
├─ backend/                # Bun + pi-agent-core HTTP 服务（仅后端，无 Pi TUI）
│  ├─ src/                # agent / tools / system-prompt / server / bridge
│  ├─ package.json
│  └─ .env.example
├─ ai/                     # Python 受控业务数据层（无模型调用）
│  ├─ dbcore.py            # 连接、域常量、身份与作用域
│  ├─ abilities.py         # 学籍能力白名单
│  ├─ data_layer.py        # 执行器、写入预览与角色检查
│  ├─ facts.py             # 事实的确定性中文模板
│  └─ tool_bridge.py       # 后端调用的 stdin/stdout JSON 桥接器
├─ tests/                  # 数据层/桥接器回归测试（使用数据库副本）
│  ├─ test_bridge.py
│  └─ run_tests.bat
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
│  ├─ API.md               # 给 Next.js 前端使用的 HTTP / SSE 接口协议
│  ├─ 3NF说明文档.md        # 原 5 表逐表 3NF 论证
│  └─ 设计说明.md           # 扩展表范式/身份模型/安全性/Agent 分层
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

需要 Bun、Python 3 和支持工具调用的云端模型密钥；编译 Java 数据层另需 JDK 17。首次使用运行 `python db\init_db.py` 初始化数据库。

```bat
cd backend
bun install
set PI_PROVIDER=anthropic
set PI_MODEL=claude-sonnet-4-6
set ANTHROPIC_API_KEY=你的密钥
bun dev                     :: 后端默认 http://127.0.0.1:8090
```

另开终端启动独立前端：

```bat
cd frontend
bun dev                     :: http://localhost:3000
```

模型、跨域、会话和请求示例见 [`docs/API.md`](docs/API.md)。前端目前仍是初始化页面，**本次没有修改其代码**。不要将未认证的演示身份接口暴露到公网；需要上线时先接入真实认证。

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

**AI 查询层**采用 pi-agent-core 与 Python 数据能力分层，核心原则是「Agent 负责理解与编排，数据层负责权限与事实」：

| 层 | 文件 | 职责 |
|---|---|---|
| Agent 内核 | `backend/src/agent.ts`、`backend/src/system-prompt.ts` | 模型选择、会话历史、工具循环、自定义系统提示词 |
| 工具与 HTTP | `backend/src/tools.ts`、`backend/src/server.ts` | 受限工具、SSE、会话隔离与显式确认 |
| 业务执行 | `ai/tool_bridge.py`、`ai/data_layer.py`、`ai/abilities.py` | 身份派生作用域、能力白名单、服务端 RBAC、写入预览/执行 |
| 事实表达 | `ai/facts.py` | 数据库事实确定性拼装，不依赖模型生成数字 |

- 模型只可调用已注册的学籍工具，不能执行任意 SQL、命令或文件读写；每次调用在服务端重验身份与权限。
- 新增/删除学籍只能先预览，再由用户通过带 token 的确认接口触发；模型无法自行确认写入。
- 查询结果的准确数值来自数据库与确定性事实模板；模型仅负责理解、工具选择和非事实对话。
- 原“身份 = 主键”只是课程演示，不构成认证；后端默认只监听本机，勿直接暴露公网。

### API 与测试

请求/响应、SSE 事件与 Next.js 对接方法见 [`docs/API.md`](docs/API.md)。

```bat
python tests\test_bridge.py    :: Python 数据权限与桥接器测试
cd backend && bun test         :: 后端会话/HTTP 测试
cd backend && bun run check    :: TypeScript 静态类型检查
```

Python 测试使用数据库副本，不污染 `db/xueji.db`。旧的本地模型调用、规则规划器与 Python AI HTTP 入口已由 Agent 服务取代。
