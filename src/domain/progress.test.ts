import { it, expect } from "vitest";
import { progress } from "./progress";
import { defaultConditions, type Measurement, type Sample } from "./types";
const measurement = (l: number): Measurement => ({
  id: `m${l}`,
  createdAt: "2026-10-26T00:00:00Z",
  source: "SPECTRO_LAB",
  conditions: defaultConditions,
  lab: { l, a: 10, b: 5 },
});
const sample = (current: Measurement): Sample => ({
  id: "previous",
  createdAt: current.createdAt,
  target: measurement(50),
  current,
  photoIds: [],
  components: [],
  comment: "",
});
it("показывает обе разницы и приближение к эталону", () => {
  const r = progress(measurement(50), measurement(48), sample(measurement(40)));
  expect(r.trend).toBe("CLOSER");
  expect(r.gain).toBeGreaterThan(0);
  expect(r.fromPrevious!.l).toBe(8);
  expect(r.toTarget!.l).toBe(-2);
});
it("распознаёт ухудшение после добавки", () =>
  expect(
    progress(measurement(50), measurement(30), sample(measurement(48))).trend,
  ).toBe("FARTHER"));
it("не выдаёт вывод при смене условий", () => {
  const current = measurement(48);
  current.conditions = { ...defaultConditions, setup: "другой свет" };
  const r = progress(measurement(50), current, sample(measurement(40)));
  expect(r.trend).toBe("UNAVAILABLE");
  expect(r.toTarget).toBeUndefined();
  expect(r.fromPrevious).toBeUndefined();
});
it("не считает движение к другому эталону улучшением", () => {
  const r = progress(
    { ...measurement(50), id: "new-reference" },
    measurement(48),
    sample(measurement(40)),
  );
  expect(r.fromPrevious).toBeDefined();
  expect(r.trend).toBe("UNAVAILABLE");
});
it("первая проба не имеет выдуманного прошлого результата", () => {
  const r = progress(measurement(50), measurement(48));
  expect(r.fromPrevious).toBeUndefined();
  expect(r.gain).toBeUndefined();
  expect(r.advice.join()).toContain("первая проба");
});
it("нулевое изменение не считается улучшением", () =>
  expect(
    progress(measurement(50), measurement(40), sample(measurement(40))).trend,
  ).toBe("UNCHANGED"));
