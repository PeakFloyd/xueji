// Shape morphing by arc-length resampling: any closed contour -> N points, aligned to its target
// (same winding, best start index), then interpolated point-wise.

export type Pt = [number, number];
export type Poly = Pt[];

export const N = 160;

const area = (p: Poly) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/** Resample a closed polygon to n points evenly spaced along its perimeter. */
export function resample(poly: Poly, n = N): Poly {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push(d);
    total += d;
  }
  const out: Poly = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (si < segs.length - 1 && acc + segs[si] < target) acc += segs[si++];
    const a = poly[si];
    const b = poly[(si + 1) % poly.length];
    const f = segs[si] === 0 ? 0 : (target - acc) / segs[si];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Make `to` share the winding of `from` and rotate its start index to minimise travel. */
export function align(from: Poly, to: Poly): Poly {
  let t = to;
  if (Math.sign(area(from)) !== Math.sign(area(t))) t = [...t].reverse();
  const n = from.length;
  // compare centred shapes so translation does not bias the pairing
  const c = (p: Poly) => {
    let x = 0;
    let y = 0;
    for (const q of p) {
      x += q[0];
      y += q[1];
    }
    return [x / p.length, y / p.length];
  };
  const [fx, fy] = c(from);
  const [tx, ty] = c(t);
  let best = 0;
  let bestD = Infinity;
  for (let off = 0; off < n; off++) {
    let d = 0;
    for (let i = 0; i < n; i += 4) {
      const a = from[i];
      const b = t[(i + off) % n];
      d += (a[0] - fx - (b[0] - tx)) ** 2 + (a[1] - fy - (b[1] - ty)) ** 2;
    }
    if (d < bestD) {
      bestD = d;
      best = off;
    }
  }
  return t.map((_, i) => t[(i + best) % n]);
}

export const lerpPoly = (a: Poly, b: Poly, k: number): Poly =>
  a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);

export const toPath = (polys: Poly[]) =>
  polys
    .map((p) => "M" + p.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join("L") + "Z")
    .join("");

// --- target shapes ---

export const circle = (cx: number, cy: number, r: number, n = N, start = -Math.PI / 2): Poly =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });

export const rect = (cx: number, cy: number, w: number, h: number): Poly => [
  [cx - w / 2, cy - h / 2],
  [cx + w / 2, cy - h / 2],
  [cx + w / 2, cy + h / 2],
  [cx - w / 2, cy + h / 2],
];

/** A check mark as a closed outline: centre-line (a -> v -> b) offset by thickness/2 on both sides. */
export function check(a: Pt, v: Pt, b: Pt, thick: number): Poly {
  const half = thick / 2;
  const nrm = (p: Pt, q: Pt): Pt => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    return [-dy / l, dx / l];
  };
  const n1 = nrm(a, v);
  const n2 = nrm(v, b);
  // mitre at the vertex
  const mx = n1[0] + n2[0];
  const my = n1[1] + n2[1];
  const ml = Math.hypot(mx, my);
  const cos = (mx / ml) * n1[0] + (my / ml) * n1[1];
  const m: Pt = [(mx / ml) * (half / cos), (my / ml) * (half / cos)];
  return [
    [a[0] + n1[0] * half, a[1] + n1[1] * half],
    [v[0] + m[0], v[1] + m[1]],
    [b[0] + n2[0] * half, b[1] + n2[1] * half],
    [b[0] - n2[0] * half, b[1] - n2[1] * half],
    [v[0] - m[0], v[1] - m[1]],
    [a[0] - n1[0] * half, a[1] - n1[1] * half],
  ];
}
