import { describe, it, expect } from "vitest";
import { mass, normalize, total, scale, percent, composition } from "./mixture";
import type { Batch } from "./types";
describe("Точная арифметика", () => {
  it("складывает без ошибки binary floating point", () =>
    expect(
      total([
        { inkId: "a", grams: "0.1" },
        { inkId: "a", grams: "0.2" },
      ]),
    ).toBe("0.3"));
  it("проценты и масштабирование", () => {
    const cs = [
      { inkId: "a", grams: "750" },
      { inkId: "b", grams: "250" },
    ];
    expect(percent(cs[0], cs)).toBe("75.00");
    expect(scale(cs, "2000")).toEqual([
      { inkId: "a", grams: "1500" },
      { inkId: "b", grams: "500" },
    ]);
  });
  it("сохраняет точную общую массу после округления", () => {
    expect(
      total(
        scale(
          [
            { inkId: "a", grams: "1" },
            { inkId: "b", grams: "1" },
            { inkId: "c", grams: "1" },
          ],
          "1",
        ),
      ),
    ).toBe("1");
  });
  it("последовательные добавки", () => {
    const b = {
      initial: [{ inkId: "a", grams: "100" }],
      additions: [
        { component: { inkId: "a", grams: "0.1" } },
        { component: { inkId: "b", grams: "5" } },
      ],
    } as Batch;
    expect(total(composition(b))).toBe("105.1");
  });
  it.each(["-1", "NaN", "Infinity", "1.0001", "1e3", ""])(
    "отвергает массу %s",
    (v) => expect(() => mass(v)).toThrow(),
  );
  it("не допускает пустой масштаб", () =>
    expect(() => scale([], "1")).toThrow());
  it("объединяет дубликаты", () =>
    expect(
      normalize([
        { inkId: "a", grams: "1" },
        { inkId: "a", grams: "2" },
      ]),
    ).toEqual([{ inkId: "a", grams: "3" }]));
});
