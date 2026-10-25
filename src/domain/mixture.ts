import Decimal from "decimal.js";
import { massSchema, type Component, type Batch } from "./types";
export function mass(value: string) {
  const n = value.trim().replace(",", ".");
  massSchema.parse(n);
  return new Decimal(n);
}
export function normalize(components: Component[]): Component[] {
  const m = new Map<string, Decimal>();
  for (const c of components) {
    if (!c.inkId) throw Error("Выберите краску");
    m.set(c.inkId, (m.get(c.inkId) || new Decimal(0)).plus(mass(c.grams)));
  }
  return [...m]
    .filter(([, g]) => g.gt(0))
    .map(([inkId, g]) => ({ inkId, grams: g.toFixed() }));
}
export const total = (cs: Component[]) =>
  normalize(cs)
    .reduce((s, c) => s.plus(c.grams), new Decimal(0))
    .toFixed();
export const composition = (b: Batch) =>
  normalize([...b.initial, ...b.additions.map((a) => a.component)]);
export const percent = (c: Component, cs: Component[]) =>
  new Decimal(total(cs)).gt(0)
    ? mass(c.grams).div(total(cs)).mul(100).toFixed(2)
    : "0.00";
export function scale(cs: Component[], target: string) {
  const t = mass(target);
  const sum = new Decimal(total(cs));
  if (!t.gt(0) || !sum.gt(0)) throw Error("Масса должна быть больше нуля");
  const list = normalize(cs);
  let allocated = new Decimal(0);
  return list.map((c, i) => {
    const g =
      i === list.length - 1
        ? t.minus(allocated)
        : mass(c.grams).mul(t).div(sum).toDecimalPlaces(3, Decimal.ROUND_DOWN);
    allocated = allocated.plus(g);
    return { inkId: c.inkId, grams: g.toFixed() };
  });
}
