import { mass, normalize, total } from "./mixture";
import { pantoneKey } from "./pantones";
import type { Ink, Recipe } from "./types";

export type IncomingRecipe = {
  name: string;
  pantone: string;
  source: Recipe["source"];
  sourceNote: string;
  version?: number;
  components: {
    name: string;
    code: string;
    manufacturer: string;
    grams: string;
  }[];
};
export const recipeCSVHeader = [
  "pantone",
  "name",
  "ink",
  "code",
  "manufacturer",
  "grams",
  "source",
  "sourceNote",
  "version",
];

/** RFC 4180 quoting, including newlines and doubled quotes; also accepts ; and tabs. */
function readCSV(input: string) {
  if (input.length > 5 * 1024 * 1024) throw Error("Файл больше 5 МБ");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const separator = [";", "\t", ","].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    endedQuote = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === undefined) throw Error("Не закрыты кавычки CSV");
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else value += char;
      continue;
    }
    if (char === '"' && !value && !endedQuote) {
      quoted = true;
      continue;
    }
    if (
      char === separator ||
      char === "\n" ||
      char === "\r" ||
      char === undefined
    ) {
      row.push(value.trim());
      value = "";
      endedQuote = false;
      if (char !== separator) {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
        if (rows.length > 12001)
          throw Error("В одном файле допустимо до 12 000 строк");
      }
    } else {
      if (endedQuote && char.trim())
        throw Error("Лишний текст после кавычек CSV");
      if (!endedQuote) value += char;
    }
  }
  return rows;
}

export function parseRecipeCSV(input: string): IncomingRecipe[] {
  const rows = readCSV(input),
    headers = rows.shift()?.map((s) => s.toLowerCase());
  if (
    !headers ||
    !["pantone", "ink", "grams"].every((key) => headers.includes(key))
  )
    throw Error(
      "Нужны столбцы pantone, ink, grams. Файл RGB/Lab не содержит рецептур.",
    );
  if (new Set(headers).size !== headers.length)
    throw Error("Повторяющиеся заголовки CSV");
  if (
    headers.some((h) => !recipeCSVHeader.some((key) => key.toLowerCase() === h))
  )
    throw Error("Неизвестные столбцы. Скачайте шаблон рецептур.");
  const recipes = new Map<string, IncomingRecipe>();
  rows.forEach((cells, index) => {
    const line = index + 2;
    if (cells.length !== headers.length)
      throw Error(`Строка ${line}: число столбцов отличается от заголовка`);
    const get = (key: string) =>
      cells[headers.indexOf(key.toLowerCase())] || "";
    const pantone = pantoneKey(get("pantone")),
      name = get("name") || pantone,
      source = get("source") || "OWN",
      sourceNote = get("sourceNote");
    if (!pantone || !get("ink") || !get("manufacturer"))
      throw Error(
        `Строка ${line}: укажите Pantone, название базы и manufacturer`,
      );
    if (cells.some((s) => s.length > 2000))
      throw Error(`Строка ${line}: слишком длинное поле`);
    if (!["OWN", "SUPPLIER", "PANTONE"].includes(source))
      throw Error(
        `Строка ${line}: source должен быть OWN, SUPPLIER или PANTONE`,
      );
    if (source !== "OWN" && !sourceNote)
      throw Error(`Строка ${line}: нужен источник рецептуры sourceNote`);
    let grams: string;
    try {
      grams = mass(get("grams")).toFixed();
      if (Number(grams) <= 0) throw Error();
    } catch {
      throw Error(
        `Строка ${line}: масса должна быть больше нуля, до 3 знаков после запятой`,
      );
    }
    const version = get("version");
    if (
      version &&
      (!/^\d+$/.test(version) ||
        Number(version) < 1 ||
        !Number.isSafeInteger(Number(version)))
    )
      throw Error(`Строка ${line}: некорректная версия`);
    const key = JSON.stringify([pantone, name, source, sourceNote, version]);
    const recipe = recipes.get(key) || {
      name,
      pantone,
      source: source as Recipe["source"],
      sourceNote,
      version: version ? Number(version) : undefined,
      components: [],
    };
    recipe.components.push({
      name: get("ink"),
      code: get("code"),
      manufacturer: get("manufacturer"),
      grams,
    });
    if (recipe.components.length > 100)
      throw Error(`Строка ${line}: больше 100 компонентов в рецептуре`);
    recipes.set(key, recipe);
  });
  if (!recipes.size) throw Error("В файле нет рецептур");
  return [...recipes.values()];
}

export const inkIdentity = (ink: {
  manufacturer: string;
  code: string;
  name: string;
}) =>
  [
    ink.manufacturer.trim().toUpperCase(),
    (ink.code || ink.name).trim().toUpperCase(),
  ].join("\u001f");
export const recipeSignature = (
  recipe: Pick<
    Recipe,
    "name" | "pantone" | "source" | "sourceNote" | "components"
  >,
) =>
  JSON.stringify([
    recipe.name,
    pantoneKey(recipe.pantone),
    recipe.source,
    recipe.sourceNote,
    normalize(recipe.components).sort((a, b) => a.inkId.localeCompare(b.inkId)),
  ]);

export function exportRecipeCSV(recipes: Recipe[], inks: Ink[]) {
  const cell = (value: string) =>
    '"' +
    (/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [
      recipeCSVHeader,
      ...[...recipes]
        .sort(
          (a, b) =>
            a.familyId.localeCompare(b.familyId) || a.version - b.version,
        )
        .flatMap((r) =>
          r.components.map((c) => {
            const ink = inks.find((i) => i.id === c.inkId);
            if (!ink) throw Error("Не найдена краска рецептуры");
            return [
              r.pantone,
              r.name,
              ink.name,
              ink.code,
              ink.manufacturer,
              c.grams,
              r.source,
              r.sourceNote,
              String(r.version),
            ];
          }),
        ),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}

export function incomingMass(recipe: IncomingRecipe) {
  return total(
    recipe.components.map((c, i) => ({ inkId: String(i), grams: c.grams })),
  );
}
