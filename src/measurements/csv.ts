import {
  labSchema,
  defaultConditions,
  id,
  now,
  type Measurement,
  type Conditions,
} from "../domain/types";
export function parseMeasurements(
  text: string,
  conditions: Conditions = defaultConditions,
): Measurement[] {
  const lines = text
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  if (lines.length < 2) throw Error("CSV должен содержать заголовок и данные");
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((s) => s.trim().toLowerCase());
  const idx = ["l", "a", "b"].map((k) => headers.indexOf(k));
  if (idx.includes(-1))
    throw Error(
      "Нужны столбцы L,a,b. Дополнительно: R400,R410… (отражение 0–1)",
    );
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cells = line.split(sep).map((s) => s.trim());
      const num = (s: string) => {
        if (!s) throw Error("Пустое значение CSV");
        const n = Number(s.replace(",", "."));
        if (!Number.isFinite(n)) throw Error("Некорректное число CSV");
        return n;
      };
      const lab = labSchema.parse({
        l: num(cells[idx[0]]),
        a: num(cells[idx[1]]),
        b: num(cells[idx[2]]),
      });
      const spectral = headers.flatMap((s, i) =>
        /^r\d{3}$/.test(s)
          ? [{ nm: Number(s.slice(1)), value: num(cells[i]) }]
          : [],
      );
      if (
        spectral.some(
          (p) => p.nm < 300 || p.nm > 900 || p.value < 0 || p.value > 1,
        )
      )
        throw Error(
          "Спектральное отражение должно быть 0–1; длины волн 300–900 нм",
        );
      return {
        id: id(),
        createdAt: now(),
        source: spectral.length ? "SPECTRO_SPECTRAL" : "SPECTRO_LAB",
        lab,
        conditions: { ...conditions },
        ...(spectral.length ? { spectral } : {}),
      };
    });
}
