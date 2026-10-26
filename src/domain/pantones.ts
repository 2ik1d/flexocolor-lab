import type { Order, Pantone, Recipe } from "./types";

export const pantoneKey = (value: string) =>
  value
    .trim()
    .replace(/^pantone\s+/i, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

/** A shared index of names and reference snapshots, never shared order history. */
export function collectPantones(
  orders: Order[],
  recipes: Recipe[] = [],
): Pantone[] {
  const entries = new Map<string, Pantone>();
  for (const order of [...orders].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )) {
    for (const color of order.colors) {
      const key = pantoneKey(color.pantone);
      if (!key) continue;
      const entry = entries.get(key) || {
        id: key,
        pantone: color.pantone.trim(),
        name: color.name,
        createdAt: order.createdAt,
        notes: "",
        references: [],
        currentReferenceId: "",
      };
      for (const reference of color.references)
        if (
          (!reference.pantone || pantoneKey(reference.pantone) === key) &&
          !entry.references.some((r) => r.id === reference.id)
        )
          entry.references.push(structuredClone(reference));
      const latest = [...entry.references].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      entry.currentReferenceId = latest?.id || "";
      entries.set(key, entry);
    }
  }
  for (const recipe of recipes) {
    const key = pantoneKey(recipe.pantone);
    if (key && !entries.has(key))
      entries.set(key, {
        id: key,
        pantone: recipe.pantone.trim(),
        name: "",
        createdAt: recipe.createdAt,
        notes: "",
        references: [],
        currentReferenceId: "",
      });
  }
  return [...entries.values()];
}
