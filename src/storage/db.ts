import Dexie, { type Table } from "dexie";
import {
  backupSchema,
  id,
  now,
  defaultConditions,
  type Ink,
  type Recipe,
  type Batch,
  type Profile,
  type Experiment,
  type Photo,
  type Settings,
  type Sample,
  type Measurement,
} from "../domain/types";
import { composition, normalize, total } from "../domain/mixture";
import { deltaE2000 } from "../color/color";
export class LabDB extends Dexie {
  inks!: Table<Ink, string>;
  recipes!: Table<Recipe, string>;
  batches!: Table<Batch, string>;
  profiles!: Table<Profile, string>;
  experiments!: Table<Experiment, string>;
  photos!: Table<Photo, string>;
  settings!: Table<Settings, string>;
  constructor(name = "FlexoColorLab") {
    super(name);
    this.version(1).stores({
      inks: "id,name",
      recipes: "id,familyId",
      batches: "id,createdAt",
      profiles: "id",
      experiments: "id,batchId",
      photos: "id",
      settings: "id",
    });
    this.version(2)
      .stores({
        batches: "id,createdAt,status",
        recipes: "id,familyId,version",
      })
      .upgrade(async (tx) => {
        await tx
          .table("batches")
          .toCollection()
          .modify((b) => {
            b.status ??= "ACTIVE";
            b.comment ??= "";
            b.samples ??= [];
            b.additions ??= [];
          });
      });
  }
}
export const db = new LabDB();
export async function seed(database = db) {
  await database.transaction(
    "rw",
    database.inks,
    database.settings,
    async () => {
      if (!(await database.settings.get("settings"))) {
        const names = [
          "Yellow",
          "Warm Red",
          "Rubine Red",
          "Rhodamine Red",
          "Orange",
          "Cyan",
          "Magenta",
          "Black",
          "White",
        ];
        await database.inks.bulkPut(
          names.map((name, i) => ({
            id: `double-v-${i}`,
            manufacturer: "Double V",
            name,
            code: "",
            type: "УФ-флексо",
            group: name,
            lot: "",
            createdAt: now(),
            notes:
              "Название базы. Цветовые координаты и свойства смешивания не установлены.",
            calibration: [],
          })),
        );
        await database.settings.put({
          id: "settings",
          tolerance: null,
          profileId: "",
          conditions: defaultConditions,
        });
      }
    },
  );
}
export async function exportData(database = db) {
  const [inks, recipes, batches, profiles, experiments, photos, settings] =
    await database.transaction("r", database.tables, () =>
      Promise.all([
        database.inks.toArray(),
        database.recipes.toArray(),
        database.batches.toArray(),
        database.profiles.toArray(),
        database.experiments.toArray(),
        database.photos.toArray(),
        database.settings.toArray(),
      ]),
    );
  return backupSchema.parse({
    format: "FlexoColorLab",
    version: 2,
    exportedAt: now(),
    inks,
    recipes,
    batches,
    profiles,
    experiments,
    photos,
    settings,
  });
}
export function validateBackup(raw: unknown) {
  const b = backupSchema.parse(raw);
  const unique = (arr: { id: string }[]) => {
    if (new Set(arr.map((r) => r.id)).size !== arr.length)
      throw Error("Повторяющиеся ID в резервной копии");
  };
  [
    b.inks,
    b.recipes,
    b.batches,
    b.profiles,
    b.experiments,
    b.photos,
    b.settings,
  ].forEach(unique);
  const inks = new Set(b.inks.map((i) => i.id)),
    photos = new Set(b.photos.map((p) => p.id)),
    profiles = new Set(b.profiles.map((p) => p.id)),
    batches = new Set(b.batches.map((p) => p.id));
  if (b.settings.length !== 1)
    throw Error("В копии должна быть одна запись настроек");
  if (b.settings[0].profileId && !profiles.has(b.settings[0].profileId))
    throw Error("Не найден активный профиль");
  const checkMeasurement = (m: Measurement) => {
    if (m.profileId && !profiles.has(m.profileId))
      throw Error("Не найден профиль измерения");
    if (m.source === "PHOTO_CALIBRATED" && !m.calibrationId)
      throw Error("У калиброванной оценки нет ID калибровки");
    if (m.source === "SPECTRO_SPECTRAL" && !m.spectral?.length)
      throw Error("У спектрального измерения отсутствует спектр");
    if (!Number.isFinite(Date.parse(m.createdAt)))
      throw Error("Некорректная дата измерения");
  };
  const check = (cs: { inkId: string; grams: string }[]) => {
    if (cs.some((c) => !inks.has(c.inkId)))
      throw Error("Неизвестная краска в составе");
    if (Number(total(cs)) <= 0) throw Error("Пустой состав");
  };
  b.recipes.forEach((r) => {
    check(r.components);
    if (r.source !== "OWN" && !r.sourceNote.trim())
      throw Error("Не указан источник рецептуры");
  });
  const versions = new Set<string>();
  b.recipes.forEach((r) => {
    const key = `${r.familyId}:${r.version}`;
    if (versions.has(key)) throw Error("Повторяющаяся версия рецептуры");
    versions.add(key);
  });
  b.batches.forEach((batch) => {
    unique(batch.samples);
    unique(batch.additions);
    check(batch.initial);
    batch.additions.forEach((a) => check([a.component]));
    batch.samples.forEach((s) => {
      check(s.components);
      checkMeasurement(s.target);
      checkMeasurement(s.current);
      if (s.photoIds.some((p) => !photos.has(p)))
        throw Error("Отсутствующая фотография");
      if (
        s.additionIds?.some((id) => !batch.additions.some((a) => a.id === id))
      )
        throw Error("Неизвестное событие добавки");
    });
  });
  b.profiles.forEach((p) => p.controls.forEach(checkMeasurement));
  b.experiments.forEach((e) => {
    if (!batches.has(e.batchId)) throw Error("Не найдена партия эксперимента");
    check(e.before);
    check(e.after);
    e.additions.forEach((a) => check([a.component]));
    checkMeasurement(e.beforeMeasurement);
    checkMeasurement(e.afterMeasurement);
  });
  return b;
}
export async function importData(raw: unknown, database = db) {
  const b = validateBackup(raw);
  await database.transaction("rw", database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()));
    await database.inks.bulkPut(b.inks);
    await database.recipes.bulkPut(b.recipes);
    await database.batches.bulkPut(b.batches);
    await database.profiles.bulkPut(b.profiles);
    await database.experiments.bulkPut(b.experiments);
    await database.photos.bulkPut(b.photos);
    await database.settings.bulkPut(b.settings);
  });
}
export function quality(before: Sample["current"], after: Sample["current"]) {
  const warnings: string[] = [];
  if (!before.conditions.setup.trim() || !after.conditions.setup.trim())
    warnings.push("Не указан идентификатор измерительной установки");
  if (
    JSON.stringify(before.conditions) !== JSON.stringify(after.conditions) ||
    before.profileId !== after.profileId ||
    before.calibrationId !== after.calibrationId ||
    before.source !== after.source
  )
    warnings.push(
      "Изменились условия или источник измерения — требуется нормализация",
    );
  if (
    before.source === "PHOTO_UNCALIBRATED" ||
    after.source === "PHOTO_UNCALIBRATED"
  )
    warnings.push("Некалиброванные фотографии");
  if (before.stats?.heterogeneous || after.stats?.heterogeneous)
    warnings.push("Неоднородная область");
  return warnings;
}
export async function saveSample(
  batchId: string,
  sample: Sample,
  photos: Photo[],
  database = db,
) {
  await database.transaction(
    "rw",
    database.batches,
    database.photos,
    database.experiments,
    async () => {
      const b = await database.batches.get(batchId);
      if (!b) throw Error("Партия не найдена");
      if (b.status !== "ACTIVE") throw Error("Партия завершена");
      if (
        JSON.stringify(composition(b)) !==
        JSON.stringify(normalize(sample.components))
      )
        throw Error("Состав изменился. Повторите сохранение пробы.");
      const prev = b.samples.at(-1);
      if (prev) {
        const start = new Date(prev.createdAt).getTime(),
          end = new Date(sample.createdAt).getTime();
        const additions = b.additions.filter((a) =>
          prev.additionIds
            ? !prev.additionIds.includes(a.id)
            : new Date(a.createdAt).getTime() > start &&
              new Date(a.createdAt).getTime() <= end,
        );
        if (additions.length) {
          const warnings = quality(prev.current, sample.current);
          await database.experiments.add({
            id: id(),
            batchId,
            before: prev.components,
            after: sample.components,
            beforeMeasurement: prev.current,
            afterMeasurement: sample.current,
            additions,
            excluded: warnings.length > 0,
            qualityWarnings: warnings,
          });
        }
      }
      await database.photos.bulkPut(photos);
      sample.additionIds = b.additions.map((a) => a.id);
      b.samples.push(sample);
      await database.batches.put(b);
    },
  );
}
export async function addInk(
  batchId: string,
  inkId: string,
  grams: string,
  comment: string,
  database = db,
) {
  await database.transaction("rw", database.batches, async () => {
    const b = await database.batches.get(batchId);
    if (!b) throw Error("Партия не найдена");
    if (b.status === "DONE") throw Error("Партия завершена");
    const component = normalize([{ inkId, grams }])[0];
    if (!component) throw Error("Добавка должна быть больше нуля");
    b.additions.push({ id: id(), createdAt: now(), component, comment });
    composition(b);
    await database.batches.put(b);
  });
}
export const repeatability = (controls: Sample["current"][]) =>
  Math.max(
    0,
    ...controls.flatMap((a, i) =>
      controls.slice(i + 1).map((b) => deltaE2000(a.lab, b.lab)),
    ),
  );
