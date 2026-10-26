import data from "../data/coated.json";
import { adapt, whites, rgbToLab } from "../color/color";
import type { Lab, Pantone } from "./types";
import { pantoneKey } from "./pantones";
export function labHex(lab: Lab) {
  const fy = (lab.l + 16) / 116,
    fx = fy + lab.a / 500,
    fz = fy - lab.b / 200;
  const inverse = (n: number) =>
    n > 6 / 29 ? n ** 3 : 3 * (6 / 29) ** 2 * (n - 4 / 29);
  const xyz = adapt(
    [
      inverse(fx) * whites.D50[0],
      inverse(fy) * whites.D50[1],
      inverse(fz) * whites.D50[2],
    ],
    whites.D50,
    whites.D65,
  );
  const [x, y, z] = xyz;
  const rgb = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ].map((v) =>
    Math.round(
      Math.max(
        0,
        Math.min(
          1,
          v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055,
        ),
      ) * 255,
    ),
  );
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export const fan: Pantone[] = data.map((entry) => {
  const hex =
    "hex" in entry && entry.hex
      ? entry.hex
      : labHex({ l: entry.lab![0], a: entry.lab![1], b: entry.lab![2] });
  const lab =
    "lab" in entry && entry.lab
      ? { l: entry.lab[0], a: entry.lab[1], b: entry.lab[2] }
      : rgbToLab([
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        ]);
  return {
    id: pantoneKey(entry.name),
    pantone: entry.name,
    name: "Solid Coated",
    createdAt: "2026-10-26T00:00:00Z",
    notes: "",
    references: [],
    currentReferenceId: "",
    catalog: {
      hex,
      lab,
      edition: entry.edition,
      source:
        entry.edition === "2026"
          ? "https://pantoneconverter.com/new-pantone-colors-2026/"
          : "https://github.com/aj90909/unofficial-pantone-solid-coated-2024-v5",
    },
  };
});
export const fanMap = new Map(fan.map((entry) => [entry.id, entry]));
export function withFan(custom: Pantone[]) {
  const entries = new Map(fanMap);
  for (const entry of custom)
    entries.set(entry.id, {
      ...fanMap.get(entry.id),
      ...entry,
      catalog: entry.catalog || fanMap.get(entry.id)?.catalog,
    });
  return [...entries.values()];
}
