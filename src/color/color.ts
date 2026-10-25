import type { Lab, RGB } from "../domain/types";
export type XYZ = [number, number, number];
export const whites = {
  D65: [0.95047, 1, 1.08883] as XYZ,
  D50: [0.96422, 1, 0.82521] as XYZ,
};
export const linearize = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export function rgbToXyz(rgb: RGB): XYZ {
  const [r, g, b] = rgb.map((v) => linearize(v / 255));
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}
const mul = (m: number[][], v: XYZ): XYZ =>
  m.map((r) => r.reduce((s, n, i) => s + n * v[i], 0)) as XYZ;
export function adapt(x: XYZ, from: XYZ, to: XYZ): XYZ {
  const m = [
      [0.8951, 0.2664, -0.1614],
      [-0.7502, 1.7135, 0.0367],
      [0.0389, -0.0685, 1.0296],
    ],
    inv = [
      [0.9869929, -0.1470543, 0.1599627],
      [0.4323053, 0.5183603, 0.0492912],
      [-0.0085287, 0.0400428, 0.9684867],
    ];
  const f = mul(m, from),
    t = mul(m, to),
    c = mul(m, x);
  return mul(inv, c.map((v, i) => (v * t[i]) / f[i]) as XYZ);
}
export function xyzToLab(xyz: XYZ, white: XYZ = whites.D50): Lab {
  const f = (t: number) =>
    t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
  const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
export const rgbToLab = (rgb: RGB): Lab =>
  xyzToLab(adapt(rgbToXyz(rgb), whites.D65, whites.D50));
export const deltaE76 = (a: Lab, b: Lab) =>
  Math.hypot(b.l - a.l, b.a - a.a, b.b - a.b);
const rad = (d: number) => (d * Math.PI) / 180,
  deg = (r: number) => (r * 180) / Math.PI;
export function deltaE2000(x: Lab, y: Lab): number {
  const c1 = Math.hypot(x.a, x.b),
    c2 = Math.hypot(y.a, y.b),
    c = (c1 + c2) / 2,
    g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
  const a1 = (1 + g) * x.a,
    a2 = (1 + g) * y.a,
    C1 = Math.hypot(a1, x.b),
    C2 = Math.hypot(a2, y.b);
  const hue = (a: number, b: number) =>
    a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360;
  const h1 = hue(a1, x.b),
    h2 = hue(a2, y.b),
    dL = y.l - x.l,
    dC = C2 - C1;
  let dh = h2 - h1;
  if (C1 * C2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2)),
    L = (x.l + y.l) / 2,
    C = (C1 + C2) / 2;
  let H = h1 + h2;
  if (C1 * C2 !== 0) {
    H = Math.abs(h1 - h2) <= 180 ? H / 2 : (H + (H < 360 ? 360 : -360)) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos(rad(H - 30)) +
    0.24 * Math.cos(rad(2 * H)) +
    0.32 * Math.cos(rad(3 * H + 6)) -
    0.2 * Math.cos(rad(4 * H - 63));
  const sL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2),
    sC = 1 + 0.045 * C,
    sH = 1 + 0.015 * C * T;
  const rT =
    -2 *
    Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)) *
    Math.sin(rad(60 * Math.exp(-(((H - 275) / 25) ** 2))));
  const l = dL / sL,
    cc = dC / sC,
    h = dH / sH;
  return Math.sqrt(l * l + cc * cc + h * h + rT * cc * h);
}
export function difference(target: Lab, current: Lab) {
  const l = current.l - target.l,
    a = current.a - target.a,
    b = current.b - target.b,
    c = Math.hypot(current.a, current.b) - Math.hypot(target.a, target.b);
  return {
    l,
    a,
    b,
    c,
    de00: deltaE2000(target, current),
    de76: deltaE76(target, current),
    direction: [
      l >= 0 ? "светлее" : "темнее",
      a >= 0 ? "краснее" : "зеленее",
      b >= 0 ? "желтее" : "синее",
      c >= 0 ? "насыщеннее" : "менее насыщенный",
    ].join(", "),
  };
}
