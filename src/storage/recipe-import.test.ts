import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { parseRecipeCSV, exportRecipeCSV } from "../domain/recipe-transfer";
import { importRecipes } from "./recipe-import";
import { LabDB, seed, exportData } from "./db";
import { id } from "../domain/types";

const csv =
  'pantone;name;ink;code;manufacturer;grams;source;sourceNote;version\r\nTEST 1 C;"Учебный; состав";База A;A;Тестовый производитель;75,5;OWN;"Синтетический тест\nдве строки";1\r\nTEST 1 C;"Учебный; состав";База B;B;Тестовый производитель;24,5;OWN;"Синтетический тест\nдве строки";1';
describe("таблицы рецептур", () => {
  it("читает массовые доли, кавычки, BOM, переносы строк и десятичную запятую", () => {
    const data = parseRecipeCSV("\uFEFF" + csv);
    expect(data).toHaveLength(1);
    expect(data[0].components.map((c) => c.grams)).toEqual(["75.5", "24.5"]);
    expect(data[0].sourceNote).toBe("Синтетический тест\nдве строки");
    expect(data[0].name).toBe("Учебный; состав");
  });
  it.each([
    ["pantone,hex,lab\n100 C,#ff0000,50", "Нужны столбцы"],
    ["pantone,ink,grams,manufacturer\nTEST,Test,0,Demo", "масса"],
    [
      "pantone,ink,grams,manufacturer,source\nTEST,Test,10,Demo,PANTONE",
      "источник",
    ],
    ["pantone,ink,grams\nTEST,Test,10", "manufacturer"],
    ['pantone,ink,grams,manufacturer\nTEST,"Test,10,Demo', "кавычки"],
    [
      "pantone,ink,grams,manufacturer\nTEST,Test,10,Demo,Extra",
      "число столбцов",
    ],
  ])("не принимает ошибочные таблицы: %s", (input, error) =>
    expect(() => parseRecipeCSV(input)).toThrow(error),
  );
  it("массово добавляет, пропускает дубли, создаёт версии и экспортирует без замены базы", async () => {
    const database = new LabDB(id());
    try {
      await seed(database);
      const initial = await database.inks.count();
      expect(await importRecipes(parseRecipeCSV(csv), database)).toEqual({
        recipes: 1,
        inks: 2,
        skipped: 0,
      });
      expect(await importRecipes(parseRecipeCSV(csv), database)).toEqual({
        recipes: 0,
        inks: 0,
        skipped: 1,
      });
      expect(await database.inks.count()).toBe(initial + 2);
      const changed = parseRecipeCSV(csv);
      changed[0].components[0].grams = "76";
      expect((await importRecipes(changed, database)).recipes).toBe(1);
      const recipes = await database.recipes.toArray();
      expect(recipes.map((r) => r.version).sort()).toEqual([1, 2]);
      expect(new Set(recipes.map((r) => r.familyId)).size).toBe(1);
      const exported = exportRecipeCSV(recipes, await database.inks.toArray());
      const roundtrip = parseRecipeCSV(exported);
      expect(roundtrip.map((r) => r.version)).toEqual([1, 2]);
      expect((await importRecipes(roundtrip, database)).skipped).toBe(2);
      expect((await database.pantones.toArray())[0].pantone).toBe("TEST 1 C");
      expect((await exportData(database)).recipes).toHaveLength(2);
    } finally {
      await database.delete();
    }
  });
  it("откатывает весь импорт, если одна из рецептур повреждена", async () => {
    const database = new LabDB(id());
    try {
      await seed(database);
      const initial = await database.inks.count(),
        incoming = parseRecipeCSV(csv);
      await expect(
        importRecipes(
          [...incoming, { ...incoming[0], pantone: "BAD", components: [] }],
          database,
        ),
      ).rejects.toThrow();
      expect(await database.inks.count()).toBe(initial);
      expect(await database.recipes.count()).toBe(0);
      expect(await database.pantones.count()).toBe(0);
    } finally {
      await database.delete();
    }
  });
});
