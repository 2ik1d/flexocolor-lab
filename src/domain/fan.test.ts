import { expect, it } from "vitest";
import { fan, fanMap, labHex, withFan } from "./fan";
it("готовый Coated содержит уникальные цвета и все 224 новинки 2026", () => {
  expect(fan.length).toBe(3443);
  expect(fanMap.size).toBe(fan.length);
  expect(fan.filter((c) => c.catalog?.edition === "2026")).toHaveLength(224);
  expect(fanMap.get("6225 C")?.catalog?.hex).toBe("#efd400");
  expect(fanMap.has("185 C")).toBe(true);
  for (const color of fan) {
    expect(color.catalog?.hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.catalog!.lab.l).toBeGreaterThanOrEqual(0);
    expect(color.catalog!.lab.l).toBeLessThanOrEqual(100);
    expect(color.references).toHaveLength(0);
  }
});
it("экранные Lab не становятся измеренным эталоном, свои данные имеют приоритет", () => {
  const own = {
    ...fanMap.get("185 C")!,
    name: "Цвет клиента",
    notes: "Свой состав",
    catalog: undefined,
  };
  const result = withFan([own]).find((c) => c.id === "185 C")!;
  expect(result.name).toBe("Цвет клиента");
  expect(result.catalog).toBeDefined();
  expect(result.references).toEqual([]);
  expect(result.currentReferenceId).toBe("");
  expect(labHex({ l: 100, a: 0, b: 0 })).toBe("#ffffff");
  expect(labHex({ l: 0, a: 0, b: 0 })).toBe("#000000");
});
