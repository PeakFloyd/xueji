// The backstage snapshot (GET /api/xueji/admin/schema -> ai/introspect.py) and everything the page
// derives from it: the item list, the schema-map geometry, relations and record accessors.

export type Cell = string | number | null;

export type Column = {
  name: string;
  type: string;
  notnull: boolean;
  default: string | null;
  pk: number;
  hidden: number;
  comment: string;
  checks: string[];
  unique: boolean;
};

export type ForeignKey = { id: number; seq: number; from: string; table: string; to: string; on_update: string; on_delete: string };

export type Index = { name: string; unique: boolean; origin: "c" | "u" | "pk"; partial: boolean; columns: string[]; sql: string | null };

export type Obj = {
  name: string;
  type: "table" | "view";
  sql: string;
  note: string;
  rootpage: number;
  columns: Column[];
  checks: string[];
  fks: ForeignKey[];
  indexes: Index[];
  deps: string[];
  row_count: number;
  rows: Cell[][];
  truncated: boolean;
};

export type Page = {
  no: number;
  owner: string;
  table: string;
  kind: "leaf" | "interior" | "overflow" | "trunk" | "free" | "unknown";
  btree: "table" | "index" | null;
  cells: number;
  used: number;
  parent: number | null;
  depth: number | null;
  children?: number[];
};

export type FileInfo = {
  name: string;
  bytes: number;
  modified: string;
  sqlite: string;
  page_size: number;
  page_count: number;
  freelist_count: number;
  journal_mode: string;
  encoding: string;
  user_version: number;
  foreign_keys: boolean;
  header: {
    page_size: number;
    reserved: number;
    file_pages: number;
    header_pages: number;
    change_counter: number;
    schema_cookie: number;
    schema_format: number;
    text_encoding: string;
    freelist_trunk: number;
    freelist_pages: number;
    header_hex?: string;
  } | null;
};

export type Snapshot = {
  file: FileInfo;
  integrity: { check: string[]; fk_violations: number };
  objects: Obj[];
  pages: Page[];
  at: string;
};

// ---------------------------------------------------------------- items

export const FILE_KEY = "@file";
export const MAP_KEY = "@map";

/** Short Chinese names (tiles, lockup). The long name comes from the design note when present. */
const ZH: Record<string, string> = {
  department: "系",
  clazz: "班级",
  student: "学生",
  course: "课程",
  enroll: "选修",
  teacher: "教师",
  teaching: "授课",
  graduation_requirement: "毕业要求",
  issued_student_id: "学号台账",
  v_domain_rule: "域常量",
  v_student_credit: "学业情况",
  v_course_stat: "课程统计",
  v_teacher_course: "教师授课",
};

const ORDER = [
  "department",
  "clazz",
  "student",
  "course",
  "enroll",
  "teacher",
  "teaching",
  "graduation_requirement",
  "issued_student_id",
  "v_domain_rule",
  "v_student_credit",
  "v_course_stat",
  "v_teacher_course",
];

export type Item = {
  key: string;
  kind: "table" | "view" | "file";
  zh: string;
  /** Name as the schema's own design note calls it (表3: 学生(student) -> 学生). */
  long: string;
  en: string;
  count: number;
  obj?: Obj;
  idx: number;
};

const longName = (o: Obj) => {
  const m = o.note.split("\n")[0]?.match(/^(?:(?:表|视图)\d+\s*[:：]\s*)?([^\s(（:：]+)\s*[(（]/);
  return m ? m[1] : ZH[o.name] ?? o.name;
};

export function itemsOf(s: Snapshot): Item[] {
  const rank = (n: string) => {
    const i = ORDER.indexOf(n);
    return i < 0 ? ORDER.length : i;
  };
  const objs = [...s.objects].sort((a, b) =>
    a.type !== b.type ? (a.type === "table" ? -1 : 1) : rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
  const items: Item[] = objs.map((o, i) => ({
    key: o.name,
    kind: o.type,
    zh: ZH[o.name] ?? o.name,
    long: longName(o),
    en: o.name,
    count: o.row_count,
    obj: o,
    idx: i + 1,
  }));
  items.push({ key: FILE_KEY, kind: "file", zh: "文件", long: "数据库文件", en: s.file.name, count: s.file.page_count, idx: items.length + 1 });
  return items;
}

// ---------------------------------------------------------------- records

export type Rec = Record<string, Cell>;

export const recs = (o: Obj | undefined): Rec[] => {
  if (!o) return [];
  const names = o.columns.map((c) => c.name);
  return o.rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i] ?? null])));
};

export const numOf = (v: Cell): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const strOf = (v: Cell): string => (v == null ? "" : String(v));

export const objOf = (s: Snapshot, name: string) => s.objects.find((o) => o.name === name);

/** The schema's single pass line (v_domain_rule). null when the view is missing: never a default. */
export const passLine = (s: Snapshot): number | null => numOf(recs(objOf(s, "v_domain_rule"))[0]?.pass_line ?? null);

// ---------------------------------------------------------------- relations

export type Edge = { child: string; from: string; parent: string; to: string; oneToOne: boolean };

export function edgesOf(s: Snapshot): Edge[] {
  const out: Edge[] = [];
  for (const o of s.objects) {
    const pk = o.columns.filter((c) => c.pk).map((c) => c.name);
    for (const fk of o.fks) {
      out.push({ child: o.name, from: fk.from, parent: fk.table, to: fk.to, oneToOne: pk.length === 1 && pk[0] === fk.from });
    }
  }
  return out;
}

export function related(s: Snapshot, key: string): Set<string> {
  const set = new Set<string>([key]);
  for (const e of edgesOf(s)) {
    if (e.child === key) set.add(e.parent);
    if (e.parent === key) set.add(e.child);
  }
  for (const o of s.objects) {
    if (o.name === key) o.deps.forEach((d) => set.add(d));
    if (o.deps.includes(key)) set.add(o.name);
  }
  return set;
}

/** Every foreign key has an index whose leading column is the key column (SQLite does not add one). */
export function fkIndexed(s: Snapshot) {
  let ok = 0;
  let all = 0;
  for (const o of s.objects) {
    for (const fk of o.fks) {
      all++;
      if (o.indexes.some((i) => i.columns[0] === fk.from)) ok++;
    }
  }
  return { ok, all };
}

export const checkCount = (s: Snapshot) =>
  s.objects.reduce((n, o) => n + o.checks.length + o.columns.reduce((m, c) => m + c.checks.length, 0), 0);

/** Pages per object; indexes are attributed to their table as well. */
export function pagesBy(s: Snapshot) {
  const byOwner = new Map<string, Page[]>();
  const byTable = new Map<string, Page[]>();
  for (const p of s.pages) {
    byOwner.set(p.owner, [...(byOwner.get(p.owner) ?? []), p]);
    byTable.set(p.table, [...(byTable.get(p.table) ?? []), p]);
  }
  return { byOwner, byTable };
}

// ---------------------------------------------------------------- frame geometry (1920 x 1080)

export const W = 1920;
export const H = 1080;
export const LB = 60;

export const CARD_W = 236;
export const HEAD_H = 46;
export const ROW_H = 26;

const A = 200;
const B = 488;
const Cc = 776;
const D = 1064;
const E = 1380;
export const VIEW_W = 340;

/**
 * The schema map. Positions are chosen so a foreign key and the key it references sit on the same row
 * wherever the drawing allows: those relations become straight lines.
 */
const MAP: Record<string, { x: number; y: number }> = {
  issued_student_id: { x: A, y: 340 },
  department: { x: A, y: 520 },
  graduation_requirement: { x: B, y: 340 },
  clazz: { x: B, y: 468 },
  teacher: { x: B, y: 640 },
  student: { x: Cc, y: 390 },
  teaching: { x: Cc, y: 640 },
  enroll: { x: D, y: 390 },
  course: { x: D, y: 666 },
};
const VIEW_Y0 = 372;
const VIEW_STEP = 94;
export const VIEW_BODY = 30;
export const MATRIX_Y = 318;

export type Box = { x: number; y: number; w: number; h: number };

export function mapBoxes(items: Item[]): Record<string, Box> {
  const out: Record<string, Box> = {};
  let extraTable = 0;
  let view = 0;
  for (const it of items) {
    if (it.kind === "table") {
      const p = MAP[it.key] ?? { x: A + (extraTable % 2) * (B - A), y: 660 + Math.floor(extraTable++ / 2) * 120 };
      out[it.key] = { x: p.x, y: p.y, w: CARD_W, h: HEAD_H + ROW_H * (it.obj?.columns.length ?? 0) };
    } else if (it.kind === "view") {
      out[it.key] = { x: E, y: VIEW_Y0 + view++ * VIEW_STEP, w: VIEW_W, h: HEAD_H + VIEW_BODY };
    }
  }
  out[FILE_KEY] = { x: E, y: VIEW_Y0 + Math.max(4, view) * VIEW_STEP + 12, w: VIEW_W, h: HEAD_H + VIEW_BODY };
  return out;
}

export const rowY = (box: Box, i: number) => box.y + HEAD_H + ROW_H / 2 + ROW_H * i;

/** The index strip at the bottom of an object's page: the map, folded into one row of tiles. */
export const STRIP = { y: 886, x0: 200, x1: 1720, gap: 12, groupGap: 26 };

export function stripBoxes(items: Item[]): Record<string, Box> {
  const groups: string[][] = [[MAP_KEY], [], [], []];
  for (const it of items) groups[it.kind === "table" ? 1 : it.kind === "view" ? 2 : 3].push(it.key);
  const live = groups.filter((g) => g.length);
  const n = live.reduce((a, g) => a + g.length, 0);
  const w = (STRIP.x1 - STRIP.x0 - (n - live.length) * STRIP.gap - (live.length - 1) * STRIP.groupGap) / n;
  const out: Record<string, Box> = {};
  let x = STRIP.x0;
  live.forEach((g, gi) => {
    g.forEach((k, i) => {
      out[k] = { x, y: STRIP.y, w, h: HEAD_H };
      x += w + (i < g.length - 1 ? STRIP.gap : 0);
    });
    if (gi < live.length - 1) x += STRIP.groupGap;
  });
  return out;
}

/** Topological depth: a table builds after everything it references (the order init_db applies). */
export function depthOf(s: Snapshot): Record<string, number> {
  const depth: Record<string, number> = {};
  const byName = new Map(s.objects.map((o) => [o.name, o]));
  const visit = (name: string, seen = new Set<string>()): number => {
    if (depth[name] !== undefined) return depth[name];
    const o = byName.get(name);
    if (!o || seen.has(name)) return 0;
    seen.add(name);
    const parents = o.type === "view" ? o.deps : o.fks.map((f) => f.table);
    const d = parents.length ? 1 + Math.max(...parents.filter((p) => p !== name).map((p) => visit(p, seen)), -1) : 0;
    depth[name] = Math.max(0, d);
    return depth[name];
  };
  s.objects.forEach((o) => visit(o.name));
  return depth;
}

// ---------------------------------------------------------------- formatting

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const kib = (bytes: number) => Math.round(bytes / 1024);
export const keyCols = (o: Obj) => o.columns.filter((c) => c.pk).sort((a, b) => a.pk - b.pk);

/** Functional dependency the primary key asserts: key -> every non-key attribute. */
export function fdOf(o: Obj) {
  const key = keyCols(o).map((c) => c.name);
  const rest = o.columns.filter((c) => !c.pk).map((c) => c.name);
  return { key, rest };
}

export const indexKind = (i: Index) => (i.origin === "pk" ? "PK" : i.origin === "u" ? "UNIQUE" : "INDEX");

export const zhOf = (name: string) => ZH[name] ?? name;

/** Short label for a page owner, sized for a page cell: table pages by their Chinese name, index pages prefixed. */
export function ownerLabel(p: Page, s: Snapshot) {
  if (p.owner === "sqlite_schema") return "schema";
  if (p.owner === "freelist") return "空闲";
  if (!p.owner) return "?";
  if (p.btree !== "index") return zhOf(p.table);
  const o = objOf(s, p.table);
  const ix = o?.indexes.find((i) => i.name === p.owner);
  const tag = ix ? (ix.origin === "pk" ? "PK" : ix.origin === "u" ? "UQ" : "IX") : "IX";
  return `${tag} ${zhOf(p.table)}`;
}
