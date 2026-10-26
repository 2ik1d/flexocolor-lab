import { db } from "./db";
import {
  id,
  now,
  recipeSchema,
  inkSchema,
  type Recipe,
  type Ink,
} from "../domain/types";
import {
  inkIdentity,
  recipeSignature,
  type IncomingRecipe,
} from "../domain/recipe-transfer";
import { normalize, total } from "../domain/mixture";
import { pantoneKey } from "../domain/pantones";

/** Additive, atomic import: existing formulations remain separate versions. */
export async function importRecipes(incoming: IncomingRecipe[], database = db) {
  return database.transaction(
    "rw",
    database.inks,
    database.recipes,
    database.pantones,
    async () => {
      const inks = await database.inks.toArray(),
        recipes = await database.recipes.toArray();
      const knownInks = new Map(inks.map((ink) => [inkIdentity(ink), ink]));
      const signatures = new Set(recipes.map(recipeSignature));
      const newInks: Ink[] = [],
        newRecipes: Recipe[] = [];
      let skipped = 0;
      for (const entry of [...incoming].sort(
        (a, b) => (a.version || 1) - (b.version || 1),
      )) {
        if (
          !entry.pantone.trim() ||
          (entry.source !== "OWN" && !entry.sourceNote.trim())
        )
          throw Error("Укажите Pantone и источник внешней рецептуры");
        const components = normalize(
          entry.components.map((component) => {
            const key = inkIdentity(component);
            let ink = knownInks.get(key);
            if (!ink) {
              ink = inkSchema.parse({
                ...component,
                id: id(),
                type: "",
                group: "",
                lot: "",
                notes: "Добавлена при импорте рецептур",
                calibration: [],
                createdAt: now(),
              });
              knownInks.set(key, ink);
              newInks.push(ink);
            }
            return { inkId: ink.id, grams: component.grams };
          }),
        );
        if (Number(total(components)) <= 0)
          throw Error("Пустой состав рецептуры");
        const signature = recipeSignature({ ...entry, components });
        if (signatures.has(signature)) {
          skipped++;
          continue;
        }
        const family = [...recipes, ...newRecipes].filter(
          (r) =>
            pantoneKey(r.pantone) === pantoneKey(entry.pantone) &&
            r.name === entry.name &&
            r.source === entry.source &&
            r.sourceNote === entry.sourceNote,
        );
        const recipe = recipeSchema.parse({
          ...entry,
          id: id(),
          familyId: family[0]?.familyId || id(),
          version: Math.max(0, ...family.map((r) => r.version)) + 1,
          components,
          createdAt: now(),
        });
        newRecipes.push(recipe);
        signatures.add(signature);
        const key = pantoneKey(recipe.pantone);
        if (!(await database.pantones.get(key)))
          await database.pantones.put({
            id: key,
            pantone: recipe.pantone,
            name: "",
            notes: "",
            references: [],
            currentReferenceId: "",
            createdAt: now(),
          });
      }
      await database.inks.bulkAdd(newInks);
      await database.recipes.bulkAdd(newRecipes);
      return { recipes: newRecipes.length, inks: newInks.length, skipped };
    },
  );
}
