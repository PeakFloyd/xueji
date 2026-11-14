"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FILE_KEY, type Item, type Snapshot } from "./model";
import { Head, d } from "./parts";

// How each object was declared: its CREATE statement as SQLite stores it (comments included), the
// indexes built on it, and the design note above it in db/schema*.sql. For the file: the 100-byte
// header, byte by byte.

const KEYWORDS = new Set(
  "CREATE TABLE VIEW INDEX IF NOT EXISTS AS SELECT FROM JOIN LEFT INNER ON WHERE AND OR IN IS NULL CASE WHEN THEN ELSE END GROUP BY ORDER ASC DESC DISTINCT UNION ALL LIMIT DROP COALESCE SUM COUNT AVG ROUND MIN MAX GLOB LIKE BETWEEN".split(" "),
);
const CONSTRAINT = new Set("PRIMARY KEY FOREIGN REFERENCES UNIQUE CHECK DEFAULT CONSTRAINT".split(" "));
const TYPES = new Set("TEXT INTEGER REAL NUMERIC BLOB".split(" "));

function highlight(sql: string, names: Set<string>, onOpen: (k: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(--[^\n]*)|('(?:''|[^'])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|[^\sA-Za-z0-9_'-]+|-)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(sql))) {
    const [tok, com, str, num, word] = m;
    if (com) out.push(<span key={k++} className="sq-c">{tok}</span>);
    else if (str) out.push(<span key={k++} className="sq-s">{tok}</span>);
    else if (num) out.push(<span key={k++} className="sq-n">{tok}</span>);
    else if (word) {
      const up = word.toUpperCase();
      if (CONSTRAINT.has(up)) out.push(<span key={k++} className="sq-k2">{tok}</span>);
      else if (KEYWORDS.has(up)) out.push(<span key={k++} className="sq-k">{tok}</span>);
      else if (TYPES.has(up)) out.push(<span key={k++} className="sq-t">{tok}</span>);
      else if (names.has(word))
        out.push(
          <button key={k++} type="button" className="sq-o" onClick={() => onOpen(word)}>
            {tok}
          </button>,
        );
      else out.push(<span key={k++}>{tok}</span>);
    } else out.push(tok);
  }
  return out;
}

/** Split highlighted tokens into lines (tokens never span a newline except whitespace runs). */
function lines(sql: string) {
  return sql.replace(/\r\n/g, "\n").split("\n");
}

function Code({ sql, names, onOpen, delay }: { sql: string; names: Set<string>; onOpen: (k: string) => void; delay: number }) {
  return (
    <ol className="ad-code">
      {lines(sql).map((ln, i) => (
        <li key={i} className="xj-rise" style={d(delay + Math.min(i, 30) * 0.018)}>
          <span className="ad-ln">{i + 1}</span>
          <code>{ln ? highlight(ln, names, onOpen) : " "}</code>
        </li>
      ))}
    </ol>
  );
}

export default function Ddl({ s, item, delay, onOpen }: { s: Snapshot; item: Item; delay: number; onOpen: (k: string) => void }) {
  const names = useMemo(() => new Set(s.objects.map((o) => o.name)), [s]);
  if (item.key === FILE_KEY) return <HeaderDump s={s} delay={delay} />;
  const o = item.obj!;
  const idx = o.indexes.filter((i) => i.sql);
  return (
    <div className="ad-ddl">
      <div className="ad-ddl-sql">
        <Head en="DDL" zh="建表语句" delay={delay} right="sqlite_master.sql" />
        <Code sql={o.sql} names={names} onOpen={onOpen} delay={delay + 0.05} />
        {idx.length > 0 && (
          <>
            <Head en="INDEX" zh="索引" delay={delay + 0.3} right={`${idx.length} 条`} />
            {idx.map((i) => (
              <Code key={i.name} sql={i.sql!} names={names} onOpen={onOpen} delay={delay + 0.34} />
            ))}
          </>
        )}
      </div>
      <div className="ad-ddl-note">
        <Head en="DESIGN NOTE" zh="设计注释" delay={delay + 0.1} />
        {o.note ? (
          <div className="ad-note-text">
            {o.note.split("\n").map((ln, i) => (
              <p key={i} className="xj-rise" style={d(delay + 0.16 + Math.min(i, 24) * 0.02)} data-blank={ln.trim() ? undefined : ""}>
                {ln.split(/(\*\*[^*]+\*\*|3NF|NULL|m:n|1:n)/).map((part, j) =>
                  /^\*\*[^*]+\*\*$/.test(part) ? (
                    <b key={j} data-t="paper">
                      {part.slice(2, -2)}
                    </b>
                  ) : /^(3NF|NULL|m:n|1:n)$/.test(part) ? (
                    <b key={j} data-t={part === "NULL" ? "red" : "yellow"}>
                      {part}
                    </b>
                  ) : (
                    part
                  ),
                )}
              </p>
            ))}
          </div>
        ) : (
          <p className="ad-empty xj-rise" style={d(delay + 0.16)}>
            schema 文件中没有该对象的注释
          </p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ file header

type Field = { at: number; len: number; zh: string; en: string; value: (b: number[]) => string };

const be = (b: number[], at: number, len: number) => b.slice(at, at + len).reduce((a, x) => a * 256 + x, 0);

const FIELDS: Field[] = [
  { at: 0, len: 16, zh: "魔数", en: "MAGIC", value: (b) => `"${String.fromCharCode(...b.slice(0, 15))}\\0"` },
  { at: 16, len: 2, zh: "页大小", en: "PAGE SIZE", value: (b) => `${be(b, 16, 2) === 1 ? 65536 : be(b, 16, 2)} B` },
  { at: 18, len: 1, zh: "写版本", en: "WRITE VER", value: (b) => (b[18] === 1 ? "1 · 回滚日志" : b[18] === 2 ? "2 · WAL" : `${b[18]}`) },
  { at: 19, len: 1, zh: "读版本", en: "READ VER", value: (b) => (b[19] === 1 ? "1 · 回滚日志" : b[19] === 2 ? "2 · WAL" : `${b[19]}`) },
  { at: 20, len: 1, zh: "保留字节", en: "RESERVED", value: (b) => `${b[20]} B / 页` },
  { at: 21, len: 3, zh: "载荷比例", en: "PAYLOAD", value: (b) => `${b[21]} / ${b[22]} / ${b[23]}` },
  { at: 24, len: 4, zh: "修改计数", en: "CHANGE CTR", value: (b) => `${be(b, 24, 4)}` },
  { at: 28, len: 4, zh: "页数", en: "PAGES", value: (b) => `${be(b, 28, 4)}` },
  { at: 32, len: 4, zh: "首空闲干页", en: "FREE TRUNK", value: (b) => `${be(b, 32, 4)}` },
  { at: 36, len: 4, zh: "空闲页数", en: "FREE PAGES", value: (b) => `${be(b, 36, 4)}` },
  { at: 40, len: 4, zh: "结构版本", en: "SCHEMA COOKIE", value: (b) => `${be(b, 40, 4)}` },
  { at: 44, len: 4, zh: "结构格式", en: "SCHEMA FORMAT", value: (b) => `${be(b, 44, 4)}` },
  { at: 48, len: 4, zh: "缓存建议", en: "CACHE SIZE", value: (b) => `${be(b, 48, 4)}` },
  { at: 52, len: 4, zh: "自动清理", en: "AUTOVACUUM", value: (b) => `${be(b, 52, 4)}` },
  { at: 56, len: 4, zh: "文本编码", en: "ENCODING", value: (b) => ({ 1: "1 · UTF-8", 2: "2 · UTF-16le", 3: "3 · UTF-16be" })[be(b, 56, 4)] ?? `${be(b, 56, 4)}` },
  { at: 60, len: 4, zh: "用户版本", en: "USER VER", value: (b) => `${be(b, 60, 4)}` },
  { at: 64, len: 4, zh: "增量清理", en: "INCR VACUUM", value: (b) => `${be(b, 64, 4)}` },
  { at: 68, len: 4, zh: "应用 ID", en: "APP ID", value: (b) => `${be(b, 68, 4)}` },
  { at: 72, len: 20, zh: "保留区", en: "EXPANSION", value: () => "全 0" },
  { at: 92, len: 4, zh: "有效版本", en: "VALID FOR", value: (b) => `${be(b, 92, 4)}` },
  { at: 96, len: 4, zh: "写入库版本", en: "SQLITE VER", value: (b) => {
    const n = be(b, 96, 4);
    return `${Math.floor(n / 1000000)}.${Math.floor((n % 1000000) / 1000)}.${n % 1000}`;
  } },
];

function HeaderDump({ s, delay }: { s: Snapshot; delay: number }) {
  const hex = s.file.header?.header_hex ?? "";
  const bytes = useMemo(() => (hex.match(/../g) ?? []).map((h) => parseInt(h, 16)), [hex]);
  const [hot, setHot] = useState<number | null>(null);
  const fieldAt = (i: number) => FIELDS.findIndex((f) => i >= f.at && i < f.at + f.len);
  if (bytes.length < 100) return <p className="ad-empty">无法读取文件头</p>;
  return (
    <div className="ad-ddl" onPointerLeave={() => setHot(null)}>
      <div className="ad-ddl-sql">
        <Head en="HEADER" zh="文件头 100 B" delay={delay} right="offset 0–99" />
        <div className="ad-hex">
          {Array.from({ length: Math.ceil(bytes.length / 10) }, (_, row) => (
            <div key={row} className="ad-hex-row xj-rise" style={d(delay + 0.05 + row * 0.04)}>
              <span className="ad-ln">{String(row * 10).padStart(3, "0")}</span>
              {bytes.slice(row * 10, row * 10 + 10).map((b, j) => {
                const i = row * 10 + j;
                const f = fieldAt(i);
                return (
                  <span key={i} className="ad-byte" data-f={f % 2 ? "b" : "a"} data-on={hot === f ? "" : undefined} data-zero={b === 0 ? "" : undefined} onPointerEnter={() => setHot(f)}>
                    {b.toString(16).padStart(2, "0").toUpperCase()}
                  </span>
                );
              })}
              <span className="ad-ascii">
                {bytes.slice(row * 10, row * 10 + 10).map((b, j) => (
                  <span key={j} data-on={hot === fieldAt(row * 10 + j) ? "" : undefined}>
                    {b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·"}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-ddl-note">
        <Head en="FIELDS" zh="字段" delay={delay + 0.1} right="大端序" />
        <ul className="ad-hfields">
          {FIELDS.map((f, i) => (
            <li key={f.at} className="xj-rise" data-on={hot === i ? "" : undefined} style={d(delay + 0.14 + i * 0.02)} onPointerEnter={() => setHot(i)}>
              <span className="xj-idx">{String(f.at).padStart(2, "0")}</span>
              <span>
                {f.zh} <i>{f.en}</i>
              </span>
              <b>{f.value(bytes)}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
