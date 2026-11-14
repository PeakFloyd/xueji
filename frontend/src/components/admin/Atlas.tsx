"use client";

import { useMemo } from "react";
import {
  HEAD_H,
  MAP_KEY,
  MATRIX_Y,
  ROW_H,
  VIEW_W,
  checkCount,
  depthOf,
  edgesOf,
  fkIndexed,
  kib,
  mapBoxes,
  pad2,
  related,
  rowY,
  stripBoxes,
  type Box,
  type Edge,
  type Item,
  type Snapshot,
} from "./model";
import { Count, Head, Swap, d, v } from "./parts";

// The schema map and its folded form. Every table / view is one card that lives for the whole page:
// on the map it shows its columns and its foreign keys are drawn; opening an object folds every card
// down into its tile in the index strip (and unfolding brings them back). Cards never fade in or out.

export type CardMode = "pre" | "map" | "strip";
export type Motion = "build" | "fold" | "unfold" | "none";

type Props = {
  s: Snapshot;
  items: Item[];
  mode: CardMode;
  motion: Motion;
  sel: string | null;
  hover: string | null;
  onHover: (key: string | null) => void;
  onOpen: (key: string) => void;
  onMap: () => void;
};

/** When each card is built on the map: after everything it references (depth), views last, the file after. */
export function buildTimes(s: Snapshot, items: Item[], t0 = 0.62) {
  const depth = depthOf(s);
  const times: Record<string, number> = {};
  const tables = items.filter((i) => i.kind === "table");
  const byDepth = new Map<number, Item[]>();
  for (const it of tables) byDepth.set(depth[it.key] ?? 0, [...(byDepth.get(depth[it.key] ?? 0) ?? []), it]);
  let end = t0;
  [...byDepth.keys()].sort((a, b) => a - b).forEach((dp) => {
    byDepth.get(dp)!.forEach((it, i) => {
      times[it.key] = t0 + dp * 0.3 + i * 0.09;
      end = Math.max(end, times[it.key]);
    });
  });
  items.filter((i) => i.kind !== "table").forEach((it, i) => {
    times[it.key] = end + 0.3 + i * 0.09;
  });
  const done = Math.max(...Object.values(times)) + 0.9;
  return { times, depth, done };
}

type Geo = { d: string; parent: string; child: string; pm: string; cm: string; t: number };

function edgeGeometry(s: Snapshot, edges: Edge[], boxes: Record<string, Box>, times: Record<string, number>): Geo[] {
  const objs = new Map(s.objects.map((o) => [o.name, o]));
  const raw = edges.flatMap((e) => {
    const P = boxes[e.parent];
    const Cb = boxes[e.child];
    const po = objs.get(e.parent);
    const co = objs.get(e.child);
    if (!P || !Cb || !po || !co) return [];
    const py = rowY(P, Math.max(0, po.columns.findIndex((c) => c.name === e.to)));
    const cy = rowY(Cb, Math.max(0, co.columns.findIndex((c) => c.name === e.from)));
    const side = P.x + P.w <= Cb.x ? "L" : Cb.x + Cb.w <= P.x ? "R" : "S";
    return [{ e, P, Cb, py, cy, side }];
  });
  // bending edges into the same parent get their own channel
  const lanes = new Map<string, typeof raw>();
  for (const r of raw) if (Math.abs(r.py - r.cy) > 0.5 || r.side === "S") lanes.set(r.e.parent + r.side, [...(lanes.get(r.e.parent + r.side) ?? []), r]);
  const offset = new Map<(typeof raw)[number], number>();
  for (const list of lanes.values()) {
    list.sort((a, b) => a.cy - b.cy).forEach((r, i) => offset.set(r, (i - (list.length - 1) / 2) * 12));
  }
  return raw.map((r) => {
    const { e, P, Cb, py, cy, side } = r;
    const off = offset.get(r) ?? 0;
    let sx: number, ex: number, mx: number, dir: number;
    if (side === "L") {
      sx = P.x + P.w;
      ex = Cb.x;
      mx = (sx + ex) / 2 + off;
      dir = -1; // child edge faces left
    } else if (side === "R") {
      sx = P.x;
      ex = Cb.x + Cb.w;
      mx = (sx + ex) / 2 + off;
      dir = 1;
    } else {
      sx = P.x + P.w;
      ex = Cb.x + Cb.w;
      mx = Math.max(sx, ex) + 26 + off;
      dir = 1;
    }
    const dpath = Math.abs(py - cy) < 0.5 && side !== "S" ? `M${sx} ${py} H${ex}` : `M${sx} ${py} H${mx} V${cy} H${ex}`;
    const pdir = side === "R" ? -1 : 1;
    const pm = `M${sx + pdir * 9} ${py - 6} v12`;
    const cm = e.oneToOne
      ? `M${ex + dir * 9} ${cy - 6} v12`
      : `M${ex + dir * 13} ${cy} L${ex} ${cy - 6} M${ex + dir * 13} ${cy} L${ex} ${cy} M${ex + dir * 13} ${cy} L${ex} ${cy + 6}`;
    return { d: dpath, parent: e.parent, child: e.child, pm, cm, t: Math.max(times[e.child] ?? 0, times[e.parent] ?? 0) + 0.22 };
  });
}

/** One-character column heads of the views' dependency matrix. */
const SHORT: Record<string, string> = {
  department: "系",
  clazz: "班",
  student: "学",
  course: "课",
  enroll: "选",
  teacher: "教",
  teaching: "授",
  graduation_requirement: "毕",
  issued_student_id: "台",
  v_domain_rule: "域",
};

export default function Atlas({ s, items, mode, motion, sel, hover, onHover, onOpen, onMap }: Props) {
  const map = useMemo(() => mapBoxes(items), [items]);
  const strip = useMemo(() => stripBoxes(items), [items]);
  const { times, depth } = useMemo(() => buildTimes(s, items), [s, items]);
  const edges = useMemo(() => edgeGeometry(s, edgesOf(s), map, times), [s, map, times]);
  const hot = useMemo(() => (hover && mode === "map" ? related(s, hover) : null), [s, hover, mode]);
  const sources = useMemo(
    () => items.filter((i) => i.kind === "table").map((i) => i.key).concat(items.some((i) => i.key === "v_domain_rule") ? ["v_domain_rule"] : []),
    [items],
  );
  const order = useMemo(() => [...items].sort((a, b) => (times[a.key] ?? 0) - (times[b.key] ?? 0)).map((i) => i.key), [items, times]);
  const pageKinds = useMemo(() => s.pages.map((p) => (p.owner === "sqlite_schema" ? "schema" : p.btree ?? p.kind)), [s.pages]);

  const card = (it: Item) => {
    const box = mode === "strip" ? strip[it.key] : map[it.key];
    if (!box) return null;
    const o = it.obj;
    const n = it.kind === "table" ? o?.columns.length ?? 0 : 1;
    const k = order.indexOf(it.key);
    const bt = times[it.key] ?? 0;
    // per-motion delays (s): travel, header build, english label, rows
    const tt = motion === "fold" ? 0.16 + k * 0.014 : motion === "unfold" ? 0.1 + k * 0.014 : 0;
    const hb = motion === "build" ? bt : 0;
    const et = motion === "build" ? bt + 0.12 : motion === "unfold" ? tt + 0.5 : 0;
    const rowDelay = (i: number) =>
      mode === "map" ? (motion === "build" ? bt + 0.18 + i * 0.045 : motion === "unfold" ? tt + 0.52 + (depth[it.key] ?? 0) * 0.04 + i * 0.03 : 0) : (n - 1 - i) * 0.012;
    const isSel = sel === it.key && mode === "strip";
    const isHot = hot?.has(it.key) ?? false;
    const label = `${it.en} · ${it.zh} · ${it.kind === "file" ? `${it.count} 页` : `${it.count} 行`}`;
    return (
      <button
        key={it.key}
        type="button"
        className="ad-card"
        data-kind={it.kind}
        data-mode={mode}
        data-sel={isSel ? "" : undefined}
        data-hot={isHot ? "" : undefined}
        aria-label={label}
        aria-current={isSel ? "page" : undefined}
        tabIndex={mode === "pre" ? -1 : 0}
        style={v({ x: box.x, y: box.y, tt, hb, et }, { width: box.w, transform: `translate(${box.x}px, ${box.y}px)`, height: mode === "strip" ? HEAD_H : box.h })}
        onClick={() => onOpen(it.key)}
        onPointerEnter={() => onHover(it.key)}
        onPointerLeave={() => onHover(null)}
        onFocus={() => onHover(it.key)}
        onBlur={() => onHover(null)}
      >
        <span className="ad-card-rule" />
        <span className="ad-card-head">
          <span className="ad-card-idx">{pad2(it.idx)}</span>
          <span className="ad-card-en">{it.en}</span>
          <span className="ad-card-zh">{it.zh}</span>
          <span className="ad-card-count">
            <Count value={it.count} delay={motion === "build" ? bt : 0} dur={motion === "build" ? 0.9 : 0.5} />
          </span>
        </span>
        {it.kind === "table" && o && (
          <span className="ad-card-rows">
            {o.columns.map((c, i) => {
              const fk = o.fks.some((f) => f.from === c.name);
              return (
                <span key={c.name} className="ad-card-row" style={v({ rd: rowDelay(i) }, { top: HEAD_H + i * ROW_H })}>
                  <i className="ad-key" data-pk={c.pk ? "" : undefined} data-fk={fk ? "" : undefined} />
                  <span className="ad-col">{c.name}</span>
                  <span className="ad-type">{c.type}</span>
                </span>
              );
            })}
          </span>
        )}
        {it.kind === "view" && o && (
          <span className="ad-card-rows">
            <span className="ad-card-row ad-vrow" style={v({ rd: rowDelay(0) }, { top: HEAD_H })}>
              <span className="ad-type">{o.columns.length} 列 · COLUMNS</span>
              <span className="ad-deps">
                {sources.map((src) => (
                  <i key={src} data-on={o.deps.includes(src) ? "" : undefined} title={src} />
                ))}
              </span>
            </span>
          </span>
        )}
        {it.kind === "file" && (
          <span className="ad-card-rows">
            <span className="ad-card-row ad-vrow" style={v({ rd: rowDelay(0) }, { top: HEAD_H })}>
              <span className="ad-type">{kib(s.file.bytes)} KiB</span>
              <span className="ad-minipages">
                {pageKinds.map((pk, i) => (
                  <i key={i} data-k={pk} />
                ))}
              </span>
            </span>
          </span>
        )}
      </button>
    );
  };

  const mapBox = strip[MAP_KEY];
  return (
    <div className="ad-atlas" data-mode={mode}>
      <svg className="ad-edges" viewBox="0 0 1920 1080" width={1920} height={1080} aria-hidden="true">
        {edges.map((g, i) => {
          const on = hot ? hot.has(g.parent) && hot.has(g.child) && (g.parent === hover || g.child === hover) : false;
          const t = mode === "map" ? (motion === "build" ? g.t : motion === "unfold" ? 0.86 + (depth[g.child] ?? 0) * 0.08 : 0) : 0;
          return (
            <g key={i} className="ad-edge" data-mode={mode} data-on={on ? "" : undefined} data-dim={hot && !on ? "" : undefined} style={v({ t })}>
              <path className="ad-edge-line" d={g.d} pathLength={1} />
              <path className="ad-edge-mark" d={g.pm} />
              <path className="ad-edge-mark ad-edge-foot" d={g.cm} />
            </g>
          );
        })}
      </svg>

      {items.map(card)}

      {/* the map itself as the strip's first tile */}
      {mapBox && (
        <button
          type="button"
          className="ad-card ad-maptile"
          data-mode={mode}
          tabIndex={mode === "strip" ? 0 : -1}
          aria-label="返回库表总图"
          style={v({ tt: 0, hb: 0, et: 0 }, { width: mapBox.w, height: HEAD_H, transform: `translate(${mapBox.x}px, ${mapBox.y}px)` })}
          onClick={onMap}
        >
          <span className="ad-card-rule" />
          <span className="ad-card-head">
            <span className="ad-card-idx">00</span>
            <span className="ad-card-en">MAP</span>
            <i className="ad-grid-icon" />
            <span className="ad-card-zh">总图</span>
          </span>
        </button>
      )}

      {/* map furniture: matrix heads, ledger note, integrity, KPIs, legend */}
      <Swap value={mode === "map" ? s : null} id={mode === "map" ? "on" : "off"} outMs={240}>
        {(snap, out) => <Furniture s={snap} items={items} out={out} motion={motion} times={times} sources={sources} map={map} />}
      </Swap>
    </div>
  );
}

function Furniture({ s, items, out, motion, times, sources, map }: {
  s: Snapshot; items: Item[]; out: boolean; motion: Motion; times: Record<string, number>; sources: string[]; map: Record<string, Box>;
}) {
  const t = (key: string, extra = 0) => (motion === "build" ? (times[key] ?? 0) + extra : 0.7 + extra);
  const tables = items.filter((i) => i.kind === "table");
  const views = items.filter((i) => i.kind === "view");
  const rows = tables.reduce((n, i) => n + i.count, 0);
  const fks = s.objects.reduce((n, o) => n + o.fks.length, 0);
  const idx = s.objects.reduce((n, o) => n + o.indexes.length, 0);
  const auto = s.objects.reduce((n, o) => n + o.indexes.filter((i) => i.origin !== "c").length, 0);
  const cover = fkIndexed(s);
  const firstView = views[0] ? map[views[0].key] : null;
  const ledger = map.issued_student_id;
  const k0 = motion === "build" ? 0.42 : 0.62;

  const kpis: { en: string; zh: string; v: number; unit?: string; sub: string }[] = [
    { en: "TABLES", zh: "表", v: tables.length, sub: "第三范式" },
    { en: "VIEWS", zh: "视图", v: views.length, sub: "只读查询" },
    { en: "FOREIGN KEYS", zh: "外键", v: fks, sub: `${cover.ok}/${cover.all} 已建索引` },
    { en: "B-TREES", zh: "索引", v: idx, sub: `${idx - auto} 显式 · ${auto} 自动` },
    { en: "ROWS", zh: "记录", v: rows, sub: "全部表" },
    { en: "FILE", zh: "文件", v: kib(s.file.bytes), unit: "KiB", sub: `${s.file.page_count} 页 × ${s.file.page_size} B` },
  ];
  const ok = s.integrity.check.length === 1 && s.integrity.check[0] === "ok";
  const checks: { k: string; v: string; good: boolean }[] = [
    { k: "integrity_check", v: ok ? "ok" : `${s.integrity.check.length} 处问题`, good: ok },
    { k: "foreign_key_check", v: `${s.integrity.fk_violations} 违例`, good: s.integrity.fk_violations === 0 },
    { k: "PRAGMA foreign_keys", v: s.file.foreign_keys ? "ON · 每条连接" : "OFF", good: s.file.foreign_keys },
    { k: "CHECK 约束", v: `${checkCount(s)} 条`, good: true },
    { k: "外键索引", v: `${cover.ok} / ${cover.all}`, good: cover.ok === cover.all },
  ];

  return (
    <div className={`ad-furn${out ? " is-out" : ""}`}>
      <dl className="ad-kpis">
        {kpis.map((k, i) => (
          <div key={k.en} className="ad-kpi" style={d(k0 + i * 0.06)}>
            <dt className="xj-rise" style={d(k0 + i * 0.06)}>
              {k.zh} <span>{k.en}</span>
            </dt>
            <dd className="xj-rise" style={d(k0 + 0.08 + i * 0.06)}>
              <Count value={k.v} delay={k0 + i * 0.06} />
              {k.unit && <small>{k.unit}</small>}
            </dd>
            <dd className="ad-kpi-sub xj-rise" style={d(k0 + 0.14 + i * 0.06)}>
              {k.sub}
            </dd>
          </div>
        ))}
      </dl>

      {firstView && (
        <div className="ad-matrix" style={{ left: firstView.x, top: MATRIX_Y, width: VIEW_W }}>
          <span className="ad-matrix-label xj-rise" style={d(t(views[0].key, -0.1))}>
            VIEWS · 视图 <i>每格 = 读取的表</i>
          </span>
          <span className="ad-matrix-heads">
            {sources.map((src, i) => (
              <span key={src} className="xj-rise" title={src} style={d(t(views[0].key, -0.1) + i * 0.02)}>
                {SHORT[src] ?? src[0]}
              </span>
            ))}
          </span>
        </div>
      )}

      {ledger && (
        <div className="ad-note" style={{ left: ledger.x, top: ledger.y + ledger.h + 16, width: ledger.w }}>
          <span className="ad-note-rule xj-grow" style={d(t("issued_student_id", 0.4))} />
          <b className="xj-rise" style={d(t("issued_student_id", 0.46))}>
            NO FOREIGN KEY · 不设外键
          </b>
          <span className="xj-rise" style={d(t("issued_student_id", 0.52))}>
            学生删除后学号仍留在台账，永不复用
          </span>
        </div>
      )}

      <div className="ad-integrity" style={{ left: 200, top: 662 }}>
        <Head en="INTEGRITY" zh="完整性" delay={t("department", 0.5)} right={ok && s.integrity.fk_violations === 0 ? "PASS" : "CHECK"} />
        <ul>
          {checks.map((c, i) => (
            <li key={c.k} className="xj-rise" style={d(t("department", 0.58) + i * 0.05)}>
              <i className="xj-mark" data-tone={c.good ? "yellow" : "red"} />
              <span>{c.k}</span>
              <b data-bad={c.good ? undefined : ""}>{c.v}</b>
            </li>
          ))}
        </ul>
      </div>

      <div className="ad-legend">
        {[
          { cls: "pk", t: "PK 主键", g: <rect x={1} y={3} width={8} height={8} fill="#FFD21F" /> },
          { cls: "fk", t: "FK 外键", g: <rect x={1.75} y={3.75} width={6.5} height={6.5} fill="none" stroke="#F2F0EA" strokeWidth={1.5} /> },
          { cls: "one-many", t: "一对多", g: <path d="M2 7 H40 M8 1 v12 M27 7 L40 1 M27 7 L40 7 M27 7 L40 13" fill="none" stroke="#F2F0EA" strokeWidth={1.4} /> },
          { cls: "one-one", t: "一对一", g: <path d="M2 7 H40 M8 1 v12 M33 1 v12" fill="none" stroke="#F2F0EA" strokeWidth={1.4} /> },
          { cls: "view", t: "视图 · 虚线", g: <path d="M1 7 H42" fill="none" stroke="#F2F0EA" strokeWidth={2} strokeDasharray="6 4" /> },
        ].map((l, i) => (
          <span key={l.cls} className="ad-legend-item xj-rise" style={d(t(items[items.length - 1].key, 0.1) + i * 0.05)}>
            <svg width={l.cls === "pk" || l.cls === "fk" ? 10 : 44} height={14} aria-hidden="true">
              {l.g}
            </svg>
            {l.t}
          </span>
        ))}
        <span className="ad-legend-hint xj-rise" style={d(t(items[items.length - 1].key, 0.4))}>
          建库顺序 = 依赖顺序 · 点击任一对象展开档案
        </span>
      </div>
    </div>
  );
}
