"use client";

import { useEffect, useRef, useState } from "react";
import { fdOf, indexKind, kib, objOf, pad2, pagesBy, type Item, type Obj, type Snapshot } from "./model";
import { Head, d } from "./parts";

// The left column of an opened object: what the schema says about it, set like a file card.
// Everything here is read from the snapshot (PRAGMA table_xinfo / foreign_key_list / index_list, the
// CREATE statement and the design notes in db/schema*.sql).

type Props = { s: Snapshot; item: Item; out: boolean; delay: number; onOpen: (key: string) => void };

export default function Dossier({ s, item, out, delay, onOpen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    const id = window.setTimeout(check, 1300);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      clearTimeout(id);
      el.removeEventListener("scroll", check);
    };
  }, [item]);
  return (
    <>
      <div ref={box} className={`ad-dossier${out ? " is-out" : ""}`}>
        {item.kind === "file" ? <FileCard s={s} delay={delay} /> : item.obj && <ObjCard s={s} o={item.obj} delay={delay} onOpen={onOpen} />}
      </div>
      {!out && (
        <button
          type="button"
          className="ad-more"
          data-on={more ? "" : undefined}
          tabIndex={more ? 0 : -1}
          onClick={() => box.current?.scrollBy({ top: 300, behavior: "smooth" })}
        >
          MORE · 向下查看
        </button>
      )}
    </>
  );
}

function Link({ to, children, onOpen }: { to: string; children: React.ReactNode; onOpen: (key: string) => void }) {
  return (
    <button type="button" className="ad-link" onClick={() => onOpen(to)}>
      {children}
    </button>
  );
}

function ObjCard({ s, o, delay, onOpen }: { s: Snapshot; o: Obj; delay: number; onOpen: (key: string) => void }) {
  const t0 = delay;
  const pages = pagesBy(s).byOwner;
  const children = s.objects.flatMap((c) => c.fks.filter((f) => f.table === o.name).map((f) => ({ child: c.name, f })));
  const readers = s.objects.filter((x) => x.deps.includes(o.name));
  const { key, rest } = fdOf(o);
  const why = o.note
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^--/.test(l) || /函数依赖|=> ?3NF/.test(l))
    .map((l) => l.replace(/^--\s*/, ""))
    .filter((l) => !/^函数依赖/.test(l))
    .slice(0, 3);
  const checks = [
    ...o.columns.flatMap((c) => c.checks.map((x) => ({ col: c.name, x }))),
    ...o.checks.map((x) => ({ col: "表级", x })),
  ];
  // build order down the column: every call hands out the next delay
  const clock = { t: t0 };
  const step = (dt = 0.05) => (clock.t += dt);

  return (
    <>
      <section className="ad-sec">
        <Head en="COLUMNS" zh="列" delay={step(0)} right={`${o.columns.length} 列`} />
        <ol className="ad-cols">
          {o.columns.map((c, i) => {
            const fk = o.fks.find((f) => f.from === c.name);
            return (
              <li key={c.name} className="xj-rise" style={d(step(0.04))}>
                <span className="xj-idx">{pad2(i + 1)}</span>
                <i className="ad-key" data-pk={c.pk ? "" : undefined} data-fk={fk ? "" : undefined} />
                <span className="ad-cols-name">{c.name}</span>
                <span className="ad-cols-type">{c.type || "—"}</span>
                <span className="ad-flags">
                  {c.pk > 0 && <em data-f="pk">PK{key.length > 1 ? c.pk : ""}</em>}
                  {fk && (
                    <em data-f="fk" title={`REFERENCES ${fk.table}(${fk.to})`}>
                      FK
                    </em>
                  )}
                  {c.notnull && <em>NN</em>}
                  {c.unique && <em>UQ</em>}
                  {c.checks.length > 0 && <em>CK</em>}
                </span>
                <span className="ad-cols-zh">{c.comment.replace(/[(（].*$/, "")}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {o.type === "table" && key.length > 0 && (
        <section className="ad-sec">
          <Head en="DEPENDENCY" zh="函数依赖" delay={step(0.06)} right="3NF" />
          <p className="ad-fd xj-rise" style={d(step())}>
            <b>{key.length > 1 ? `(${key.join(", ")})` : key[0]}</b>
            <i className="ad-arrow" />
            {rest.length ? <span>{rest.join(", ")}</span> : <span className="muted">无非主属性 · 全键联系表</span>}
          </p>
          {why.map((w, i) => (
            <p key={i} className="ad-why xj-rise" style={d(step(0.04))}>
              {w}
            </p>
          ))}
        </section>
      )}

      {(o.fks.length > 0 || children.length > 0 || o.deps.length > 0 || readers.length > 0) && (
        <section className="ad-sec">
          <Head en="REFERENCES" zh="引用" delay={step(0.06)} />
          <ul className="ad-refs">
            {o.fks.map((f) => (
              <li key={`p${f.id}`} className="xj-rise" style={d(step(0.04))}>
                <span className="ad-ref-dir">引用</span>
                <span className="ad-ref-col">{f.from}</span>
                <i className="ad-arrow" />
                <Link to={f.table} onOpen={onOpen}>
                  {f.table}.{f.to}
                </Link>
              </li>
            ))}
            {children.map(({ child, f }) => (
              <li key={`c${child}${f.id}`} className="xj-rise" style={d(step(0.04))}>
                <span className="ad-ref-dir">被引用</span>
                <Link to={child} onOpen={onOpen}>
                  {child}.{f.from}
                </Link>
                <i className="ad-arrow" />
                <span className="ad-ref-col">{f.to}</span>
              </li>
            ))}
            {o.deps.map((dep) => (
              <li key={`d${dep}`} className="xj-rise" style={d(step(0.04))}>
                <span className="ad-ref-dir">读取</span>
                <Link to={dep} onOpen={onOpen}>
                  {dep}
                </Link>
                <span className="ad-ref-n">{objOf(s, dep)?.row_count ?? 0} 行</span>
              </li>
            ))}
            {readers.map((r) => (
              <li key={`r${r.name}`} className="xj-rise" style={d(step(0.04))}>
                <span className="ad-ref-dir">被读取</span>
                <Link to={r.name} onOpen={onOpen}>
                  {r.name}
                </Link>
                <span className="ad-ref-n">视图</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.indexes.length > 0 && (
        <section className="ad-sec">
          <Head en="B-TREES" zh="索引" delay={step(0.06)} right={`${o.indexes.length} 个`} />
          <ul className="ad-idx">
            {[...o.indexes].reverse().map((ix) => (
              <li key={ix.name} className="xj-rise" style={d(step(0.04))}>
                <em data-f={ix.origin}>{indexKind(ix)}</em>
                <span className="ad-idx-cols">{ix.columns.join(", ")}</span>
                <span className="ad-idx-name">{ix.name.replace(/^sqlite_autoindex_/, "auto · ")}</span>
                <span className="ad-ref-n">{pages.get(ix.name)?.length ?? 0} 页</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {checks.length > 0 && (
        <section className="ad-sec">
          <Head en="CHECK" zh="域约束" delay={step(0.06)} right={`${checks.length} 条`} />
          <ul className="ad-checks">
            {checks.map((c, i) => (
              <li key={i} className="xj-rise" style={d(step(0.04))}>
                <span>{c.col}</span>
                <code>{c.x}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function FileCard({ s, delay }: { s: Snapshot; delay: number }) {
  const f = s.file;
  const h = f.header;
  const ok = s.integrity.check.length === 1 && s.integrity.check[0] === "ok";
  const rows: [string, string, string][] = [
    ["文件", "FILE", f.name],
    ["大小", "SIZE", `${f.bytes.toLocaleString("en-US")} B · ${kib(f.bytes)} KiB`],
    ["页大小", "PAGE SIZE", `${f.page_size} B`],
    ["页数", "PAGES", `${f.page_count}`],
    ["空闲页", "FREELIST", `${f.freelist_count}`],
    ["文本编码", "ENCODING", f.encoding],
    ["日志模式", "JOURNAL", f.journal_mode],
    ["SQLite", "VERSION", f.sqlite],
    ...(h
      ? ([
          ["结构格式", "SCHEMA FORMAT", `${h.schema_format}`],
          ["修改计数", "CHANGE COUNTER", `${h.change_counter}`],
          ["结构版本", "SCHEMA COOKIE", `${h.schema_cookie}`],
        ] as [string, string, string][])
      : []),
    ["修改时间", "MODIFIED", f.modified.replace("T", " ")],
    ["完整性", "INTEGRITY", ok ? "ok" : s.integrity.check.join("; ")],
    ["外键违例", "FK CHECK", `${s.integrity.fk_violations}`],
  ];
  return (
    <section className="ad-sec">
      <Head en="HEADER" zh="文件头" delay={delay} right="PRAGMA + 100 B 头部" />
      <dl className="ad-fields">
        {rows.map(([zh, en, val], i) => (
          <div key={en} className="xj-rise" style={d(delay + 0.05 + i * 0.035)}>
            <dt>
              {zh} <span>{en}</span>
            </dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
