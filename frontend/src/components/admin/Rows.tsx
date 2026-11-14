"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FILE_KEY, type Cell, type Item, type Snapshot } from "./model";
import { d } from "./parts";

// Every row the snapshot returned, as a ledger. Keys are bold, NULL is spelled out (missing must be
// explicit), and a foreign-key value is a link to the row it references.

export type Focus = { col: string; value: Cell } | null;

type Col = { name: string; type: string; pk: boolean; fk?: { table: string; to: string }; num: boolean };

type Props = {
  s: Snapshot;
  item: Item;
  focus: Focus;
  delay: number;
  onJump: (table: string, col: string, value: Cell) => void;
};

function tableOf(s: Snapshot, item: Item): { cols: Col[]; rows: Cell[][]; total: number; truncated: boolean } {
  if (item.key === FILE_KEY) {
    const cols: Col[] = [
      { name: "page", type: "INTEGER", pk: true, num: true },
      { name: "owner", type: "TEXT", pk: false, num: false },
      { name: "table", type: "TEXT", pk: false, num: false },
      { name: "btree", type: "TEXT", pk: false, num: false },
      { name: "kind", type: "TEXT", pk: false, num: false },
      { name: "cells", type: "INTEGER", pk: false, num: true },
      { name: "used_bytes", type: "INTEGER", pk: false, num: true },
      { name: "parent", type: "INTEGER", pk: false, num: true },
    ];
    const rows = s.pages.map((p) => [p.no, p.owner, p.table, p.btree, p.kind, p.cells, p.used, p.parent] as Cell[]);
    return { cols, rows, total: rows.length, truncated: false };
  }
  const o = item.obj!;
  const cols = o.columns.map((c) => {
    const fk = o.fks.find((f) => f.from === c.name);
    const sample = o.rows.find((r) => r[o.columns.indexOf(c)] != null)?.[o.columns.indexOf(c)];
    return {
      name: c.name,
      type: c.type,
      pk: c.pk > 0,
      fk: fk ? { table: fk.table, to: fk.to } : undefined,
      num: /INT|REAL|NUM/i.test(c.type) || typeof sample === "number",
    };
  });
  return { cols, rows: o.rows, total: o.row_count, truncated: o.truncated };
}

const text = (v: Cell) => (v == null ? "NULL" : String(v));

export default function Rows({ s, item, focus, delay, onJump }: Props) {
  const { cols, rows, total, truncated } = useMemo(() => tableOf(s, item), [s, item]);
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const body = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = rows.map((r, i) => ({ r, i }));
    if (needle) list = list.filter(({ r }) => r.some((c) => text(c).toLowerCase().includes(needle)));
    if (sort) {
      const { i, dir } = sort;
      list = [...list].sort((a, b) => {
        const x = a.r[i];
        const y = b.r[i];
        if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh-CN")) * dir;
      });
    }
    return list;
  }, [rows, q, sort]);

  const focusIdx = focus ? cols.findIndex((c) => c.name === focus.col) : -1;
  const hit = (r: Cell[]) => focusIdx >= 0 && r[focusIdx] === focus!.value;

  // a jump lands on the referenced row
  useEffect(() => {
    if (focusIdx < 0 || !body.current) return;
    const el = body.current.querySelector<HTMLElement>("[data-focus]");
    if (el) body.current.scrollTop = Math.max(0, el.offsetTop - 120);
  }, [focusIdx, focus]);

  // column widths from content (characters), as fractions of the stage
  const widths = useMemo(
    () =>
      cols.map((c, i) => {
        let m = c.name.length + 2;
        for (const r of rows.slice(0, 400)) m = Math.max(m, [...text(r[i])].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0));
        return Math.min(28, Math.max(9, m));
      }),
    [cols, rows],
  );
  const template = widths.map((w) => `minmax(0, ${w}fr)`).join(" ");

  return (
    <div className="ad-rows">
      <div className="ad-rows-bar xj-rise" style={d(delay)}>
        <span>
          显示 <b>{shown.length}</b> / {total} 行{truncated ? ` · 仅返回前 ${rows.length} 行` : ""}
        </span>
        <label className="ad-filter">
          <span>FILTER · 筛选</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} autoComplete="off" aria-label="筛选行" />
        </label>
      </div>
      <div className="ad-grid" role="table" aria-label={`${item.en} 数据`}>
        <div className="ad-tr ad-th" role="row" style={{ gridTemplateColumns: template }}>
          {cols.map((c, i) => (
            <button
              key={c.name}
              type="button"
              role="columnheader"
              className="ad-td xj-rise"
              data-num={c.num ? "" : undefined}
              data-pk={c.pk ? "" : undefined}
              style={d(delay + 0.04 + i * 0.03)}
              aria-sort={sort?.i === i ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
              onClick={() => setSort((cur) => (cur?.i === i ? (cur.dir === 1 ? { i, dir: -1 } : null) : { i, dir: 1 }))}
            >
              <span className="ad-th-name">{c.name}</span>
              <span className="ad-th-type">
                {c.fk ? `→ ${c.fk.table}` : c.type || "·"}
                {sort?.i === i && <i data-dir={sort.dir} />}
              </span>
            </button>
          ))}
        </div>
        <div className="ad-tbody" ref={body}>
          {shown.map(({ r, i }, k) => (
            <div
              key={i}
              className="ad-tr"
              role="row"
              data-focus={hit(r) ? "" : undefined}
              style={{ gridTemplateColumns: template, ...(k < 24 ? d(delay + 0.1 + k * 0.018) : null) }}
            >
              {r.map((v, j) => {
                const c = cols[j];
                const cls = `ad-td${c.num ? " num" : ""}${c.pk ? " pk" : ""}`;
                if (v == null)
                  return (
                    <span key={j} className={cls} role="cell">
                      <em className="ad-null">NULL</em>
                    </span>
                  );
                if (c.fk)
                  return (
                    <span key={j} className={cls} role="cell">
                      <button type="button" className="ad-fk" title={`打开 ${c.fk.table} 中 ${c.fk.to} = ${text(v)} 的行`} onClick={() => onJump(c.fk!.table, c.fk!.to, v)}>
                        {text(v)}
                      </button>
                    </span>
                  );
                return (
                  <span key={j} className={cls} role="cell">
                    {text(v)}
                  </span>
                );
              })}
            </div>
          ))}
          {!shown.length && <p className="ad-empty">没有匹配「{q}」的行</p>}
        </div>
      </div>
    </div>
  );
}
