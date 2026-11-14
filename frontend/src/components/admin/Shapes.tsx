"use client";

import { useState, type ReactNode } from "react";
import { FILE_KEY, kib, numOf, objOf, ownerLabel, pagesBy, passLine, recs, strOf, type Page, type Rec, type Snapshot } from "./model";
import { d } from "./parts";

// One picture per object, each answering one question about that object's own rows, in the grammar of
// the lieflat-charts "Lupi basics": every mark is a countable record (a rung, a tick, a cell), dense
// furniture (rules, brackets, axes) and a conclusion as the title. Colour carries meaning only:
// red = below the line / missing / void, yellow = the reference line or the one thing to look at.
// Titles count rows the snapshot returned; averages are the views' own (v_course_stat).

export const SW = 880;
export const SH = 540;
const P = "#F2F0EA";
const RED = "#FF3D24";
const YEL = "#FFD21F";
const INK = "#0B0B0B";

export type Shape = { title: string; sub: string; node: ReactNode };

type TProps = {
  x: number;
  y: number;
  size?: number;
  w?: number;
  op?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  track?: number;
  cls?: string;
  dl?: number;
  children: ReactNode;
  tip?: string;
  vertical?: boolean;
  /** Knock the text out of whatever passes behind it (paint-order halo in the background colour). */
  halo?: boolean;
};

function T({ x, y, size = 12, w = 700, op = 1, fill = P, anchor = "start", track, cls = "sv-up", dl = 0, children, tip, vertical, halo }: TProps) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={w}
      fill={fill}
      fillOpacity={op}
      textAnchor={anchor}
      letterSpacing={track ? `${track}em` : undefined}
      className={cls}
      style={{ ...d(dl), ...(vertical ? { writingMode: "vertical-rl" as const } : null) }}
      data-tip={tip}
      {...(halo ? { stroke: "#121212", strokeWidth: 5, strokeLinejoin: "round" as const, paintOrder: "stroke" } : null)}
    >
      {children}
    </text>
  );
}

const Svg = ({ children, h = SH }: { children: ReactNode; h?: number }) => (
  <svg className="ad-svg" viewBox={`0 0 ${SW} ${h}`} width={SW} height={h} textRendering="geometricPrecision">
    {children}
  </svg>
);

const by = <K extends string>(rows: Rec[], key: K) => {
  const m = new Map<string, Rec[]>();
  for (const r of rows) m.set(strOf(r[key]), [...(m.get(strOf(r[key])) ?? []), r]);
  return m;
};
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""));
const list = (names: string[], max = 2) => (names.length <= max ? names.map((n) => `「${n}」`).join("") : `${names.length} 门课`);

// ------------------------------------------------------------------ department: tick rows

function department(s: Snapshot, t0: number): Shape {
  const depts = recs(objOf(s, "department")).sort((a, b) => cmp(strOf(a.dept_id), strOf(b.dept_id)));
  const classes = by(recs(objOf(s, "clazz")), "dept_id");
  const students = by(recs(objOf(s, "student")), "class_id");
  const teachers = by(recs(objOf(s, "teacher")), "dept_id");
  const req = new Map(recs(objOf(s, "graduation_requirement")).map((r) => [strOf(r.dept_id), numOf(r.required_credit)]));
  const rows = depts.map((dp) => {
    const cls = (classes.get(strOf(dp.dept_id)) ?? []).sort((a, b) => cmp(strOf(a.class_id), strOf(b.class_id)));
    const groups = cls.map((c) => ({ c, st: (students.get(strOf(c.class_id)) ?? []).sort((a, b) => cmp(strOf(a.stu_id), strOf(b.stu_id))) }));
    return { dp, groups, n: groups.reduce((k, g) => k + g.st.length, 0) };
  });
  const top = [...rows].sort((a, b) => b.n - a.n)[0];
  const rowH = Math.min(168, (SH - 20) / Math.max(1, rows.length));
  const PITCH = 13;
  const GAP = 30;
  return {
    title: top ? `${strOf(top.dp.dept_name)}规模最大：${top.groups.length} 个班、${top.n} 名学生` : "尚无院系",
    sub: "一竖 = 一名在籍学生（student）· 按班级（clazz）分组 · 右侧为本系人数",
    node: (
      <Svg>
        {rows.map((r, i) => {
          const y0 = 10 + i * rowH;
          let x = 262;
          const base = t0 + i * 0.12;
          return (
            <g key={strOf(r.dp.dept_id)}>
              <T x={0} y={y0 + 46} size={26} w={900} dl={base}>
                {strOf(r.dp.dept_name)}
              </T>
              <T x={0} y={y0 + 70} size={12} op={0.55} track={0.2} dl={base + 0.05}>
                {strOf(r.dp.dept_id)}
              </T>
              <T x={0} y={y0 + 98} size={13} w={600} op={0.7} dl={base + 0.08}>
                {`${r.groups.length} 个班 · ${(teachers.get(strOf(r.dp.dept_id)) ?? []).length} 位教师 · ${req.get(strOf(r.dp.dept_id)) == null ? "未设毕业要求" : `毕业 ${req.get(strOf(r.dp.dept_id))} 学分`}`}
              </T>
              {r.groups.map((g, gi) => {
                const gx = x;
                x += g.st.length * PITCH + GAP;
                return (
                  <g key={strOf(g.c.class_id)}>
                    {g.st.map((st, j) => (
                      <rect
                        key={strOf(st.stu_id)}
                        className="sv-up"
                        style={d(base + 0.1 + (gi * 6 + j) * 0.012)}
                        x={gx + j * PITCH}
                        y={y0 + 18}
                        width={5}
                        height={74}
                        fill={P}
                        data-tip={`${strOf(st.stu_name)} · ${strOf(st.stu_id)} · ${strOf(g.c.class_id)}`}
                      />
                    ))}
                    <rect className="sv-right" style={d(base + 0.2)} x={gx} y={y0 + 102} width={Math.max(5, (g.st.length - 1) * PITCH + 5)} height={1} fill={P} fillOpacity={0.3} />
                    <T x={gx} y={y0 + 122} size={12} op={0.62} track={0.04} dl={base + 0.24}>
                      {strOf(g.c.class_id)}
                    </T>
                  </g>
                );
              })}
              <T x={SW} y={y0 + 86} size={60} w={900} anchor="end" dl={base + 0.1}>
                {r.n}
              </T>
              <T x={SW} y={y0 + 110} size={12} op={0.55} anchor="end" track={0.2} dl={base + 0.14}>
                名学生
              </T>
              {i < rows.length - 1 && <rect className="sv-right" style={d(base + 0.3)} x={0} y={y0 + rowH - 14} width={SW} height={1} fill={P} fillOpacity={0.1} />}
            </g>
          );
        })}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ clazz: name-plate rungs

function clazz(s: Snapshot, t0: number): Shape {
  const depts = new Map(recs(objOf(s, "department")).map((r) => [strOf(r.dept_id), strOf(r.dept_name)]));
  const classes = recs(objOf(s, "clazz")).sort((a, b) => cmp(strOf(a.dept_id), strOf(b.dept_id)) || cmp(strOf(a.class_id), strOf(b.class_id)));
  const students = by(recs(objOf(s, "student")), "class_id");
  const counts = classes.map((c) => (students.get(strOf(c.class_id)) ?? []).length);
  const min = Math.min(...counts);
  const max = Math.max(...counts, 1);
  const deptBreaks = classes.filter((c, i) => i > 0 && c.dept_id !== classes[i - 1].dept_id).length;
  const GAP = 16;
  const DGAP = 40;
  const colW = (SW - (classes.length - 1 - deptBreaks) * GAP - deptBreaks * DGAP) / Math.max(1, classes.length);
  const pitch = Math.min(40, 250 / max);
  const rungH = pitch - 6;
  const base = 360;
  let x = 0;
  const cols = classes.map((c, i) => {
    if (i > 0) x += c.dept_id !== classes[i - 1].dept_id ? DGAP : GAP;
    const cx = x;
    x += colW;
    return { c, x: cx, st: (students.get(strOf(c.class_id)) ?? []).sort((a, b) => cmp(strOf(a.stu_id), strOf(b.stu_id))) };
  });
  const deptSpans = [...new Set(classes.map((c) => strOf(c.dept_id)))].map((id) => {
    const mine = cols.filter((k) => strOf(k.c.dept_id) === id);
    return { id, x0: mine[0].x, x1: mine[mine.length - 1].x + colW, n: mine.reduce((a, k) => a + k.st.length, 0) };
  });
  return {
    title: `${classes.length} 个班 · 每班 ${min === max ? min : `${min}–${max}`} 名学生`,
    sub: "一档 = 一名学生（student.class_id）· 档上为姓名 · 按系分组",
    node: (
      <Svg>
        {cols.map((k, i) => {
          const dl = t0 + i * 0.05;
          const top = base - k.st.length * pitch;
          return (
            <g key={strOf(k.c.class_id)}>
              {k.st.map((st, j) => (
                <g key={strOf(st.stu_id)} className="sv-up" style={d(dl + 0.06 + j * 0.035)} data-tip={`${strOf(st.stu_name)} · ${strOf(st.stu_id)} · ${strOf(st.gender) || "性别未填"}`}>
                  <rect x={k.x} y={base - (j + 1) * pitch + 6} width={colW} height={rungH} fill={P} fillOpacity={0.13} />
                  <rect x={k.x} y={base - (j + 1) * pitch + 6} width={3} height={rungH} fill={P} fillOpacity={0.7} />
                  <text x={k.x + colW / 2 + 1.5} y={base - (j + 1) * pitch + 6 + rungH / 2 + 5} fontSize={14} fontWeight={700} fill={P} textAnchor="middle">
                    {strOf(st.stu_name)}
                  </text>
                </g>
              ))}
              <T x={k.x + colW / 2} y={top - 14} size={26} w={900} anchor="middle" dl={dl + 0.2}>
                {k.st.length}
              </T>
              <rect className="sv-right" style={d(dl)} x={k.x} y={base + 6} width={colW} height={2} fill={P} />
              <T x={k.x + colW / 2} y={base + 30} size={13} w={800} anchor="middle" track={0.04} dl={dl + 0.05}>
                {strOf(k.c.class_id)}
              </T>
              <T x={k.x + colW / 2} y={base + 48} size={11} w={600} op={0.55} anchor="middle" dl={dl + 0.08}>
                {strOf(k.c.class_name)}
              </T>
            </g>
          );
        })}
        {deptSpans.map((sp, i) => (
          <g key={sp.id}>
            <path className="sv-right" style={d(t0 + 0.5 + i * 0.08)} d={`M${sp.x0} ${base + 66} v8 H${sp.x1} v-8`} fill="none" stroke={P} strokeOpacity={0.35} />
            <T x={sp.x0} y={base + 100} size={16} w={800} dl={t0 + 0.56 + i * 0.08}>
              {depts.get(sp.id) ?? sp.id}
            </T>
            <T x={sp.x1} y={base + 100} size={13} w={700} op={0.6} anchor="end" dl={t0 + 0.6 + i * 0.08}>
              {`${sp.n} 人`}
            </T>
          </g>
        ))}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ student: surname field

function student(s: Snapshot, t0: number): Shape {
  const classes = new Map(recs(objOf(s, "clazz")).map((r) => [strOf(r.class_id), r]));
  const all = recs(objOf(s, "student")).sort((a, b) => cmp(strOf(a.class_id), strOf(b.class_id)) || cmp(strOf(a.stu_id), strOf(b.stu_id)));
  const groups = [
    { key: "男", en: "MALE", list: all.filter((r) => r.gender === "男") },
    { key: "女", en: "FEMALE", list: all.filter((r) => r.gender === "女") },
    { key: "未填", en: "NULL", list: all.filter((r) => r.gender !== "男" && r.gender !== "女") },
  ].filter((g) => g.list.length || g.key !== "未填");
  const PER = 7;
  const CELL = 52;
  const PITCH = 58;
  const FIELD_W = PER * PITCH - 6;
  const gap = groups.length > 2 ? 24 : SW - FIELD_W * 2;
  return {
    title: `${all.length} 名在籍学生 · ${groups.map((g) => `${g.key} ${g.list.length}`).join(" · ")}`,
    sub: "一格 = 一名学生 · 格中为姓 · 按班级、学号排序 · 悬停查看姓名与班级",
    node: (
      <Svg>
        {groups.map((g, gi) => {
          const x0 = gi * (FIELD_W + gap);
          const dl = t0 + gi * 0.12;
          return (
            <g key={g.key}>
              <T x={x0} y={72} size={72} w={900} dl={dl}>
                {g.list.length}
              </T>
              <T x={x0 + 2} y={100} size={13} w={800} op={0.7} track={0.24} dl={dl + 0.05}>
                {`${g.key} · ${g.en}`}
              </T>
              <rect className="sv-right" style={d(dl + 0.04)} x={x0} y={116} width={FIELD_W} height={2} fill={g.key === "未填" ? RED : P} />
              {g.list.map((st, i) => {
                const cx = x0 + (i % PER) * PITCH;
                const cy = 134 + Math.floor(i / PER) * PITCH;
                const cls = classes.get(strOf(st.class_id));
                return (
                  <g key={strOf(st.stu_id)} className="sv-pop" style={d(dl + 0.1 + i * 0.014)} data-tip={`${strOf(st.stu_name)} · ${strOf(st.stu_id)} · ${strOf(cls?.class_name ?? st.class_id)}`}>
                    <rect x={cx} y={cy} width={CELL} height={CELL} fill={P} fillOpacity={0.09} stroke={P} strokeOpacity={0.2} />
                    <text x={cx + CELL / 2} y={cy + CELL / 2 + 9} fontSize={26} fontWeight={800} fill={P} textAnchor="middle">
                      {strOf(st.stu_name).slice(0, 1)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ course: credit rungs

function course(s: Snapshot, t0: number): Shape {
  const stat = new Map(recs(objOf(s, "v_course_stat")).map((r) => [strOf(r.course_id), r]));
  const rows = recs(objOf(s, "course")).sort((a, b) => (numOf(b.credit) ?? 0) - (numOf(a.credit) ?? 0) || cmp(strOf(a.course_id), strOf(b.course_id)));
  const max = Math.max(1, ...rows.map((r) => numOf(r.credit) ?? 0));
  const tops = rows.filter((r) => numOf(r.credit) === max).map((r) => strOf(r.course_name));
  const pitch = SW / Math.max(1, rows.length);
  const colW = Math.min(34, pitch - 12);
  const rp = Math.min(30, 160 / max);
  const base = 230;
  return {
    title: `${list(tops)}学分最高：${max} 学分 · 共 ${rows.length} 门课`,
    sub: "一档 = 一学分（course.credit）· 按学分排序 · 竖排为课程名 · 底部为选课人数",
    node: (
      <Svg>
        {[1, 2, 3, 4, 5].filter((k) => k <= max).map((k) => (
          <rect key={k} className="sv-right" style={d(t0)} x={0} y={base - k * rp} width={SW} height={1} fill={P} fillOpacity={0.06} />
        ))}
        {rows.map((r, i) => {
          const cr = numOf(r.credit) ?? 0;
          const x = i * pitch + (pitch - colW) / 2;
          const cx = x + colW / 2;
          const dl = t0 + i * 0.035;
          const n = numOf(stat.get(strOf(r.course_id))?.enrolled_count ?? null);
          return (
            <g key={strOf(r.course_id)} data-tip={`${strOf(r.course_name)} · ${strOf(r.course_id)} · ${cr} 学分${n == null ? "" : ` · ${n} 人选修`}`}>
              {Array.from({ length: cr }, (_, j) => (
                <rect key={j} className="sv-up" style={d(dl + j * 0.04)} x={x} y={base - (j + 1) * rp + 4} width={colW} height={rp - 4} fill={cr === max ? YEL : P} fillOpacity={cr === max ? 1 : 0.86} />
              ))}
              <T x={cx} y={base - cr * rp - 10} size={20} w={900} anchor="middle" dl={dl + 0.16}>
                {cr}
              </T>
              <T x={cx} y={base + 22} size={11} w={700} op={0.55} anchor="middle" dl={dl + 0.06}>
                {strOf(r.course_id)}
              </T>
              <T x={cx - 7} y={base + 36} size={15} w={700} op={0.92} dl={dl + 0.1} vertical>
                {strOf(r.course_name)}
              </T>
              <T x={cx} y={SH - 14} size={13} w={800} op={n ? 0.8 : 0.35} anchor="middle" dl={dl + 0.14} fill={n ? P : RED}>
                {n == null ? "—" : n}
              </T>
            </g>
          );
        })}
        <rect className="sv-right" style={d(t0)} x={0} y={base} width={SW} height={2} fill={P} />
        <rect className="sv-right" style={d(t0 + 0.4)} x={0} y={SH - 40} width={SW} height={1} fill={P} fillOpacity={0.2} />
        <T x={0} y={SH - 48} size={11} op={0.5} track={0.2} dl={t0 + 0.4}>
          ENROLLED · 选课人数
        </T>
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ enroll: rung histogram

function enroll(s: Snapshot, t0: number): Shape {
  const pass = passLine(s);
  const rows = recs(objOf(s, "enroll"));
  const scored = rows.map((r) => numOf(r.score)).filter((x): x is number => x != null);
  const nulls = rows.length - scored.length;
  const bins = Array.from({ length: 20 }, () => [] as number[]);
  for (const sc of scored) bins[Math.min(19, Math.floor(sc / 5))].push(sc);
  bins.forEach((b) => b.sort((a, c) => a - c));
  const fails = pass == null ? 0 : scored.filter((x) => x < pass).length;
  const peak = Math.max(1, ...bins.map((b) => b.length));
  const pitch = Math.min(6, 330 / peak);
  const base = 420;
  const X = (v: number) => 30 + (v / 100) * 820;
  const bw = (820 / 20) * 0.74;
  return {
    title:
      pass == null
        ? `${rows.length} 条选修 · 及格线缺失（v_domain_rule）`
        : `${rows.length} 条选修 · ${fails} 条低于及格线（${((fails / Math.max(1, scored.length)) * 100).toFixed(1)}%）`,
    sub: "一档 = 一条选修记录（enroll.score）· 每 5 分一组 · 红 = 低于及格线",
    node: (
      <Svg>
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) => (
          <g key={v}>
            <rect className="sv-up" style={d(t0 + i * 0.02)} x={X(v)} y={base + 4} width={1} height={8} fill={P} fillOpacity={0.4} />
            <T x={X(v)} y={base + 30} size={12} op={0.55} anchor="middle" dl={t0 + i * 0.02}>
              {v}
            </T>
          </g>
        ))}
        {bins.map((b, i) =>
          b.map((sc, j) => (
            <rect
              key={`${i}-${j}`}
              className="sv-up"
              style={d(t0 + 0.1 + i * 0.03 + j * 0.006)}
              x={X(i * 5) + (820 / 20 - bw) / 2}
              y={base - (j + 1) * pitch}
              width={bw}
              height={Math.max(1.5, pitch - 1.6)}
              fill={pass != null && sc < pass ? RED : P}
              fillOpacity={pass != null && sc < pass ? 1 : 0.9}
            />
          )),
        )}
        {bins.map((b, i) =>
          b.length ? (
            <T key={i} x={X(i * 5 + 2.5)} y={base - b.length * pitch - 9} size={13} w={800} anchor="middle" dl={t0 + 0.4 + i * 0.03} tip={`${i * 5}–${i === 19 ? 100 : i * 5 + 4.99} 分 · ${b.length} 条`}>
              {b.length}
            </T>
          ) : null,
        )}
        <rect className="sv-right" style={d(t0)} x={X(0)} y={base} width={820} height={2} fill={P} />
        {pass != null && (
          <g>
            <rect className="sv-down" style={d(t0 + 0.5)} x={X(pass) - 1} y={44} width={2} height={base - 40} fill={RED} />
            <T x={X(pass) + 10} y={58} size={14} w={800} fill={RED} dl={t0 + 0.6}>
              {`及格线 ${fmt(pass)}`}
            </T>
            <T x={X(pass) + 10} y={76} size={11} op={0.55} track={0.1} dl={t0 + 0.64}>
              v_domain_rule
            </T>
            <T x={X(pass) - 14} y={118} size={56} w={900} fill={RED} anchor="end" dl={t0 + 0.7}>
              {fails}
            </T>
            <T x={X(pass) - 14} y={140} size={12} op={0.7} anchor="end" track={0.16} dl={t0 + 0.74}>
              条低于及格线
            </T>
          </g>
        )}
        <T x={SW} y={SH - 12} size={12} op={nulls ? 1 : 0.5} fill={nulls ? RED : P} anchor="end" dl={t0 + 0.8}>
          {`score 为 NULL（未考）· ${nulls} 条`}
        </T>
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ teacher: teaching blocks

function teacher(s: Snapshot, t0: number): Shape {
  const depts = recs(objOf(s, "department")).sort((a, b) => cmp(strOf(a.dept_id), strOf(b.dept_id)));
  const courses = new Map(recs(objOf(s, "course")).map((r) => [strOf(r.course_id), strOf(r.course_name)]));
  const teaching = by(recs(objOf(s, "teaching")), "teacher_id");
  const all = recs(objOf(s, "teacher"));
  const byDept = by(all, "dept_id");
  const admin = all.find((r) => r.teacher_id === "T001");
  const ROW = 34;
  const HEAD = 30;
  let y = 0;
  let k = 0;
  return {
    title: `${all.length} 位教师 · ${admin ? `${strOf(admin.teacher_name)}（T001）为唯一管理员` : "未找到管理员 T001"}`,
    sub: "一块 = 一条授课（teaching）· 按系分组 · 管理员本身也是教师",
    node: (
      <Svg>
        {depts.map((dp) => {
          const list = (byDept.get(strOf(dp.dept_id)) ?? []).sort((a, b) => cmp(strOf(a.teacher_id), strOf(b.teacher_id)));
          const hy = y;
          y += HEAD;
          const dl0 = t0 + k * 0.03;
          return (
            <g key={strOf(dp.dept_id)}>
              <T x={0} y={hy + 19} size={13} w={800} op={0.75} track={0.2} dl={dl0}>
                {`${strOf(dp.dept_name)} · ${list.length} 位`}
              </T>
              <rect className="sv-right" style={d(dl0 + 0.04)} x={150} y={hy + 14} width={SW - 150} height={1} fill={P} fillOpacity={0.14} />
              {list.map((tc) => {
                const ty = y;
                y += ROW;
                const dl = t0 + ++k * 0.035;
                const mine = (teaching.get(strOf(tc.teacher_id)) ?? []).sort((a, b) => cmp(strOf(a.course_id), strOf(b.course_id)));
                const isAdmin = tc.teacher_id === "T001";
                return (
                  <g key={strOf(tc.teacher_id)}>
                    <T x={0} y={ty + 22} size={12} op={0.55} track={0.06} dl={dl}>
                      {strOf(tc.teacher_id)}
                    </T>
                    <T x={56} y={ty + 23} size={17} w={800} dl={dl + 0.02}>
                      {strOf(tc.teacher_name)}
                    </T>
                    {isAdmin && (
                      <g className="sv-pop" style={d(dl + 0.2)}>
                        <rect x={128} y={ty + 8} width={62} height={20} fill={YEL} />
                        <text x={159} y={ty + 22.5} fontSize={11} fontWeight={900} fill={INK} textAnchor="middle" letterSpacing="0.12em">
                          ADMIN
                        </text>
                      </g>
                    )}
                    {mine.map((m, j) => (
                      <g key={strOf(m.course_id)} className="sv-right" style={d(dl + 0.06 + j * 0.05)} data-tip={`${strOf(tc.teacher_name)} 讲授 ${courses.get(strOf(m.course_id)) ?? strOf(m.course_id)}`}>
                        <rect x={220 + j * 196} y={ty + 6} width={188} height={24} fill={P} fillOpacity={0.12} />
                        <rect x={220 + j * 196} y={ty + 6} width={3} height={24} fill={P} />
                        <text x={232 + j * 196} y={ty + 23} fontSize={13} fontWeight={700} fill={P}>
                          {courses.get(strOf(m.course_id)) ?? strOf(m.course_id)}
                        </text>
                        <text x={220 + j * 196 + 180} y={ty + 23} fontSize={11} fontWeight={700} fill={P} fillOpacity={0.5} textAnchor="end">
                          {strOf(m.course_id)}
                        </text>
                      </g>
                    ))}
                    <T x={SW} y={ty + 24} size={20} w={900} anchor="end" dl={dl + 0.1}>
                      {mine.length}
                    </T>
                  </g>
                );
              })}
            </g>
          );
        })}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ teaching: threads

function Threads({ s, t0 }: { s: Snapshot; t0: number }) {
  const [focus, setFocus] = useState<string | null>(null);
  const tch = recs(objOf(s, "teacher")).sort((a, b) => cmp(strOf(a.dept_id), strOf(b.dept_id)) || cmp(strOf(a.teacher_id), strOf(b.teacher_id)));
  const crs = recs(objOf(s, "course")).sort((a, b) => cmp(strOf(a.course_id), strOf(b.course_id)));
  const links = recs(objOf(s, "teaching"));
  const ty = new Map(tch.map((r, i) => [strOf(r.teacher_id), 22 + (i * (SH - 44)) / Math.max(1, tch.length - 1)]));
  const cy = new Map(crs.map((r, i) => [strOf(r.course_id), 14 + (i * (SH - 28)) / Math.max(1, crs.length - 1)]));
  const deg = by(links, "course_id");
  const LX = 220;
  const RX = 640;
  const on = (l: Rec) => focus != null && (l.teacher_id === focus || l.course_id === focus);
  return (
    <Svg>
      <g onPointerLeave={() => setFocus(null)}>
        {links.map((l, i) => {
          const y1 = ty.get(strOf(l.teacher_id));
          const y2 = cy.get(strOf(l.course_id));
          if (y1 == null || y2 == null) return null;
          const hot = on(l);
          return (
            <path
              key={i}
              className="sv-draw ad-thread"
              data-on={hot ? "" : undefined}
              data-dim={focus && !hot ? "" : undefined}
              style={d(t0 + 0.2 + i * 0.025)}
              d={`M${LX} ${y1} C${(LX + RX) / 2} ${y1} ${(LX + RX) / 2} ${y2} ${RX} ${y2}`}
              pathLength={1}
            />
          );
        })}
        {tch.map((r, i) => {
          const y = ty.get(strOf(r.teacher_id))!;
          const id = strOf(r.teacher_id);
          const hot = focus === id || links.some((l) => on(l) && l.teacher_id === id);
          return (
            <g key={id} className="ad-node" data-on={hot ? "" : undefined} onPointerEnter={() => setFocus(id)}>
              <rect x={0} y={y - 14} width={LX + 6} height={28} fill="transparent" />
              <T x={LX - 16} y={y + 5} size={15} w={hot ? 900 : 700} anchor="end" dl={t0 + i * 0.03}>
                {strOf(r.teacher_name)}
              </T>
              <T x={LX - 16 - 62} y={y + 5} size={11} op={0.5} anchor="end" dl={t0 + i * 0.03}>
                {id}
              </T>
              <rect className="sv-pop" style={d(t0 + i * 0.03)} x={LX - 5} y={y - 5} width={10} height={10} fill={hot ? YEL : P} />
            </g>
          );
        })}
        {crs.map((r, i) => {
          const y = cy.get(strOf(r.course_id))!;
          const id = strOf(r.course_id);
          const n = (deg.get(id) ?? []).length;
          const hot = focus === id || links.some((l) => on(l) && l.course_id === id);
          return (
            <g key={id} className="ad-node" data-on={hot ? "" : undefined} onPointerEnter={() => setFocus(id)}>
              <rect x={RX - 6} y={y - 13} width={SW - RX + 6} height={26} fill="transparent" />
              <rect className="sv-pop" style={d(t0 + 0.1 + i * 0.025)} x={RX - 5} y={y - 5} width={10} height={10} fill={n ? (hot ? YEL : P) : "none"} stroke={n ? "none" : RED} strokeWidth={1.5} />
              <T x={RX + 16} y={y + 5} size={14} w={hot ? 900 : 600} dl={t0 + 0.1 + i * 0.025} fill={n ? P : RED}>
                {strOf(r.course_name)}
              </T>
              <T x={SW} y={y + 5} size={12} w={800} op={n > 1 ? 1 : 0.45} anchor="end" dl={t0 + 0.1 + i * 0.025} fill={n > 1 ? YEL : n ? P : RED}>
                {n ? `×${n}` : "无人授课"}
              </T>
            </g>
          );
        })}
      </g>
    </Svg>
  );
}

function teaching(s: Snapshot, t0: number): Shape {
  const links = recs(objOf(s, "teaching"));
  const deg = by(links, "course_id");
  const crs = recs(objOf(s, "course"));
  const none = crs.filter((c) => !deg.has(strOf(c.course_id))).length;
  const co = [...deg.values()].filter((v) => v.length > 1).length;
  return {
    title: `${links.length} 条授课 · ${none ? `${none} 门课尚无任课教师` : co ? `${co} 门课由两位以上教师讲授` : "每门课恰有一位教师"}`,
    sub: "一线 = 一条授课记录（teaching）· 右侧 ×n = 讲授该课的教师数 · 悬停教师或课程追踪",
    node: <Threads s={s} t0={t0} />,
  };
}

// ------------------------------------------------------------------ graduation_requirement

function graduation(s: Snapshot, t0: number): Shape {
  const depts = recs(objOf(s, "department")).sort((a, b) => cmp(strOf(a.dept_id), strOf(b.dept_id)));
  const req = new Map(recs(objOf(s, "graduation_requirement")).map((r) => [strOf(r.dept_id), numOf(r.required_credit)]));
  const credit = by(recs(objOf(s, "v_student_credit")), "dept_id");
  const cols = depts.map((dp) => {
    const r = req.get(strOf(dp.dept_id)) ?? null;
    const st = (credit.get(strOf(dp.dept_id)) ?? []).sort((a, b) => (numOf(b.earned_credit) ?? 0) - (numOf(a.earned_credit) ?? 0));
    const met = r == null ? 0 : st.filter((x) => (numOf(x.earned_credit) ?? 0) >= r).length;
    return { dp, r, st, met };
  });
  const top = [...cols].filter((c) => c.r != null).sort((a, b) => (b.r ?? 0) - (a.r ?? 0))[0];
  const colW = (SW - (cols.length - 1) * 40) / Math.max(1, cols.length);
  return {
    title: top ? `${strOf(top.dp.dept_name)}毕业要求最高：${top.r} 学分` : "尚未设置任何毕业要求",
    sub: "一格 = 一学分（required_credit）· 下方一竖 = 本系一名学生，黄 = 已修满（v_student_credit）",
    node: (
      <Svg>
        {cols.map((c, i) => {
          const x0 = i * (colW + 40);
          const dl = t0 + i * 0.12;
          const per = 12;
          const cell = (colW - (per - 1) * 4) / per;
          const tick = Math.min(14, (colW + 4) / Math.max(1, c.st.length));
          return (
            <g key={strOf(c.dp.dept_id)}>
              <T x={x0} y={30} size={22} w={900} dl={dl}>
                {strOf(c.dp.dept_name)}
              </T>
              <T x={x0} y={52} size={12} op={0.55} track={0.2} dl={dl + 0.04}>
                {strOf(c.dp.dept_id)}
              </T>
              <rect className="sv-right" style={d(dl + 0.02)} x={x0} y={66} width={colW} height={2} fill={c.r == null ? RED : P} />
              <T x={x0 - 4} y={196} size={128} w={900} fill={c.r == null ? RED : P} dl={dl + 0.08}>
                {c.r == null ? "—" : c.r}
              </T>
              <T x={x0 + 2} y={222} size={14} w={700} op={0.7} track={0.1} dl={dl + 0.12}>
                {c.r == null ? "未设置毕业要求" : "学分 · REQUIRED"}
              </T>
              {Array.from({ length: c.r ?? 0 }, (_, j) => (
                <rect key={j} className="sv-pop" style={d(dl + 0.16 + j * 0.012)} x={x0 + (j % per) * (cell + 4)} y={244 + Math.floor(j / per) * (cell + 4)} width={cell} height={cell} fill={P} fillOpacity={0.8} />
              ))}
              <T x={x0} y={396} size={14} w={800} dl={dl + 0.3}>
                {c.r == null ? `${c.st.length} 名学生无法判定` : `已修满 ${c.met} / ${c.st.length} 人`}
              </T>
              {c.st.map((st, j) => {
                const e = numOf(st.earned_credit) ?? 0;
                const ok = c.r != null && e >= c.r;
                return (
                  <rect
                    key={strOf(st.stu_id)}
                    className="sv-up"
                    style={d(dl + 0.34 + j * 0.012)}
                    x={x0 + j * tick}
                    y={412}
                    width={Math.max(3, tick - 5)}
                    height={56}
                    fill={c.r == null ? P : ok ? YEL : RED}
                    fillOpacity={c.r == null ? 0.3 : 1}
                    data-tip={`${strOf(st.stu_name)} · 已修 ${e} 学分${c.r == null ? "" : ok ? " · 已修满" : ` · 还差 ${c.r - e}`}`}
                  />
                );
              })}
              <T x={x0} y={496} size={12} op={0.55} dl={dl + 0.4}>
                按已修学分由高到低
              </T>
            </g>
          );
        })}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ issued_student_id: ledger

function ledger(s: Snapshot, t0: number): Shape {
  const issued = recs(objOf(s, "issued_student_id")).sort((a, b) => cmp(strOf(a.stu_id), strOf(b.stu_id)));
  const live = new Set(recs(objOf(s, "student")).map((r) => strOf(r.stu_id)));
  const voids = issued.filter((r) => !live.has(strOf(r.stu_id)));
  const n = Math.max(1, issued.length);
  const pitch = Math.min(18, SW / n);
  const bw = Math.max(2, pitch * 0.56);
  const X = (i: number) => i * pitch + (pitch - bw) / 2;
  // issued is sorted by id, so each enrolment year is one contiguous run
  const spans: { y: string; i0: number; i1: number; n: number }[] = [];
  issued.forEach((r, i) => {
    const y = strOf(r.stu_id).slice(0, 4);
    const last = spans[spans.length - 1];
    if (last && last.y === y) {
      last.i1 = i;
      last.n++;
    } else spans.push({ y, i0: i, i1: i, n: 1 });
  });
  // issue times: identical timestamps form one stack of units
  const times = by(issued, "issued_at");
  const stamps = [...times.keys()].sort();
  const parse = (t: string) => new Date(t.replace(" ", "T")).getTime();
  const tMin = parse(stamps[0] ?? "");
  const tMax = parse(stamps[stamps.length - 1] ?? "");
  const TX = (t: string) => (tMax > tMin ? 40 + ((parse(t) - tMin) / (tMax - tMin)) * (SW - 260) : SW / 2);
  return {
    title: `${issued.length} 个学号已发放 · ${voids.length ? `${voids.length} 个空号永不复用` : "没有空号"}`,
    sub: "一竖 = 一个发放过的学号（按学号排序）· 红框 = 学生已删除、学号仍占用 · 下方为发放时间",
    node: (
      <Svg>
        {issued.map((r, i) => {
          const id = strOf(r.stu_id);
          const dead = !live.has(id);
          return (
            <rect
              key={id}
              className="sv-up"
              style={d(t0 + i * 0.01)}
              x={X(i)}
              y={96}
              width={bw}
              height={190}
              fill={dead ? "none" : P}
              fillOpacity={dead ? 1 : 0.88}
              stroke={dead ? RED : "none"}
              strokeWidth={dead ? 2 : 0}
              data-tip={`${id} · ${dead ? "空号：学生已删除，学号永久占用" : "在籍"} · 发放于 ${strOf(r.issued_at)}`}
            />
          );
        })}
        {voids.map((r, k) => {
          const i = issued.indexOf(r);
          const x = X(i) + bw / 2;
          const right = x > SW - 220;
          return (
            <g key={strOf(r.stu_id)}>
              <rect className="sv-up" style={d(t0 + 0.6 + k * 0.1)} x={x - 1} y={40} width={2} height={50} fill={RED} />
              <T x={right ? x - 10 : x + 10} y={54} size={16} w={900} fill={RED} anchor={right ? "end" : "start"} dl={t0 + 0.7 + k * 0.1}>
                {`${strOf(r.stu_id)} · 空号`}
              </T>
              <T x={right ? x - 10 : x + 10} y={74} size={12} op={0.7} anchor={right ? "end" : "start"} dl={t0 + 0.74 + k * 0.1}>
                学生已删除 · 学号永久占用
              </T>
            </g>
          );
        })}
        {spans.map((sp, i) => {
          // only the last run may hang its label from the right edge
          const end = i === spans.length - 1 && i > 0;
          return (
            <g key={sp.y}>
              <path className="sv-right" style={d(t0 + 0.4 + i * 0.1)} d={`M${X(sp.i0)} 298 v8 H${X(sp.i1) + bw} v-8`} fill="none" stroke={P} strokeOpacity={0.35} />
              <T x={end ? X(sp.i1) + bw : X(sp.i0)} y={330} size={14} w={800} anchor={end ? "end" : "start"} dl={t0 + 0.46 + i * 0.1}>
                {`${sp.y} 级 · ${sp.n} 个`}
              </T>
            </g>
          );
        })}
        <T x={0} y={392} size={12} w={800} op={0.7} track={0.24} dl={t0 + 0.6}>
          ISSUED AT · 发放时间
        </T>
        <rect className="sv-right" style={d(t0 + 0.6)} x={0} y={SH - 36} width={SW} height={1} fill={P} fillOpacity={0.3} />
        {stamps.map((st, i) => {
          const rs = times.get(st)!;
          const ROWS = 8;
          const x0 = TX(st);
          const cols = Math.ceil(rs.length / ROWS);
          return (
            <g key={st} data-tip={`${st} · 发放 ${rs.length} 个`}>
              {rs.map((r, j) => {
                const dead = !live.has(strOf(r.stu_id));
                return (
                  <rect
                    key={strOf(r.stu_id)}
                    className="sv-pop"
                    style={d(t0 + 0.7 + i * 0.1 + j * 0.006)}
                    x={x0 + Math.floor(j / ROWS) * 11}
                    y={SH - 48 - (j % ROWS) * 11}
                    width={8}
                    height={8}
                    fill={dead ? "none" : P}
                    stroke={dead ? RED : "none"}
                    strokeWidth={1.5}
                  />
                );
              })}
              <T x={x0 + cols * 11 + 6} y={SH - 52} size={13} w={800} dl={t0 + 0.8 + i * 0.1}>
                {`×${rs.length}`}
              </T>
              <T x={x0} y={SH - 14} size={12} op={0.6} dl={t0 + 0.8 + i * 0.1}>
                {st.slice(5)}
              </T>
            </g>
          );
        })}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ v_domain_rule: the one line

function domainRule(s: Snapshot, t0: number): Shape {
  const pass = passLine(s);
  const scores = recs(objOf(s, "enroll"))
    .map((r) => numOf(r.score))
    .filter((x): x is number => x != null);
  const readers = s.objects.filter((o) => o.deps.includes("v_domain_rule")).map((o) => o.name);
  const X0 = 360;
  const XW = 500;
  const X = (v: number) => X0 + (v / 100) * XW;
  const stacks = new Map<number, number>();
  const base = 300;
  const fails = pass == null ? 0 : scores.filter((x) => x < pass).length;
  const [ip, dp] = pass == null ? ["—", ""] : fmt(pass).includes(".") ? fmt(pass).split(".") : [fmt(pass), "0"];
  const refs: [string, string][] = [
    ...readers.map((r) => [r, r === "v_student_credit" ? "学业情况 · 只计及格课程的学分" : r === "v_course_stat" ? "课程统计 · 不及格人数与均分达标" : "视图"] as [string, string]),
    ["ai/dbcore.py", "pass_line() · Python 数据层读取，不硬编码"],
  ];
  return {
    title: pass == null ? "及格线缺失：v_domain_rule 没有返回值" : `及格线只定义一次：${fmt(pass)}`,
    sub: "一点 = 一条选修成绩（enroll.score）· 红 = 低于及格线 · 其余视图与 Python 都引用这一行",
    node: (
      <Svg>
        <T x={0} y={92} size={13} w={800} op={0.7} track={0.24} dl={t0}>
          PASS LINE · 及格线
        </T>
        <T x={-8} y={286} size={220} w={900} fill={pass == null ? RED : P} dl={t0 + 0.06}>
          {ip}
        </T>
        {dp && (
          <T x={8 + ip.length * 122} y={286} size={64} w={900} op={0.6} dl={t0 + 0.12}>
            {`.${dp}`}
          </T>
        )}
        {scores
          .slice()
          .sort((a, b) => a - b)
          .map((sc, i) => {
            const k = Math.round(sc);
            const h = stacks.get(k) ?? 0;
            stacks.set(k, h + 1);
            return (
              <rect
                key={i}
                className="sv-pop"
                style={d(t0 + 0.2 + (k / 100) * 0.6 + h * 0.01)}
                x={X(k) - 2}
                y={base - 6 - h * 6}
                width={4.4}
                height={4.4}
                fill={pass != null && sc < pass ? RED : P}
                fillOpacity={pass != null && sc < pass ? 1 : 0.85}
              />
            );
          })}
        <rect className="sv-right" style={d(t0 + 0.1)} x={X0} y={base} width={XW} height={2} fill={P} />
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <T key={v} x={X(v)} y={base + 22} size={12} op={0.5} anchor="middle" dl={t0 + 0.2}>
            {v}
          </T>
        ))}
        {pass != null && (
          <g>
            <rect className="sv-down" style={d(t0 + 0.5)} x={X(pass) - 1} y={60} width={2} height={base - 50} fill={RED} />
            <T x={X(pass) - 12} y={base + 54} size={20} w={900} fill={RED} anchor="end" dl={t0 + 0.8}>
              {`${fails} 条 < ${fmt(pass)}`}
            </T>
            <T x={X(pass) + 12} y={base + 54} size={20} w={900} dl={t0 + 0.84}>
              {`${scores.length - fails} 条 ≥ ${fmt(pass)}`}
            </T>
          </g>
        )}
        <T x={0} y={414} size={12} w={800} op={0.7} track={0.24} dl={t0 + 0.6}>
          REFERENCED BY · 引用此常量
        </T>
        <rect className="sv-right" style={d(t0 + 0.62)} x={0} y={424} width={SW} height={1} fill={P} fillOpacity={0.18} />
        {refs.map(([name, what], i) => (
          <g key={name}>
            <rect className="sv-pop" style={d(t0 + 0.7 + i * 0.06)} x={0} y={442 + i * 30} width={8} height={8} fill={YEL} />
            <T x={20} y={451 + i * 30} size={15} w={800} dl={t0 + 0.7 + i * 0.06}>
              {name}
            </T>
            <T x={250} y={451 + i * 30} size={13} w={600} op={0.7} dl={t0 + 0.74 + i * 0.06}>
              {what}
            </T>
          </g>
        ))}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ v_student_credit: lollipops

function studentCredit(s: Snapshot, t0: number): Shape {
  const rows = recs(objOf(s, "v_student_credit")).sort((a, b) => cmp(strOf(a.class_id), strOf(b.class_id)) || cmp(strOf(a.stu_id), strOf(b.stu_id)));
  const classes = [...new Set(rows.map((r) => strOf(r.class_id)))];
  const GAP = 18;
  const pitch = (SW - 40 - (classes.length - 1) * GAP) / Math.max(1, rows.length);
  const yMax = Math.max(10, ...rows.map((r) => Math.max(numOf(r.earned_credit) ?? 0, numOf(r.required_credit) ?? 0))) + 4;
  const base = 400;
  const Y = (v: number) => base - (v / yMax) * 340;
  let x = 40;
  let prev = "";
  const pts = rows.map((r) => {
    if (prev && r.class_id !== prev) x += GAP;
    prev = strOf(r.class_id);
    const px = x + pitch / 2;
    x += pitch;
    const e = numOf(r.earned_credit) ?? 0;
    const q = numOf(r.required_credit);
    return { r, x: px, e, q, ok: q != null && e >= q };
  });
  const short = pts.filter((p) => p.q != null && !p.ok);
  const unknown = pts.filter((p) => p.q == null).length;
  const depts = [...new Set(rows.map((r) => strOf(r.dept_id)))].map((id) => {
    const mine = pts.filter((p) => strOf(p.r.dept_id) === id);
    return { id, name: strOf(mine[0].r.dept_name), x0: mine[0].x - pitch / 2, x1: mine[mine.length - 1].x + pitch / 2, q: mine[0].q, short: mine.filter((p) => p.q != null && !p.ok).length, n: mine.length };
  });
  const groups = classes.map((c) => {
    const mine = pts.filter((p) => strOf(p.r.class_id) === c);
    return { c, x: (mine[0].x + mine[mine.length - 1].x) / 2 };
  });
  const lo = [...pts].sort((a, b) => a.e - b.e)[0];
  const hi = [...pts].sort((a, b) => b.e - a.e)[0];
  return {
    title: short.length ? `${short.length} 名学生尚未修满毕业学分` : unknown ? `${unknown} 名学生所在系未设毕业要求` : "全部学生已修满毕业学分",
    sub: "一竖 = 一名学生 · 高 = 已修学分（仅计及格课程）· 黄虚线 = 本系毕业要求 · 红点 = 未修满",
    node: (
      <Svg>
        <defs>
          <pattern id="ad-dash" width="10" height="2" patternUnits="userSpaceOnUse">
            <rect width="6" height="2" fill={YEL} />
          </pattern>
        </defs>
        {[0, 10, 20, 30, 40].filter((v) => v < yMax).map((v) => (
          <g key={v}>
            <rect className="sv-right" style={d(t0)} x={40} y={Y(v)} width={SW - 40} height={1} fill={P} fillOpacity={v === 0 ? 0.6 : 0.08} />
            <T x={0} y={Y(v) + 4} size={11} op={0.5} dl={t0}>
              {v}
            </T>
          </g>
        ))}
        {pts.map((p, i) => (
          <g key={strOf(p.r.stu_id)} data-tip={`${strOf(p.r.stu_name)} · ${strOf(p.r.stu_id)} · 已修 ${p.e}${p.q == null ? " · 未设要求" : ` / ${p.q}`} · 不及格 ${numOf(p.r.failed_count) ?? 0} 门`}>
            <rect className="sv-up" style={d(t0 + 0.1 + i * 0.012)} x={p.x - 0.9} y={Y(p.e)} width={1.8} height={base - Y(p.e)} fill={P} fillOpacity={0.5} />
            <circle className="sv-pop" style={d(t0 + 0.3 + i * 0.012)} cx={p.x} cy={Y(p.e)} r={4.6} fill={p.q == null ? "none" : p.ok ? P : RED} stroke={p.q == null ? P : "none"} strokeOpacity={0.6} />
            <rect x={p.x - pitch / 2} y={Y(p.e) - 8} width={pitch} height={base - Y(p.e) + 8} fill="transparent" />
          </g>
        ))}
        {depts.map((dp, i) =>
          dp.q == null ? null : (
            <g key={dp.id}>
              <rect className="sv-right" style={d(t0 + 0.6 + i * 0.1)} x={dp.x0} y={Y(dp.q) - 1} width={dp.x1 - dp.x0} height={2} fill="url(#ad-dash)" />
            </g>
          ),
        )}
        {groups.map((g, i) => (
          <T key={g.c} x={g.x} y={base + 20} size={11} w={700} op={0.6} anchor="middle" dl={t0 + 0.2 + i * 0.03}>
            {g.c}
          </T>
        ))}
        {depts.map((dp, i) => (
          <g key={dp.id}>
            <path className="sv-right" style={d(t0 + 0.4 + i * 0.08)} d={`M${dp.x0} ${base + 32} v6 H${dp.x1} v-6`} fill="none" stroke={P} strokeOpacity={0.3} />
            <T x={dp.x0} y={base + 60} size={14} w={800} dl={t0 + 0.44 + i * 0.08}>
              {dp.name}
            </T>
            <T x={dp.x0} y={base + 80} size={12} w={700} fill={dp.q == null ? RED : YEL} dl={t0 + 0.5 + i * 0.08}>
              {dp.q == null ? "未设毕业要求" : `毕业 ${dp.q} 学分`}
            </T>
            <T x={dp.x1} y={base + 60} size={14} w={900} anchor="end" fill={dp.short ? RED : P} dl={t0 + 0.5 + i * 0.08}>
              {`${dp.short} / ${dp.n}`}
            </T>
            <T x={dp.x1} y={base + 80} size={11} w={700} op={0.55} anchor="end" dl={t0 + 0.54 + i * 0.08}>
              未修满
            </T>
          </g>
        ))}
        {lo && (
          <g>
            <rect className="sv-right" style={d(t0 + 0.9)} x={lo.x + 7} y={Y(lo.e) - 0.5} width={16} height={1} fill={RED} />
            <T x={lo.x + 27} y={Y(lo.e) + 4} size={13} w={800} fill={RED} dl={t0 + 0.94} halo>
              {`${strOf(lo.r.stu_name)} · ${lo.e} 学分`}
            </T>
          </g>
        )}
        {hi && hi !== lo && (
          <T x={hi.x} y={Y(hi.e) - 12} size={13} w={800} anchor="middle" dl={t0 + 0.94} halo>
            {`${strOf(hi.r.stu_name)} · ${hi.e}`}
          </T>
        )}
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ v_course_stat: score strips

function courseStat(s: Snapshot, t0: number): Shape {
  const pass = passLine(s);
  const scores = by(recs(objOf(s, "enroll")), "course_id");
  const rows = recs(objOf(s, "v_course_stat")).sort((a, b) => {
    const x = numOf(a.avg_score);
    const y = numOf(b.avg_score);
    return x == null ? 1 : y == null ? -1 : x - y;
  });
  const ROW = Math.min(27, (SH - 40) / Math.max(1, rows.length));
  const X0 = 184;
  const XW = 560;
  const X = (v: number) => X0 + (v / 100) * XW;
  const low = rows.find((r) => numOf(r.avg_score) != null);
  const empty = rows.filter((r) => numOf(r.avg_score) == null).length;
  const bottom = rows.length * ROW;
  return {
    title: low ? `「${strOf(low.course_name)}」均分最低：${fmt(numOf(low.avg_score)!)} 分${empty ? ` · ${empty} 门课尚无成绩` : ""}` : "尚无任何成绩",
    sub: "一竖 = 一条成绩（enroll）· 白块 = 均分（视图计算）· 红线 = 及格线 · 右列 = 不及格人数",
    node: (
      <Svg>
        {rows.map((r, i) => {
          const y = i * ROW;
          const avg = numOf(r.avg_score);
          const fail = numOf(r.fail_count) ?? 0;
          const dl = t0 + i * 0.03;
          const list = (scores.get(strOf(r.course_id)) ?? []).map((e) => numOf(e.score)).filter((x): x is number => x != null);
          return (
            <g key={strOf(r.course_id)} data-tip={`${strOf(r.course_name)} · ${numOf(r.enrolled_count) ?? 0} 人 · 均分 ${avg == null ? "无" : fmt(avg)} · 不及格 ${fail}`}>
              <rect x={0} y={y} width={SW} height={ROW} fill="transparent" />
              <T x={X0 - 18} y={y + ROW / 2 + 5} size={14} w={700} anchor="end" dl={dl} fill={avg == null ? RED : P} op={avg == null ? 0.9 : 1}>
                {strOf(r.course_name)}
              </T>
              <rect className="sv-right" style={d(dl)} x={X0} y={y + ROW / 2} width={XW} height={1} fill={P} fillOpacity={0.1} />
              {list.map((sc, j) => (
                <rect key={j} className="sv-up" style={d(dl + 0.08 + j * 0.004)} x={X(sc) - 0.8} y={y + ROW / 2 - 7} width={1.6} height={14} fill={pass != null && sc < pass ? RED : P} fillOpacity={0.55} />
              ))}
              {avg != null ? (
                <rect className="sv-up" style={d(dl + 0.24)} x={X(avg) - 2} y={y + ROW / 2 - 11} width={4} height={22} fill={pass != null && avg < pass ? RED : P} />
              ) : (
                <T x={X0 + 10} y={y + ROW / 2 + 4} size={12} w={700} fill={RED} dl={dl + 0.1}>
                  NULL · 尚无成绩，不按 0 计
                </T>
              )}
              <T x={X0 + XW + 18} y={y + ROW / 2 + 5} size={14} w={800} dl={dl + 0.2} op={avg == null ? 0.4 : 1}>
                {avg == null ? "—" : fmt(avg)}
              </T>
              <T x={SW} y={y + ROW / 2 + 5} size={14} w={900} anchor="end" fill={fail ? RED : P} op={fail ? 1 : 0.3} dl={dl + 0.22}>
                {fail}
              </T>
            </g>
          );
        })}
        {pass != null && (
          <g>
            <rect className="sv-down" style={d(t0 + 0.5)} x={X(pass) - 0.75} y={-4} width={1.5} height={bottom + 8} fill={RED} />
            <T x={X(pass)} y={bottom + 24} size={12} w={800} fill={RED} anchor="middle" dl={t0 + 0.6}>
              {`及格线 ${fmt(pass)}`}
            </T>
          </g>
        )}
        {[0, 20, 40, 80, 100].map((v) => (
          <T key={v} x={X(v)} y={bottom + 24} size={11} op={0.45} anchor="middle" dl={t0 + 0.5}>
            {v}
          </T>
        ))}
        <T x={X0 + XW + 18} y={bottom + 24} size={11} op={0.5} track={0.12} dl={t0 + 0.5}>
          均分
        </T>
        <T x={SW} y={bottom + 24} size={11} op={0.5} anchor="end" track={0.12} dl={t0 + 0.5}>
          不及格
        </T>
      </Svg>
    ),
  };
}

// ------------------------------------------------------------------ v_teacher_course: the join

function Join({ s, t0 }: { s: Snapshot; t0: number }) {
  const [focus, setFocus] = useState<number | null>(null);
  const view = recs(objOf(s, "v_teacher_course"));
  const tch = recs(objOf(s, "teacher")).sort((a, b) => cmp(strOf(a.teacher_id), strOf(b.teacher_id)));
  const crs = recs(objOf(s, "course")).sort((a, b) => cmp(strOf(a.course_id), strOf(b.course_id)));
  const rows = view.slice().sort((a, b) => cmp(strOf(a.teacher_id), strOf(b.teacher_id)) || cmp(strOf(a.course_id), strOf(b.course_id)));
  const TOP = 44;
  const SPAN = SH - TOP - 6;
  const ty = new Map(tch.map((r, i) => [strOf(r.teacher_id), TOP + ((i + 0.5) * SPAN) / tch.length]));
  const cy = new Map(crs.map((r, i) => [strOf(r.course_id), TOP + ((i + 0.5) * SPAN) / crs.length]));
  const vy = (i: number) => TOP + ((i + 0.5) * SPAN) / Math.max(1, rows.length);
  const TW = 170;
  const VX = 330;
  const VW = 220;
  const CX = SW - 170;
  const th = Math.min(26, SPAN / tch.length - 6);
  const ch = Math.min(22, SPAN / crs.length - 5);
  const vh = Math.min(18, SPAN / Math.max(1, rows.length) - 3);
  const hotT = focus != null ? strOf(rows[focus].teacher_id) : null;
  const hotC = focus != null ? strOf(rows[focus].course_id) : null;
  return (
    <Svg>
      <T x={0} y={16} size={12} w={800} op={0.7} track={0.2} dl={t0}>
        {`teacher · ${tch.length}`}
      </T>
      <T x={VX} y={16} size={12} w={800} fill={YEL} track={0.2} dl={t0}>
        {`v_teacher_course · ${rows.length}`}
      </T>
      <T x={CX} y={16} size={12} w={800} op={0.7} track={0.2} dl={t0}>
        {`course · ${crs.length}`}
      </T>
      <g onPointerLeave={() => setFocus(null)}>
        {rows.map((r, i) => {
          const a = ty.get(strOf(r.teacher_id));
          const b = cy.get(strOf(r.course_id));
          const on = focus === i;
          const dim = focus != null && !on;
          return (
            <g key={i}>
              {a != null && (
                <path className="sv-draw ad-thread" data-on={on ? "" : undefined} data-dim={dim ? "" : undefined} style={d(t0 + 0.3 + i * 0.02)} d={`M${TW} ${a} C${(TW + VX) / 2} ${a} ${(TW + VX) / 2} ${vy(i)} ${VX} ${vy(i)}`} pathLength={1} />
              )}
              {b != null && (
                <path className="sv-draw ad-thread" data-on={on ? "" : undefined} data-dim={dim ? "" : undefined} style={d(t0 + 0.4 + i * 0.02)} d={`M${VX + VW} ${vy(i)} C${(VX + VW + CX) / 2} ${vy(i)} ${(VX + VW + CX) / 2} ${b} ${CX} ${b}`} pathLength={1} />
              )}
            </g>
          );
        })}
        {tch.map((r, i) => {
          const y = ty.get(strOf(r.teacher_id))!;
          const on = hotT === strOf(r.teacher_id);
          return (
            <g key={strOf(r.teacher_id)} className="sv-right" style={d(t0 + i * 0.02)}>
              <rect x={0} y={y - th / 2} width={TW} height={th} fill={on ? YEL : P} fillOpacity={on ? 1 : 0.12} />
              <text x={10} y={y + 5} fontSize={13} fontWeight={800} fill={on ? INK : P}>
                {strOf(r.teacher_name)}
              </text>
              <text x={TW - 10} y={y + 5} fontSize={11} fontWeight={700} fill={on ? INK : P} fillOpacity={0.6} textAnchor="end">
                {strOf(r.teacher_id)}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const on = focus === i;
          return (
            <g key={i} className="sv-right" style={d(t0 + 0.2 + i * 0.015)} onPointerEnter={() => setFocus(i)} data-tip={`${strOf(r.teacher_name)} · ${strOf(r.course_name)}`}>
              <rect x={VX} y={vy(i) - vh / 2} width={VW} height={vh} fill={on ? YEL : P} fillOpacity={on ? 1 : 0.2} />
              <text x={VX + 8} y={vy(i) + 4} fontSize={11} fontWeight={700} fill={on ? INK : P}>
                {`${strOf(r.teacher_id)} · ${strOf(r.course_id)}`}
              </text>
              <text x={VX + VW - 8} y={vy(i) + 4} fontSize={11} fontWeight={600} fill={on ? INK : P} fillOpacity={0.7} textAnchor="end">
                {strOf(r.course_name)}
              </text>
            </g>
          );
        })}
        {crs.map((r, i) => {
          const y = cy.get(strOf(r.course_id))!;
          const on = hotC === strOf(r.course_id);
          const used = rows.some((x) => x.course_id === r.course_id);
          return (
            <g key={strOf(r.course_id)} className="sv-left" style={d(t0 + 0.1 + i * 0.02)}>
              <rect x={CX} y={y - ch / 2} width={170} height={ch} fill={on ? YEL : used ? P : "none"} fillOpacity={on ? 1 : 0.12} stroke={used ? "none" : RED} />
              <text x={CX + 10} y={y + 4.5} fontSize={12} fontWeight={700} fill={on ? INK : used ? P : RED}>
                {strOf(r.course_name)}
              </text>
            </g>
          );
        })}
      </g>
    </Svg>
  );
}

function teacherCourse(s: Snapshot, t0: number): Shape {
  const v = objOf(s, "v_teacher_course")?.row_count ?? 0;
  const tg = objOf(s, "teaching")?.row_count ?? 0;
  return {
    title: v === tg ? `连接不丢行：${tg} 条授课 → ${v} 行` : `${tg} 条授课只连上 ${v} 行`,
    sub: "一档 = 一行 · 一线 = 一次连接匹配（teacher × teaching × course）· 悬停视图行查看来源",
    node: <Join s={s} t0={t0} />,
  };
}

// ------------------------------------------------------------------ file: page map

function PageMap({ s, t0 }: { s: Snapshot; t0: number }) {
  const [focus, setFocus] = useState<string | null>(null);
  const pages = s.pages;
  const n = pages.length;
  const cols = n <= 40 ? 8 : n <= 96 ? 12 : 16;
  const GAP = n <= 40 ? 10 : 6;
  const cw = (SW - (cols - 1) * GAP) / cols;
  const rows = Math.ceil(n / cols);
  const chh = Math.min(cw, (SH - 4 - (rows - 1) * GAP) / rows);
  const pos = new Map(pages.map((p, i) => [p.no, { x: (i % cols) * (cw + GAP), y: Math.floor(i / cols) * (chh + GAP) }]));
  const ps = s.file.page_size;
  const big = cw >= 70;
  const tone = (p: Page) =>
    p.owner === "sqlite_schema" ? { fill: YEL, op: 0.95, ink: true } : p.kind === "overflow" ? { fill: RED, op: 0.85, ink: true } : p.btree === "table" ? { fill: P, op: 0.82, ink: true } : p.btree === "index" ? { fill: P, op: 0.24, ink: false } : { fill: P, op: 0, ink: false };
  const kindLabel = (p: Page) => ({ interior: "INT", leaf: "LEAF", overflow: "OVF", trunk: "TRUNK", free: "FREE", unknown: "?" })[p.kind];
  return (
    <Svg>
      <defs>
        <pattern id="ad-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.5" height="6" fill={P} fillOpacity={0.25} />
        </pattern>
      </defs>
      <g onPointerLeave={() => setFocus(null)}>
        {pages.map((p, i) => {
          const at = pos.get(p.no)!;
          const tn = tone(p);
          const used = Math.max(0, Math.min(1, p.used / ps));
          const fh = used * chh;
          const on = focus != null && p.table === focus;
          const label = ownerLabel(p, s);
          // header row: ink when the fill covers it, a halo when the fill only reaches into it
          const inkTop = tn.ink && fh >= chh - 4;
          const haloTop = !inkTop && tn.op > 0.5 && fh > chh - 26;
          const halo = haloTop ? { stroke: "#121212", strokeWidth: 4, paintOrder: "stroke" as const, strokeLinejoin: "round" as const } : null;
          const inkBottom = tn.ink && fh > 26;
          return (
            <g
              key={p.no}
              className="sv-pop ad-page"
              data-on={on ? "" : undefined}
              style={d(t0 + i * 0.018)}
              onPointerEnter={() => setFocus(p.table)}
              data-tip={`第 ${p.no} 页 · ${p.owner || "未归属"} · ${p.btree === "table" ? "表 B-tree" : p.btree === "index" ? "索引 B-tree" : ""}${kindLabel(p)} · ${p.cells} 个单元 · 已用 ${p.used} / ${ps} B（${(used * 100).toFixed(1)}%）`}
            >
              <rect x={at.x} y={at.y} width={cw} height={chh} fill={p.kind === "free" || p.kind === "trunk" ? "url(#ad-hatch)" : P} fillOpacity={p.kind === "free" || p.kind === "trunk" ? 1 : 0.04} />
              <rect x={at.x} y={at.y + chh - fh} width={cw} height={fh} fill={tn.fill} fillOpacity={tn.op} />
              <rect x={at.x + 0.5} y={at.y + 0.5} width={cw - 1} height={chh - 1} fill="none" stroke={on ? YEL : P} strokeOpacity={on ? 1 : 0.2} strokeWidth={on ? 2 : 1} />
              {big && (
                <>
                  <text x={at.x + 8} y={at.y + 18} fontSize={12} fontWeight={800} fill={inkTop ? INK : P} fillOpacity={inkTop || haloTop ? 1 : 0.7} {...halo}>
                    {p.no}
                  </text>
                  <text x={at.x + cw - 8} y={at.y + 18} fontSize={11} fontWeight={800} fill={inkTop ? INK : P} fillOpacity={inkTop ? 0.8 : haloTop ? 1 : 0.5} textAnchor="end" letterSpacing="0.08em" {...halo}>
                    {kindLabel(p)}
                  </text>
                  {p.kind === "interior" && p.children?.length ? (
                    <text x={at.x + 8} y={at.y + chh / 2 + 4} fontSize={12} fontWeight={800} fill={YEL}>
                      {`→ ${p.children.join(" · ")}`}
                    </text>
                  ) : null}
                  <text x={at.x + 8} y={at.y + chh - 10} fontSize={13} fontWeight={800} fill={inkBottom ? INK : P}>
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>
    </Svg>
  );
}

function file(s: Snapshot, t0: number): Shape {
  const { byTable } = pagesBy(s);
  const groups = [...byTable.entries()].filter(([t]) => t && t !== "sqlite_schema" && t !== "freelist").sort((a, b) => b[1].length - a[1].length);
  const top = groups[0];
  return {
    title: `${kib(s.file.bytes)} KiB · ${s.file.page_count} 页${top ? ` · ${top[0]} 及其索引占 ${top[1].length} 页` : ""}`,
    sub: "一格 = 一页（4096 B）· 填充高 = 已用字节 · 亮 = 表 · 暗 = 索引 · 黄 = sqlite_schema · INT 页内 → 为其 B-tree 子页",
    node: <PageMap s={s} t0={t0} />,
  };
}

// ------------------------------------------------------------------ registry

const SHAPES: Record<string, (s: Snapshot, t0: number) => Shape> = {
  department,
  clazz,
  student,
  course,
  enroll,
  teacher,
  teaching,
  graduation_requirement: graduation,
  issued_student_id: ledger,
  v_domain_rule: domainRule,
  v_student_credit: studentCredit,
  v_course_stat: courseStat,
  v_teacher_course: teacherCourse,
  [FILE_KEY]: file,
};

export function shapeOf(s: Snapshot, key: string, t0: number): Shape | null {
  const f = SHAPES[key];
  if (!f || (key !== FILE_KEY && !objOf(s, key))) return null;
  return f(s, t0);
}
