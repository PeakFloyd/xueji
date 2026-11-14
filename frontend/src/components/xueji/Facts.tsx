"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { E, now } from "./anim";
import type { Fact } from "./types";

// Every number shown here is a value the backend returned (SQL + deterministic templates). The
// interface never derives a figure the API did not give, except plain counts of returned rows.

type Ask = (q: string) => void;
type Who = "STUDENT" | "TEACHER" | "ADMIN";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const d = (s: number): CSSProperties => ({ ["--d" as string]: s.toFixed(3) });

/** Counts up from 0 on first appearance (same curve as everything else). Keeps the source's decimals. */
function Count({ value, dur = 0.8, delay = 0 }: { value: number; dur?: number; delay?: number }) {
  const decimals = (String(value).split(".")[1] ?? "").length;
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = now() + delay;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, Math.max(0, (now() - t0) / dur));
      setV(value * E.out(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur, delay]);
  return <>{v.toFixed(decimals)}</>;
}

function Head({ en, zh, right, delay = 0 }: { en: string; zh: string; right?: ReactNode; delay?: number }) {
  return (
    <div className="xj-f-head">
      <span className="xj-f-label xj-rise" style={d(delay)}>
        {en} · {zh}
      </span>
      <span className="xj-f-rule xj-grow" style={d(delay + 0.05)} />
      {right != null && (
        <span className="xj-f-meta xj-rise" style={d(delay + 0.1)}>
          {right}
        </span>
      )}
    </div>
  );
}

function Tag({ tone, children }: { tone: "yellow" | "red" | "paper"; children: ReactNode }) {
  return (
    <span className="xj-tag" data-tone={tone}>
      {children}
    </span>
  );
}

/** One score on a 0-100 track with the pass line drawn through it. */
function ScoreBar({ score, pass, delay }: { score: number | null; pass: number; delay: number }) {
  return (
    <span className="xj-sbar" aria-hidden="true">
      <span className="xj-sbar-pass" style={{ left: `${pass}%` }} />
      {score != null && (
        <span className="xj-sbar-fill xj-grow" data-fail={score < pass ? "" : undefined} style={{ width: `${Math.max(1.5, score)}%`, ...d(delay) }} />
      )}
    </span>
  );
}

function Kpis({ items, delay = 0 }: { items: { en: string; zh: string; v: ReactNode; mark?: "red" | "yellow" }[]; delay?: number }) {
  return (
    <dl className="xj-kpis">
      {items.map((k, i) => (
        <div key={k.en} className="xj-kpi xj-rise" style={d(delay + i * 0.06)}>
          <dt>
            {k.mark && <i className="xj-mark" data-tone={k.mark} />}
            {k.zh} <span>{k.en}</span>
          </dt>
          <dd>{k.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A row of squares, one per person: the literal count, readable at a glance. Rows are always
 * complete (the squares shrink to fit rather than leaving a stray partial row).
 */
function Units({ n, highlight = -1, size = 18, delay = 0, tone, width = 860 }: { n: number; highlight?: number; size?: number; delay?: number; tone?: "red"; width?: number }) {
  const cap = Math.min(n, 400);
  const gap = 3;
  const rows = Math.max(1, Math.ceil((cap * (size + gap)) / width));
  const perRow = Math.ceil(cap / rows);
  const u = Math.max(6, Math.min(size, Math.floor((width - (perRow - 1) * gap) / perRow)));
  return (
    <span className="xj-units" style={{ ["--u" as string]: `${u}px`, gridTemplateColumns: `repeat(${perRow}, ${u}px)` }} aria-hidden="true">
      {Array.from({ length: cap }, (_, i) => (
        <i key={i} className="xj-unit xj-pop" data-tone={i === highlight ? "yellow" : tone} style={d(delay + Math.min(i, 60) * 0.012)} />
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ renderers

function StudentCredit({ f, ask, role }: { f: Fact; ask: Ask; role: Who }) {
  const earned = num(f.earned) ?? 0;
  const required = num(f.required);
  const gap = num(f.gap);
  const met = required != null && earned >= required;
  const max = Math.max(earned, required ?? 0) * 1.25 || 1;
  return (
    <section className="xj-f">
      <Head
        en="EARNED CREDITS"
        zh="已修学分"
        right={
          <>
            {str(f.name)} · {str(f.id)} · {str(f.dept)}
          </>
        }
      />
      <div className="xj-credit">
        <div className="xj-hero xj-rise" style={d(0.08)}>
          <Count value={earned} />
          <span className="xj-hero-of">/ {required ?? "—"}</span>
          <span className="xj-hero-unit">学分</span>
        </div>
        <div className="xj-credit-state xj-rise" style={d(0.2)}>
          {required == null ? (
            <Tag tone="paper">未设置毕业要求 · NO REQUIREMENT</Tag>
          ) : met ? (
            <Tag tone="yellow">已达毕业要求 · MET</Tag>
          ) : (
            <Tag tone="red">还差 {gap ?? required - earned} 学分 · BELOW</Tag>
          )}
        </div>
      </div>
      <div className="xj-meter" role="img" aria-label={`已修 ${earned} 学分，毕业要求 ${required ?? "未设置"} 学分`}>
        <span className="xj-meter-fill xj-grow" data-fail={required != null && !met ? "" : undefined} style={{ width: `${(earned / max) * 100}%`, ...d(0.16) }} />
        {required != null && (
          <span className="xj-meter-req xj-drop" style={{ left: `${(required / max) * 100}%`, ...d(0.4) }}>
            <b>毕业要求 {required}</b>
          </span>
        )}
      </div>
      <Kpis
        delay={0.3}
        items={[
          { en: "ENROLLED", zh: "选修课程", v: num(f.enrolled) ?? "—" },
          { en: "FAILED", zh: "不及格", v: num(f.failed) ?? "—", mark: (num(f.failed) ?? 0) > 0 ? "red" : undefined },
          { en: "GAP", zh: "毕业差距", v: gap ?? "—" },
        ]}
      />
      {str(f.id) && (
        <div className="xj-actions xj-rise" style={d(0.5)}>
          <button type="button" className="xj-act" onClick={() => ask(role === "STUDENT" ? "我的选课与成绩" : `学号 ${str(f.id)} 的选课与成绩`)}>
            › 查看选课与成绩
          </button>
        </div>
      )}
    </section>
  );
}

type CourseRow = { id: string; name: string; credit: number | null; score: number | null };

function CourseList({ f }: { f: Fact }) {
  const rows = list<Record<string, unknown>>(f.courses).map<CourseRow>((c) => ({ id: str(c.id), name: str(c.name), credit: num(c.credit), score: num(c.score) }));
  const pass = 60;
  const failed = rows.filter((r) => r.score != null && r.score < pass).length;
  const credits = rows.reduce((a, r) => a + (r.credit ?? 0), 0);
  return (
    <section className="xj-f">
      <Head en="COURSES & SCORES" zh="选课与成绩" right={<>{str(f.name)}</>} />
      <Kpis
        items={[
          { en: "COURSES", zh: "课程", v: rows.length },
          { en: "CREDITS", zh: "课程学分合计", v: credits },
          { en: "FAILED", zh: "不及格", v: failed, mark: failed ? "red" : undefined },
        ]}
      />
      <table className="xj-table">
        <caption className="xj-sr">选课与成绩，及格线 {pass} 分</caption>
        <thead>
          <tr className="xj-rise" style={d(0.1)}>
            <th scope="col">编号</th>
            <th scope="col">课程</th>
            <th scope="col" className="r">学分</th>
            <th scope="col" className="bar">
              成绩 <span className="xj-legend-pass">及格线 {pass}</span>
            </th>
            <th scope="col" className="r">分数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id + i} className="xj-rise" style={d(0.14 + i * 0.035)}>
              <td className="mono">{r.id}</td>
              <td className="name">{r.name}</td>
              <td className="r mono">{r.credit ?? "—"}</td>
              <td className="bar">
                <ScoreBar score={r.score} pass={pass} delay={0.2 + i * 0.035} />
              </td>
              <td className="r mono strong">
                {r.score == null ? <span className="muted">未出</span> : r.score}
                {r.score != null && r.score < pass && <i className="xj-mark" data-tone="red" aria-label="不及格" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const COUNT_LABEL: Record<string, { en: string; zh: string }> = {
  total_students: { en: "STUDENTS", zh: "全校在籍学生" },
  total_teachers: { en: "FACULTY", zh: "全校教师" },
  my_dept_students: { en: "DEPARTMENT", zh: "本系学生" },
  dept_students: { en: "DEPARTMENT", zh: "系学生人数" },
  class_students: { en: "CLASS", zh: "班级学生人数" },
};

/** Consecutive head-count facts: the first is the hero, the rest are tiles beside it. */
function Counts({ facts, units = true }: { facts: Fact[]; units?: boolean }) {
  const [first, ...rest] = facts;
  const n = num(first.count) ?? 0;
  const lab = COUNT_LABEL[first.kind] ?? { en: "COUNT", zh: "人数" };
  const where = str(first.dept);
  const mates = num(first.mates);
  return (
    <section className="xj-f">
      <Head en={lab.en} zh={lab.zh} right={where || undefined} />
      <div className="xj-count">
        <div className="xj-hero xj-rise" style={d(0.08)}>
          <Count value={n} />
          <span className="xj-hero-unit">人</span>
        </div>
        {rest.length > 0 && (
          <div className="xj-tiles">
            {rest.map((f, i) => {
              const l = COUNT_LABEL[f.kind] ?? { en: "COUNT", zh: "人数" };
              return (
                <div key={i} className="xj-tile xj-rise" style={d(0.2 + i * 0.08)}>
                  <span className="xj-tile-label">
                    {l.zh} <i>{l.en}</i>
                  </span>
                  <span className="xj-tile-value">
                    <Count value={num(f.count) ?? 0} delay={0.2} />
                    <small>人</small>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {units && <div className="xj-units-row" role="img" aria-label={`${n} 人，每格代表一人`}>
        <Units n={n} highlight={mates != null ? 0 : -1} delay={0.2} size={n > 120 ? 12 : 22} />
        <span className="xj-units-note xj-rise" style={d(0.5)}>
          每格 = 1 人{mates != null && <> · <i className="xj-mark" data-tone="yellow" /> 你 · 同系同学 {mates} 人</>}
        </span>
      </div>}
    </section>
  );
}

function ByDept({ f }: { f: Fact }) {
  const rows = list<Record<string, unknown>>(f.list).map((r) => ({ dept: str(r.dept), n: num(r.count) ?? 0 }));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <section className="xj-f">
      <Head en="BY DEPARTMENT" zh="各系在籍人数" right={<>合计 {total} 人</>} />
      <div className="xj-depts">
        {rows.map((r, i) => (
          <div key={r.dept} className="xj-dept xj-rise" style={d(0.08 + i * 0.08)}>
            <span className="xj-dept-name">{r.dept}</span>
            <Units n={r.n} delay={0.14 + i * 0.08} size={20} width={540} />
            <span className="xj-dept-n">{r.n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeachingCourses({ f, ask }: { f: Fact; ask: Ask }) {
  const courses = list<string>(f.courses).map(str);
  return (
    <section className="xj-f">
      <Head en="TEACHING" zh="所授课程" right={<>{courses.length} 门</>} />
      <ol className="xj-big-list">
        {courses.map((c, i) => (
          <li key={c} className="xj-rise" style={d(0.08 + i * 0.07)}>
            <span className="xj-idx">{String(i + 1).padStart(2, "0")}</span>
            <span className="xj-big-name">{c}</span>
            <span className="xj-row-acts">
              <button type="button" className="xj-act" onClick={() => ask(`列出「${c}」的选课学生名单及该课成绩`)}>
                名单
              </button>
              <button type="button" className="xj-act" onClick={() => ask(`「${c}」的平均分是多少？`)}>
                均分
              </button>
              <button type="button" className="xj-act" onClick={() => ask(`「${c}」有多少人不及格？`)}>
                不及格
              </button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CourseAvg({ f }: { f: Fact }) {
  const avg = num(f.avg);
  const pass = num(f.pass_line) ?? 60;
  const q = f.qualified;
  return (
    <section className="xj-f">
      <Head en="COURSE AVERAGE" zh="课程平均分" right={<>《{str(f.course)}》 · {num(f.count) ?? 0} 人</>} />
      <div className="xj-credit">
        <div className="xj-hero xj-rise" style={d(0.08)}>
          {avg == null ? "—" : <Count value={avg} />}
          <span className="xj-hero-unit">分</span>
        </div>
        <div className="xj-credit-state xj-rise" style={d(0.2)}>
          {q === true ? <Tag tone="yellow">达标 · QUALIFIED</Tag> : q === false ? <Tag tone="red">未达标 · BELOW</Tag> : <Tag tone="paper">暂无成绩</Tag>}
        </div>
      </div>
      <div className="xj-meter" role="img" aria-label={`平均分 ${avg ?? "无"}，达标线 ${pass}`}>
        {avg != null && <span className="xj-meter-fill xj-grow" data-fail={avg < pass ? "" : undefined} style={{ width: `${avg}%`, ...d(0.16) }} />}
        <span className="xj-meter-req xj-drop" style={{ left: `${pass}%`, ...d(0.4) }}>
          <b>达标线 {pass}</b>
        </span>
      </div>
      <div className="xj-axis xj-rise" style={d(0.45)}>
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </section>
  );
}

function CourseFail({ f }: { f: Fact }) {
  const n = num(f.fail) ?? 0;
  return (
    <section className="xj-f">
      <Head en="FAILING" zh="不及格人数" right={<>《{str(f.course)}》 · 及格线 {num(f.pass_line) ?? 60}</>} />
      <div className="xj-count">
        <div className="xj-hero xj-rise" style={d(0.08)}>
          <Count value={n} />
          <span className="xj-hero-unit">人</span>
        </div>
      </div>
      {n > 0 && (
        <div className="xj-units-row" role="img" aria-label={`${n} 人不及格`}>
          <Units n={n} tone="red" delay={0.2} size={22} />
          <span className="xj-units-note xj-rise" style={d(0.4)}>
            每格 = 1 名不及格学生
          </span>
        </div>
      )}
    </section>
  );
}

function CoursesSummary({ f, ask }: { f: Fact; ask: Ask }) {
  const rows = list<Record<string, unknown>>(f.list);
  return (
    <section className="xj-f">
      <Head en="TEACHING OVERVIEW" zh="授课概况" right={<>{rows.length} 门课程 · 达标线 {num(rows[0]?.pass_line) ?? 60}</>} />
      <div className="xj-sum">
        {rows.map((r, i) => {
          const avg = num(r.avg);
          const pass = num(r.pass_line) ?? 60;
          const fail = num(r.fail) ?? 0;
          const course = str(r.course);
          return (
            <article key={course} className="xj-sum-row xj-rise" style={d(0.08 + i * 0.1)}>
              <header>
                <span className="xj-idx">{String(i + 1).padStart(2, "0")}</span>
                <h3>{course}</h3>
                {r.qualified === true ? <Tag tone="yellow">达标</Tag> : r.qualified === false ? <Tag tone="red">未达标</Tag> : null}
              </header>
              <div className="xj-sum-grid">
                <div className="xj-sum-cell">
                  <span className="xj-cell-label">选课 ENROLLED</span>
                  <span className="xj-cell-v">{num(r.enrolled) ?? 0}</span>
                </div>
                <div className="xj-sum-cell wide">
                  <span className="xj-cell-label">
                    平均分 AVERAGE <b>{avg ?? "—"}</b>
                  </span>
                  <span className="xj-meter thin" aria-hidden="true">
                    {avg != null && <span className="xj-meter-fill xj-grow" data-fail={avg < pass ? "" : undefined} style={{ width: `${avg}%`, ...d(0.2 + i * 0.1) }} />}
                    <span className="xj-meter-req" style={{ left: `${pass}%` }} />
                  </span>
                </div>
                <div className="xj-sum-cell">
                  <span className="xj-cell-label">不及格 FAILED</span>
                  <span className="xj-cell-v">
                    {fail}
                    <Units n={fail} tone="red" size={10} delay={0.3 + i * 0.1} width={150} />
                  </span>
                </div>
              </div>
              <div className="xj-row-acts">
                <button type="button" className="xj-act" onClick={() => ask(`列出「${course}」的选课学生名单及该课成绩`)}>
                  › 学生名单
                </button>
                <button type="button" className="xj-act" onClick={() => ask(`列出「${course}」中不及格的学生`)}>
                  › 不及格学生
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Strip plot: every student one tick on a 0-100 axis; hover/focus names it. */
function Strip({ rows, pass }: { rows: { name: string; id: string; score: number | null }[]; pass: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const scored = rows.map((r, i) => ({ ...r, i })).filter((r) => r.score != null) as { name: string; id: string; score: number; i: number }[];
  const h = hover != null ? scored.find((r) => r.i === hover) : null;
  return (
    <div className="xj-strip" onPointerLeave={() => setHover(null)}>
      <div className="xj-strip-plot" role="img" aria-label={`${scored.length} 个成绩分布，及格线 ${pass}`}>
        <span className="xj-strip-pass" style={{ left: `${pass}%` }}>
          <b>及格线 {pass}</b>
        </span>
        {scored.map((r, k) => (
          <button
            type="button"
            key={r.i}
            className="xj-strip-tick xj-drop"
            data-fail={r.score < pass ? "" : undefined}
            data-on={hover === r.i ? "" : undefined}
            style={{ left: `${r.score}%`, ...d(0.12 + k * 0.012) }}
            aria-label={`${r.name} ${r.score} 分`}
            onPointerEnter={() => setHover(r.i)}
            onFocus={() => setHover(r.i)}
            onBlur={() => setHover(null)}
          />
        ))}
        {h && (
          <span className="xj-tip" style={{ left: `${h.score}%` }}>
            {h.name} <i>{h.id}</i> <b>{h.score}</b>
          </span>
        )}
      </div>
      <div className="xj-axis">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function CourseStudents({ f }: { f: Fact }) {
  const pass = num(f.pass_line) ?? 60;
  const rows = list<Record<string, unknown>>(f.list).map((r) => ({ id: str(r.id), name: str(r.name), score: num(r.score) }));
  const sorted = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const fail = rows.filter((r) => r.score != null && r.score < pass).length;
  return (
    <section className="xj-f">
      <Head en="ROSTER" zh="选课学生" right={<>《{str(f.course)}》 · {rows.length} 人 · 不及格 {fail} 人</>} />
      <Strip rows={rows} pass={pass} />
      <ol className="xj-roster" aria-label="按成绩从高到低">
        {sorted.map((r, i) => (
          <li key={r.id} className="xj-rise" style={d(0.3 + i * 0.012)}>
            <span className="xj-roster-name">{r.name}</span>
            <span className="xj-roster-id">{r.id}</span>
            <span className="xj-roster-score">
              {r.score ?? "—"}
              {r.score != null && r.score < pass && <i className="xj-mark" data-tone="red" aria-label="不及格" />}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FailedStudents({ f }: { f: Fact }) {
  const pass = num(f.pass_line) ?? 60;
  const rows = list<Record<string, unknown>>(f.list).map((r) => ({ course: str(r.course), id: str(r.id), name: str(r.name), score: num(r.score) }));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.course, [...(groups.get(r.course) ?? []), r]);
  return (
    <section className="xj-f">
      <Head en="BELOW PASS LINE" zh="不及格学生" right={<>共 {rows.length} 人 · 及格线 {pass}</>} />
      {rows.length === 0 && <p className="xj-empty xj-rise">没有低于 {pass} 分的学生。</p>}
      {[...groups].map(([course, g], gi) => (
        <div key={course} className="xj-fail-group">
          <h3 className="xj-fail-course xj-rise" style={d(0.08 + gi * 0.1)}>
            《{course}》 <span>{g.length} 人</span>
          </h3>
          <ol className="xj-fail-list">
            {g.map((r, i) => (
              <li key={r.id + course} className="xj-rise" style={d(0.12 + gi * 0.1 + i * 0.03)}>
                <span className="xj-fail-score">{r.score ?? "—"}</span>
                <span className="xj-fail-bar" aria-hidden="true">
                  <span className="xj-grow" style={{ width: `${((r.score ?? 0) / pass) * 100}%`, ...d(0.2 + gi * 0.1 + i * 0.03) }} />
                </span>
                <span className="xj-fail-name">{r.name}</span>
                <span className="xj-roster-id">{r.id}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function StudentScores({ f }: { f: Fact }) {
  const rows = list<Record<string, unknown>>(f.list).map((r) => ({ course: str(r.course), id: str(r.id), name: str(r.name), score: num(r.score) }));
  const pass = 60;
  return (
    <section className="xj-f">
      <Head en="SCORES" zh="学生成绩" right={rows[0] ? <>{rows[0].name} · {rows[0].id}</> : undefined} />
      <table className="xj-table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.course + r.id} className="xj-rise" style={d(0.08 + i * 0.05)}>
              <td className="name">{r.course}</td>
              <td className="bar">
                <ScoreBar score={r.score} pass={pass} delay={0.14 + i * 0.05} />
              </td>
              <td className="r mono strong">{r.score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** "20230001 张伟（男，CS2301）" -> roster wall grouped by class. */
function StudentList({ f }: { f: Fact }) {
  const people = list<string>(f.list).map((s) => {
    const m = str(s).match(/^(\S+)\s+(.+?)（(.+?)，(.+?)）$/);
    return m ? { id: m[1], name: m[2], gender: m[3], group: m[4] } : { id: "", name: str(s), gender: "", group: "—" };
  });
  const groups = new Map<string, typeof people>();
  for (const p of people) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return (
    <section className="xj-f">
      <Head en="ENROLLED STUDENTS" zh="在籍学生" right={<>{people.length} 人 · {groups.size} 个班级</>} />
      <div className="xj-wall" style={{ ["--cols" as string]: Math.min(groups.size, 5) }}>
        {[...groups].map(([g, ps], gi) => (
          <div key={g} className="xj-wall-col xj-rise" style={d(0.06 + gi * 0.04)}>
            <h3>
              {g} <span>{ps.length}</span>
            </h3>
            <ul>
              {ps.map((p) => (
                <li key={p.id || p.name}>
                  <b>{p.name}</b>
                  <i>
                    {p.id} · {p.gender}
                  </i>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "T001 王建国（计算机科学系）" -> grouped by department. */
function TeacherList({ f }: { f: Fact }) {
  const people = list<string>(f.list).map((s) => {
    const m = str(s).match(/^(\S+)\s+(.+?)（(.+?)）$/);
    return m ? { id: m[1], name: m[2], group: m[3] } : { id: "", name: str(s), group: "—" };
  });
  const groups = new Map<string, typeof people>();
  for (const p of people) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return (
    <section className="xj-f">
      <Head en="FACULTY" zh="教师名单" right={<>{people.length} 位 · {groups.size} 个系</>} />
      <div className="xj-wall" style={{ ["--cols" as string]: Math.min(groups.size, 4) }}>
        {[...groups].map(([g, ps], gi) => (
          <div key={g} className="xj-wall-col xj-rise" style={d(0.06 + gi * 0.06)}>
            <h3>
              {g} <span>{ps.length}</span>
            </h3>
            <ul>
              {ps.map((p) => (
                <li key={p.id || p.name}>
                  <b>{p.name}</b>
                  <i>{p.id}</i>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Generic({ f }: { f: Fact }) {
  const entries = Object.entries(f).filter(([k]) => k !== "kind");
  return (
    <section className="xj-f">
      <Head en="RECORD" zh="记录" right={f.kind} />
      <dl className="xj-kv">
        {entries.map(([k, v], i) => (
          <div key={k} className="xj-rise" style={d(0.06 + i * 0.03)}>
            <dt>{k}</dt>
            <dd>{typeof v === "object" ? JSON.stringify(v) : str(v)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const COUNT_KINDS = new Set(Object.keys(COUNT_LABEL));

/** Render every fact of a reply, in order. Consecutive head counts share one composition. */
export function Facts({ facts, ask, role }: { facts: Fact[]; ask: Ask; role: Who }) {
  const blocks: ReactNode[] = [];
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    if (COUNT_KINDS.has(f.kind)) {
      const run = [f];
      while (i + 1 < facts.length && COUNT_KINDS.has(facts[i + 1].kind)) run.push(facts[++i]);
      // when the reply also breaks the count down by department, those rows carry the squares
      blocks.push(<Counts key={i} facts={run} units={!facts.some((x) => x.kind === "students_by_dept")} />);
      continue;
    }
    switch (f.kind) {
      case "student_credit":
        blocks.push(<StudentCredit key={i} f={f} ask={ask} role={role} />);
        break;
      case "my_course_list":
        blocks.push(<CourseList key={i} f={f} />);
        break;
      case "students_by_dept":
        blocks.push(<ByDept key={i} f={f} />);
        break;
      case "my_courses":
        blocks.push(<TeachingCourses key={i} f={f} ask={ask} />);
        break;
      case "course_avg":
        blocks.push(<CourseAvg key={i} f={f} />);
        break;
      case "course_fail":
        blocks.push(<CourseFail key={i} f={f} />);
        break;
      case "courses_summary":
        blocks.push(<CoursesSummary key={i} f={f} ask={ask} />);
        break;
      case "course_students":
        blocks.push(<CourseStudents key={i} f={f} />);
        break;
      case "failed_students":
        blocks.push(<FailedStudents key={i} f={f} />);
        break;
      case "student_scores":
        blocks.push(<StudentScores key={i} f={f} />);
        break;
      case "list_students":
        blocks.push(<StudentList key={i} f={f} />);
        break;
      case "list_teachers":
        blocks.push(<TeacherList key={i} f={f} />);
        break;
      case "write_preview":
      case "write_done":
        break; // drawn by the confirmation document
      default:
        blocks.push(<Generic key={i} f={f} />);
    }
  }
  return <>{blocks}</>;
}
