// Generates an explicitly synthetic backup. Never loaded automatically by the app.
import { mkdir, writeFile } from "node:fs/promises";
const createdAt = "2026-01-01T00:00:00.000Z";
const ink = {
  id: "demo-yellow",
  manufacturer: "ТЕСТОВЫЙ производитель",
  name: "ТЕСТОВАЯ база A",
  code: "DEMO-ONLY",
  type: "Синтетические данные",
  group: "Тест",
  lot: "DEMO",
  createdAt,
  notes: "Не реальная краска. Не использовать для производства.",
  calibration: [],
};
const recipe = {
  id: "demo-recipe-v1",
  familyId: "demo-recipe",
  version: 1,
  name: "ДЕМОНСТРАЦИЯ · не производственная рецептура",
  pantone: "НЕ PANTONE · DEMO",
  source: "OWN",
  sourceNote: "Синтетические данные только для проверки интерфейса",
  components: [{ inkId: ink.id, grams: "1000" }],
  createdAt,
};
const backup = {
  format: "FlexoColorLab",
  version: 2,
  exportedAt: createdAt,
  inks: [ink],
  recipes: [recipe],
  batches: [
    {
      id: "demo-batch",
      name: "ТЕСТОВАЯ партия · не для производства",
      pantone: "DEMO",
      createdAt,
      initial: recipe.components,
      additions: [],
      samples: [],
      comment: "Синтетический пример. Измерений и рекомендаций нет.",
      status: "ACTIVE",
    },
  ],
  profiles: [],
  experiments: [],
  photos: [],
  settings: [
    {
      id: "settings",
      tolerance: null,
      profileId: "",
      conditions: {
        illuminant: "D50",
        observer: "2",
        geometry: "неизвестна",
        mode: "unknown",
        setup: "",
        whitePoint: "D50",
      },
    },
  ],
};
await mkdir("fixtures", { recursive: true });
await writeFile(
  "fixtures/DEMO-ONLY.json",
  JSON.stringify(backup, null, 2) + "\n",
);
