import Dexie, { type Table } from "dexie";
import { z } from "zod";
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
  type Order,
  type OrderReference,
  type Component,
  orderReferenceSchema,
} from "../domain/types";
import {
  migrateLegacyBatches,
  makeRun,
  upgradeOrderColors,
  makeWorkingBatch,
  type NewRun,
} from "../domain/orders";
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
  orders!: Table<Order, string>;
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
    this.version(3)
      .stores({
        orders: "id,name,code",
        batches: "id,createdAt,status,orderId",
      })
      .upgrade(async (tx) => {
        const batches = await tx.table<Batch>("batches").toArray();
        const orders = migrateLegacyBatches(batches);
        await tx.table("orders").bulkPut(orders);
        await tx.table("batches").bulkPut(batches);
      });
    this.version(4)
      .stores({ batches: "id,createdAt,status,orderId,colorId" })
      .upgrade(async (tx) => {
        const orders = await tx.table<Order>("orders").toArray(),
          batches = await tx.table<Batch>("batches").toArray();
        upgradeOrderColors(orders, batches);
        await tx.table("orders").bulkPut(orders);
        await tx.table("batches").bulkPut(batches);
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
  const [
    inks,
    recipes,
    batches,
    profiles,
    experiments,
    photos,
    settings,
    orders,
  ] = await database.transaction("r", database.tables, () =>
    Promise.all([
      database.inks.toArray(),
      database.recipes.toArray(),
      database.batches.toArray(),
      database.profiles.toArray(),
      database.experiments.toArray(),
      database.photos.toArray(),
      database.settings.toArray(),
      database.orders.toArray(),
    ]),
  );
  return backupSchema.parse({
    format: "FlexoColorLab",
    version: 4,
    exportedAt: now(),
    inks,
    recipes,
    batches,
    profiles,
    experiments,
    photos,
    settings,
    orders,
  });
}
export function validateBackup(raw: unknown) {
  let input = raw;
  if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 2
  ) {
    // Parse every legacy field before deriving orders; never mutate the source.
    const legacy = backupSchema
      .omit({ orders: true })
      .extend({ version: z.literal(2) })
      .parse(raw);
    const batches = structuredClone(legacy.batches);
    const orders = migrateLegacyBatches(batches);
    upgradeOrderColors(orders, batches);
    input = { ...legacy, version: 4, batches, orders };
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 3
  ) {
    const legacy = backupSchema.extend({ version: z.literal(3) }).parse(raw);
    upgradeOrderColors(legacy.orders, legacy.batches);
    input = { ...legacy, version: 4 };
  }
  const b = backupSchema.parse(input);
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
    b.orders,
  ].forEach(unique);
  const inks = new Set(b.inks.map((i) => i.id)),
    photos = new Set(b.photos.map((p) => p.id)),
    profiles = new Set(b.profiles.map((p) => p.id)),
    batches = new Set(b.batches.map((p) => p.id)),
    orders = new Map(b.orders.map((o) => [o.id, o]));
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
    if (batch.orderId) {
      const order = orders.get(batch.orderId);
      if (!order) throw Error("Не найден заказ запуска");
      const color = batch.colorId
        ? order.colors.find((c) => c.id === batch.colorId)
        : undefined;
      if (batch.colorId && !color) throw Error("Не найден Pantone заказа");
      if (
        batch.referenceId &&
        !(color?.references || order.references).some(
          (r) => r.id === batch.referenceId,
        )
      )
        throw Error("Не найден эталон запуска");
    }
    unique(batch.samples);
    unique(batch.additions);
    if (batch.initial.length || batch.compositionKnown !== false)
      check(batch.initial);
    batch.additions.forEach((a) => check([a.component]));
    batch.samples.forEach((s) => {
      if (s.referenceId && s.referenceId !== batch.referenceId)
        throw Error("Эталон пробы не соответствует смеси");
      if (s.components.length || batch.compositionKnown !== false)
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
  b.orders.forEach((o) => {
    unique(o.colors);
    o.colors.forEach((c) => {
      unique(c.references);
      if (
        c.currentReferenceId &&
        !c.references.some((r) => r.id === c.currentReferenceId)
      )
        throw Error("Не найден эталон Pantone");
      c.references.forEach((r) => {
        checkMeasurement(r.measurement);
        if (r.photoIds.some((p) => !photos.has(p)))
          throw Error("Отсутствует фото эталона Pantone");
      });
    });
    unique(o.references);
    if (
      o.currentReferenceId &&
      !o.references.some((r) => r.id === o.currentReferenceId)
    )
      throw Error("Не найден текущий эталон заказа");
    o.references.forEach((r) => {
      checkMeasurement(r.measurement);
      if (r.photoIds.some((p) => !photos.has(p)))
        throw Error("Отсутствует фото эталона заказа");
    });
  });
  b.profiles.forEach((p) => p.controls.forEach(checkMeasurement));
  b.experiments.forEach((e) => {
    if (!batches.has(e.batchId)) throw Error("Не найдена партия эксперимента");
    if (e.before.length) check(e.before);
    else if (!e.excluded)
      throw Error("Неизвестный исходный состав эксперимента");
    if (e.after.length) check(e.after);
    else if (!e.excluded) throw Error("Неизвестный состав эксперимента");
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
    await database.orders.bulkPut(b.orders);
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
      if (b.orderId && sample.referenceId !== b.referenceId)
        throw Error("Эталон пробы не соответствует запуску заказа");
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
          if (b.compositionKnown === false)
            warnings.push("Исходный состав краски неизвестен");
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
export async function saveOrderReference(
  orderId: string,
  reference: OrderReference,
  photos: Photo[],
  database = db,
) {
  const r = orderReferenceSchema.parse(reference);
  await database.transaction(
    "rw",
    database.orders,
    database.photos,
    async () => {
      const order = await database.orders.get(orderId);
      if (!order) throw Error("Заказ не найден");
      if (order.references.some((old) => old.id === r.id))
        throw Error("Эта версия эталона уже сохранена");
      await database.photos.bulkPut(photos);
      if ((await database.photos.bulkGet(r.photoIds)).some((p) => !p))
        throw Error("Фото эталона не найдено");
      await database.orders.put({
        ...order,
        references: [...order.references, r],
        currentReferenceId: r.id,
      });
    },
  );
}
export async function createRun(orderId: string, input: NewRun, database = db) {
  return database.transaction(
    "rw",
    database.orders,
    database.batches,
    async () => {
      const order = await database.orders.get(orderId);
      if (!order) throw Error("Заказ не найден");
      const run = makeRun(order, input);
      await database.batches.add(run);
      return run;
    },
  );
}
export async function saveColorReference(
  orderId: string,
  colorId: string,
  reference: OrderReference,
  photos: Photo[],
  database = db,
) {
  const r = orderReferenceSchema.parse(reference);
  await database.transaction(
    "rw",
    database.orders,
    database.photos,
    async () => {
      const order = await database.orders.get(orderId),
        color = order?.colors.find((c) => c.id === colorId);
      if (!order || !color) throw Error("Pantone заказа не найден");
      if (color.references.some((old) => old.id === r.id))
        throw Error("Эталон уже сохранён");
      await database.photos.bulkPut(photos);
      if ((await database.photos.bulkGet(r.photoIds)).some((p) => !p))
        throw Error("Фото эталона не найдено");
      color.references.push(r);
      color.currentReferenceId = r.id;
      // Retain the old single-colour fields for compatibility with previous backups.
      if (order.colors[0].id === colorId) {
        order.references = color.references;
        order.currentReferenceId = r.id;
      }
      await database.orders.put(order);
    },
  );
}
export async function ensureWorkingBatch(
  orderId: string,
  colorId: string,
  database = db,
) {
  return database.transaction(
    "rw",
    database.orders,
    database.batches,
    async () => {
      const order = await database.orders.get(orderId),
        color = order?.colors.find((c) => c.id === colorId);
      if (!order || !color) throw Error("Pantone заказа не найден");
      const batches = (
        await database.batches.where("colorId").equals(colorId).toArray()
      )
        .filter((b) => b.orderId === orderId && b.status === "ACTIVE")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const existing = batches.find(
        (b) => b.referenceId === (color.currentReferenceId || undefined),
      );
      if (existing) return existing;
      const unreferenced = batches.find(
        (b) => !b.referenceId && !b.samples.length,
      );
      if (unreferenced) {
        unreferenced.referenceId = color.currentReferenceId || undefined;
        await database.batches.put(unreferenced);
        return unreferenced;
      }
      const batch = makeWorkingBatch(order, color);
      await database.batches.add(batch);
      return batch;
    },
  );
}
export async function setColorComposition(
  orderId: string,
  colorId: string,
  components: Component[],
  database = db,
) {
  const initial = normalize(components);
  if (!Number(total(initial)))
    throw Error("Укажите компоненты и положительные массы");
  return database.transaction(
    "rw",
    database.orders,
    database.batches,
    async () => {
      const current = await ensureWorkingBatch(orderId, colorId, database);
      if (!current.samples.length && !current.additions.length) {
        current.initial = initial;
        current.compositionKnown = true;
        await database.batches.put(current);
        return current;
      }
      const order = (await database.orders.get(orderId))!,
        color = order.colors.find((c) => c.id === colorId)!;
      await database.batches.update(current.id, { status: "DONE" });
      const next = makeWorkingBatch(order, color, initial);
      await database.batches.add(next);
      return next;
    },
  );
}
export async function addComponents(
  batchId: string,
  components: Component[],
  comment: string,
  database = db,
) {
  const additions = normalize(components);
  if (!additions.length) throw Error("Введите массу хотя бы одной добавки");
  await database.transaction(
    "rw",
    database.batches,
    database.inks,
    async () => {
      const batch = await database.batches.get(batchId);
      if (!batch || batch.status !== "ACTIVE")
        throw Error("Текущая краска недоступна");
      if (
        (await database.inks.bulkGet(additions.map((c) => c.inkId))).some(
          (i) => !i,
        )
      )
        throw Error("Краска не найдена в справочнике");
      const operationId = id(),
        createdAt = now();
      batch.additions.push(
        ...additions.map((component) => ({
          id: id(),
          operationId,
          createdAt,
          component,
          comment,
        })),
      );
      composition(batch);
      await database.batches.put(batch);
    },
  );
}
