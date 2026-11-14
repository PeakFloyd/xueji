"use client";

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import Ddl from "./Ddl";
import { FILE_KEY, type Cell, type Item, type Snapshot } from "./model";
import { Chars, Swap, d } from "./parts";
import Rows, { type Focus } from "./Rows";
import { shapeOf } from "./Shapes";

// The right column of an opened object: SHAPE (one picture, one conclusion), ROWS (every row), DDL
// (how it was declared). Switching tabs collapses the old content into its rule and builds the new.

export type Tab = "shape" | "rows" | "ddl";
export const TABS: { id: Tab; en: string; zh: string }[] = [
  { id: "shape", en: "SHAPE", zh: "图形" },
  { id: "rows", en: "ROWS", zh: "数据" },
  { id: "ddl", en: "DDL", zh: "定义" },
];

type Props = {
  s: Snapshot;
  item: Item;
  tab: Tab;
  out: boolean;
  delay: number;
  focus: Focus;
  onTab: (t: Tab) => void;
  onJump: (table: string, col: string, value: Cell) => void;
  onOpen: (key: string) => void;
};

function Body({ s, item, tab, delay, focus, onJump, onOpen }: Omit<Props, "out" | "onTab">) {
  const shape = useMemo(() => (tab === "shape" ? shapeOf(s, item.key, delay + 0.3) : null), [s, item.key, tab, delay]);
  const cols = item.obj?.columns.length ?? 8;
  const title =
    tab === "shape"
      ? shape?.title ?? "没有可用的图形"
      : tab === "rows"
        ? `${item.count} ${item.kind === "file" ? "页" : "行"} · ${cols} 列${item.kind === "view" ? " · 视图实时计算" : item.kind === "file" ? " · 逐页归属" : " · 按主键排序"}`
        : item.key === FILE_KEY
          ? "SQLite 文件头 · 前 100 字节"
          : `CREATE ${item.kind === "view" ? "VIEW" : "TABLE"} ${item.en}`;
  const sub =
    tab === "shape"
      ? shape?.sub ?? ""
      : tab === "rows"
        ? item.kind === "file"
          ? "按页号 · 由 SQLite 文件格式解析 B-tree 得到 · 不经过 dbstat"
          : "粗体 = 主键 · 黄色下划线 = 外键，点击跳到被引用的行 · NULL 显式标出"
        : item.key === FILE_KEY
          ? "悬停字节或字段对照 · 数值均为大端序"
          : "SQLite 原样保存的建表文本（含行内注释）· 右侧为 schema 文件中的设计注释";
  return (
    <>
      <h2 className="ad-headline" aria-label={title} style={{ fontSize: Math.min(34, 860 / [...title].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.56), 0)) }}>
        <Chars text={title} delay={delay} stagger={Math.min(0.03, 0.6 / Math.max(1, title.length))} className="ch xj-rise" />
      </h2>
      <div className="ad-stage-rule xj-grow" style={d(delay + 0.1)} />
      <p className="ad-sub xj-rise" style={d(delay + 0.18)}>
        {sub}
      </p>
      <div className="ad-body" data-tab={tab}>
        {tab === "shape" && shape?.node}
        {tab === "rows" && <Rows s={s} item={item} focus={focus} delay={delay + 0.2} onJump={onJump} />}
        {tab === "ddl" && <Ddl s={s} item={item} delay={delay + 0.2} onOpen={onOpen} />}
      </div>
    </>
  );
}

export default function Stage({ s, item, tab, out, delay, focus, onTab, onJump, onOpen }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [cursor, setCursor] = useState({ x: 0, w: 0 });
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const view = useMemo(() => ({ item, tab }), [item, tab]);

  useLayoutEffect(() => {
    const el = tabRefs.current[TABS.findIndex((t) => t.id === tab)];
    if (el) setCursor({ x: el.offsetLeft, w: el.offsetWidth });
  }, [tab]);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const host = root.current;
    const target = (e.target as Element).closest?.("[data-tip]");
    if (!host || !target) {
      if (tip) setTip(null);
      return;
    }
    const r = host.getBoundingClientRect();
    const k = r.width / host.offsetWidth || 1;
    const text = target.getAttribute("data-tip") ?? "";
    setTip({ text, x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k });
  };

  const snapTime = s.at.slice(11, 19);

  return (
    <div className={`ad-stage${out ? " is-out" : ""}`} ref={root} onPointerMove={move} onPointerLeave={() => setTip(null)}>
      <div className="ad-stage-head">
        <div className="ad-tabs" role="tablist" aria-label="查看方式">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className="ad-tab xj-rise"
              style={d(delay + i * 0.05)}
              onClick={() => onTab(t.id)}
            >
              <span className="xj-idx">{String(i + 1).padStart(2, "0")}</span>
              {t.en} <i>{t.zh}</i>
              {t.id === "rows" && <b>{item.count}</b>}
            </button>
          ))}
          <span className="ad-tab-cursor" style={{ transform: `translateX(${cursor.x}px)`, width: cursor.w }} />
        </div>
        <span className="xj-chip ad-snap xj-rise" data-tone="paper" style={d(delay + 0.15)}>
          SNAPSHOT · {snapTime}
        </span>
      </div>
      <Swap value={view} id={`${item.key}:${tab}`} outMs={240}>
        {(v, o, dl) => (
          <div className={`ad-tabbody${o ? " is-out" : ""}`}>
            <Body s={s} item={v.item} tab={v.tab} delay={(dl || delay) + 0.1} focus={focus} onJump={onJump} onOpen={onOpen} />
          </div>
        )}
      </Swap>
      {tip && (
        <div className="ad-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
