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
  orderSchema,
  pantoneSchema,
  type Pantone,
} from "../domain/types";
import { collectPantones, pantoneKey } from "../domain/pantones";
import { comparable, sameConditions } from "../domain/progress";
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
  pantones!: Table<Pantone, string>;
  drafts!: Table<{ id: string; value: unknown }, string>;
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
    this.version(5)
      .stores({ pantones: "id,pantone", orders: "id,name,code,status" })
      .upgrade(async (tx) => {
        const orders = await tx.table<Order>("orders").toArray();
        const recipes = await tx.table<Recipe>("recipes").toArray();
        await tx.table("pantones").bulkPut(collectPantones(orders, recipes));
      });
    this.version(6).stores({ drafts: "id" });
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
    pantones,
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
      database.pantones.toArray(),
    ]),
  );
  return backupSchema.parse({
    format: "FlexoColorLab",
    version: 5,
    exportedAt: now(),
    inks,
    recipes,
    batches,
    profiles,
    experiments,
    photos,
    settings,
    orders,
    pantones,
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
      .omit({ orders: true, pantones: true })
      .extend({ version: z.literal(2) })
      .parse(raw);
    const batches = structuredClone(legacy.batches);
    const orders = migrateLegacyBatches(batches);
    upgradeOrderColors(orders, batches);
    input = {
      ...legacy,
      version: 5,
      batches,
      orders,
      pantones: collectPantones(orders, legacy.recipes),
    };
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 3
  ) {
    const legacy = backupSchema
      .omit({ pantones: true })
      .extend({ version: z.literal(3) })
      .parse(raw);
    upgradeOrderColors(legacy.orders, legacy.batches);
    input = {
      ...legacy,
      version: 5,
      pantones: collectPantones(legacy.orders, legacy.recipes),
    };
  } else if (
    typeof raw === "object" &&
    raw !== null &&
    "version" in raw &&
    raw.version === 4
  ) {
    const legacy = backupSchema
      .omit({ pantones: true })
      .extend({ version: z.literal(4) })
      .parse(raw);
    input = {
      ...legacy,
      version: 5,
      pantones: collectPantones(legacy.orders, legacy.recipes),
    };
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
    b.pantones,
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
    unique(o.events || []);
    if (
      o.events?.some(
        (event) =>
          event.colorId && !o.colors.some((c) => c.id === event.colorId),
      )
    )
      throw Error("Не найден цвет примечания заказа");
    unique(o.colors);
    o.colors.forEach((c) => {
      unique(c.references);
      if (c.startingComponents?.length) check(c.startingComponents);
      if (
        c.acceptedSampleId &&
        !b.batches.some(
          (batch) =>
            batch.orderId === o.id &&
            batch.colorId === c.id &&
            batch.samples.some((sample) => sample.id === c.acceptedSampleId),
        )
      )
        throw Error("Не найдена подтверждённая выкатка цвета");
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
  b.pantones.forEach((p) => {
    if (p.startingComponents?.length) check(p.startingComponents);
    if (p.id !== pantoneKey(p.pantone))
      throw Error("Некорректный ключ Pantone");
    unique(p.references);
    if (
      p.currentReferenceId &&
      !p.references.some((r) => r.id === p.currentReferenceId)
    )
      throw Error("Не найден эталон в базе Pantone");
    p.references.forEach((r) => {
      checkMeasurement(r.measurement);
      if (r.photoIds.some((id) => !photos.has(id)))
        throw Error("Отсутствует фото базы Pantone");
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
    await database.pantones.bulkPut(b.pantones);
  });
}
export function quality(before: Sample["current"], after: Sample["current"]) {
  const warnings: string[] = [];
  if (!before.conditions.setup.trim() || !after.conditions.setup.trim())
    warnings.push("Не указан идентификатор измерительной установки");
  if (
    !sameConditions(before.conditions, after.conditions) ||
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
    database.orders,
    async () => {
      const b = await database.batches.get(batchId);
      if (!b) throw Error("Партия не найдена");
      if (b.status !== "ACTIVE") throw Error("Партия завершена");
      await requireOpenOrder(b.orderId, database);
      if (b.samples.some((s) => s.id === sample.id))
        throw Error("Проба уже сохранена");
      if (!comparable(sample.target, sample.current))
        throw Error("Условия эталона и пробы отличаются");
      if (b.orderId && sample.referenceId !== b.referenceId)
        throw Error("Эталон пробы не соответствует запуску заказа");
      if (b.orderId && b.colorId) {
        const order = (await database.orders.get(b.orderId))!;
        const color = order.colors.find((c) => c.id === b.colorId);
        const reference = color?.references.find(
          (r) => r.id === color.currentReferenceId,
        );
        if (
          !reference ||
          reference.id !== sample.referenceId ||
          reference.measurement.id !== sample.target.id
        )
          throw Error("Эталон изменился. Повторите сравнение.");
      }
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
      if ((await database.photos.bulkGet(sample.photoIds)).some((p) => !p))
        throw Error("Фото пробы не найдено");
      sample.additionIds = b.additions.map((a) => a.id);
      b.samples.push(sample);
      await database.batches.put(b);
      if (b.orderId && b.colorId) {
        const order = (await database.orders.get(b.orderId))!;
        const color = order.colors.find((c) => c.id === b.colorId)!;
        color.acceptedSampleId = undefined;
        await database.orders.put(order);
      }
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
  await database.transaction(
    "rw",
    database.batches,
    database.orders,
    database.inks,
    async () => {
      const b = await database.batches.get(batchId);
      if (!b) throw Error("Партия не найдена");
      if (b.status === "DONE") throw Error("Партия завершена");
      await requireOpenOrder(b.orderId, database);
      if (!(await database.inks.get(inkId)))
        throw Error("Краска не найдена в справочнике");
      const component = normalize([{ inkId, grams }])[0];
      if (!component) throw Error("Добавка должна быть больше нуля");
      b.additions.push({ id: id(), createdAt: now(), component, comment });
      composition(b);
      await database.batches.put(b);
    },
  );
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
      if (order.status === "DONE") throw Error("Заказ закрыт");
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
      if (order.status === "DONE") throw Error("Заказ закрыт");
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
    database.pantones,
    database.batches,
    async () => {
      const order = await database.orders.get(orderId),
        color = order?.colors.find((c) => c.id === colorId);
      if (!order || !color) throw Error("Pantone заказа не найден");
      if (order.status === "DONE") throw Error("Заказ закрыт");
      if (color.references.some((old) => old.id === r.id))
        throw Error("Эталон уже сохранён");
      await database.photos.bulkPut(photos);
      if ((await database.photos.bulkGet(r.photoIds)).some((p) => !p))
        throw Error("Фото эталона не найдено");
      color.references.push({ ...r, pantone: color.pantone });
      color.currentReferenceId = r.id;
      color.acceptedSampleId = undefined;
      // Retain the old single-colour fields for compatibility with previous backups.
      if (order.colors[0].id === colorId) {
        order.references = color.references;
        order.currentReferenceId = r.id;
      }
      await database.orders.put(order);
      await mergePantone(color, database);
      await ensureWorkingBatch(orderId, colorId, database);
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
      if (order.status === "DONE") throw Error("Заказ закрыт");
      const batches = (
        await database.batches.where("colorId").equals(colorId).toArray()
      )
        .filter((b) => b.orderId === orderId && b.status === "ACTIVE")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const existing = batches.find(
        (b) =>
          b.referenceId === (color.currentReferenceId || undefined) &&
          pantoneKey(b.pantone) === pantoneKey(color.pantone),
      );
      if (existing) return existing;
      const unreferenced = batches.find(
        (b) =>
          !b.referenceId &&
          !b.samples.length &&
          pantoneKey(b.pantone) === pantoneKey(color.pantone),
      );
      if (unreferenced) {
        unreferenced.referenceId = color.currentReferenceId || undefined;
        await database.batches.put(unreferenced);
        return unreferenced;
      }
      const batch = makeWorkingBatch(
        order,
        color,
        color.startingComponents || [],
      );
      // A new target must not silently discard the ink already in the container.
      const prior = batches.find(
        (b) => pantoneKey(b.pantone) === pantoneKey(color.pantone),
      );
      if (prior) {
        batch.initial = composition(prior);
        batch.compositionKnown = prior.compositionKnown;
      }
      for (const previous of batches)
        await database.batches.update(previous.id, { status: "DONE" });
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
    database.inks,
    async () => {
      const current = await ensureWorkingBatch(orderId, colorId, database);
      if (
        (await database.inks.bulkGet(initial.map((c) => c.inkId))).some(
          (i) => !i,
        )
      )
        throw Error("Краска не найдена в справочнике");
      const currentOrder = (await database.orders.get(orderId))!;
      currentOrder.colors.find((c) => c.id === colorId)!.acceptedSampleId =
        undefined;
      await database.orders.put(currentOrder);
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
    database.orders,
    async () => {
      const batch = await database.batches.get(batchId);
      if (!batch || batch.status !== "ACTIVE")
        throw Error("Текущая краска недоступна");
      await requireOpenOrder(batch.orderId, database);
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
      if (batch.orderId && batch.colorId) {
        const order = (await database.orders.get(batch.orderId))!;
        order.colors.find((c) => c.id === batch.colorId)!.acceptedSampleId =
          undefined;
        await database.orders.put(order);
      }
    },
  );
}

async function requireOpenOrder(orderId: string | undefined, database: LabDB) {
  if (!orderId) return;
  const order = await database.orders.get(orderId);
  if (!order) throw Error("Заказ не найден");
  if (order.status === "DONE") throw Error("Заказ закрыт");
}

async function mergePantone(color: Order["colors"][number], database: LabDB) {
  const key = pantoneKey(color.pantone);
  if (!key) throw Error("Укажите Pantone");
  const existing = await database.pantones.get(key);
  const entry: Pantone = existing || {
    ...structuredClone(color),
    references: [],
    id: key,
    createdAt: now(),
    notes: "",
  };
  if (color.startingComponents?.length)
    entry.startingComponents = normalize(color.startingComponents);
  const added = new Set<string>();
  for (const r of color.references)
    if (
      (!r.pantone || pantoneKey(r.pantone) === key) &&
      !entry.references.some((old) => old.id === r.id)
    ) {
      entry.references.push(structuredClone(r));
      added.add(r.id);
    }
  if (
    color.currentReferenceId &&
    (!entry.currentReferenceId || added.has(color.currentReferenceId))
  )
    entry.currentReferenceId = color.currentReferenceId;
  await database.pantones.put(pantoneSchema.parse(entry));
}

export async function saveOrder(input: Order, database = db) {
  const order = orderSchema.parse(input);
  const keys = order.colors.map((c) => pantoneKey(c.pantone));
  if (!keys.length || keys.some((key) => !key))
    throw Error("Укажите Pantone заказа");
  if (new Set(keys).size !== keys.length)
    throw Error("Этот Pantone уже есть в заказе");
  for (const color of order.colors) {
    if (!color.currentReferenceId) continue;
    const reference = color.references.find(
      (r) => r.id === color.currentReferenceId,
    );
    if (
      !reference ||
      (reference.pantone &&
        pantoneKey(reference.pantone) !== pantoneKey(color.pantone))
    )
      throw Error(
        "Эталон относится к другому Pantone. Выберите эталон этого цвета.",
      );
  }
  await database.transaction(
    "rw",
    database.orders,
    database.pantones,
    database.batches,
    database.inks,
    database.recipes,
    async () => {
      const previous = await database.orders.get(order.id);
      await requireOpenOrder(previous?.id, database);
      await database.orders.put(order);
      for (const color of order.colors) await mergePantone(color, database);
      for (const color of order.colors) {
        const old = previous?.colors.find((c) => c.id === color.id);
        if (color.startingComponents?.length) {
          const components = normalize(color.startingComponents);
          if (!components.length)
            throw Error("Укажите положительную массу исходной краски");
          if (
            (await database.inks.bulkGet(components.map((c) => c.inkId))).some(
              (i) => !i,
            )
          )
            throw Error("Краска исходного состава не найдена");
          const recipeId = `order-start-${color.id}`;
          await database.recipes.put({
            id: recipeId,
            familyId: recipeId,
            version: 1,
            name: `${color.pantone} · исходная краска № ${order.code}`,
            pantone: color.pantone,
            source: "OWN",
            sourceNote: `Исходная краска заказа № ${order.code}; состав до последующих добавок`,
            components,
            createdAt: now(),
          });
          const componentKey = (cs: Component[]) =>
            JSON.stringify(
              normalize(cs).sort((a, b) => a.inkId.localeCompare(b.inkId)),
            );
          if (
            !old ||
            componentKey(old.startingComponents || []) !==
              componentKey(components)
          )
            await setColorComposition(order.id, color.id, components, database);
        }
        if (
          old &&
          color.currentReferenceId &&
          old.currentReferenceId !== color.currentReferenceId
        )
          await ensureWorkingBatch(order.id, color.id, database);
      }
    },
  );
}

export async function repeatOrder(orderId: string, database = db) {
  return database.transaction(
    "rw",
    database.orders,
    database.batches,
    database.pantones,
    database.inks,
    database.recipes,
    async () => {
      const source = await database.orders.get(orderId);
      if (!source) throw Error("Заказ не найден");
      const colors = source.colors.map((color) => ({
        ...structuredClone(color),
        id: id(),
        acceptedSampleId: undefined,
      }));
      const order: Order = {
        ...source,
        id: id(),
        name: `${source.name} · повтор`,
        code: source.code,
        createdAt: now(),
        status: "ACTIVE",
        closedAt: undefined,
        repeatOf: source.id,
        colors,
        events: [
          {
            id: id(),
            createdAt: now(),
            kind: "STATUS",
            text: `Повтор заказа «${source.name}». Эталоны сохранены; выкатки начинаются заново.`,
          },
        ],
      };
      await saveOrder(order, database);
      const oldBatches = await database.batches
        .where("orderId")
        .equals(source.id)
        .toArray();
      for (let index = 0; index < colors.length; index++) {
        const originalColor = source.colors[index];
        const original = oldBatches
          .filter((b) => b.colorId === originalColor.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        const initial = originalColor.startingComponents?.length
          ? originalColor.startingComponents
          : original?.initial || [];
        colors[index].startingComponents = structuredClone(initial);
        const batch = makeWorkingBatch(order, colors[index], initial);
        batch.compositionKnown = originalColor.startingComponents?.length
          ? true
          : (original?.compositionKnown ?? initial.length > 0);
        const created = await database.batches
          .where("colorId")
          .equals(colors[index].id)
          .first();
        if (created) await database.batches.put({ ...batch, id: created.id });
        else await database.batches.add(batch);
      }
      order.colors = colors;
      await database.orders.put(order);
      return order;
    },
  );
}

export async function addOrderComponents(
  orderId: string,
  rows: { colorId: string; components: Component[]; comment: string }[],
  database = db,
) {
  if (!rows.length) throw Error("Укажите добавки");
  await database.transaction(
    "rw",
    database.orders,
    database.batches,
    database.inks,
    async () => {
      await requireOpenOrder(orderId, database);
      for (const row of rows) {
        const batch = await ensureWorkingBatch(orderId, row.colorId, database);
        if (!batch.samples.length)
          throw Error(
            "Сначала сохраните исходную выкатку каждого выбранного Pantone",
          );
        await addComponents(batch.id, row.components, row.comment, database);
      }
    },
  );
}

export async function acceptOrderColor(
  orderId: string,
  colorId: string,
  sampleId: string,
  database = db,
) {
  await database.transaction(
    "rw",
    database.orders,
    database.batches,
    async () => {
      await requireOpenOrder(orderId, database);
      const order = (await database.orders.get(orderId))!,
        color = order.colors.find((c) => c.id === colorId);
      if (!color) throw Error("Цвет не найден");
      const batches = await database.batches
        .where("colorId")
        .equals(colorId)
        .toArray();
      const batch = batches.find(
        (b) =>
          b.orderId === orderId &&
          b.status === "ACTIVE" &&
          b.referenceId === color.currentReferenceId,
      );
      const sample = batch?.samples.at(-1);
      if (
        !sample ||
        sample.id !== sampleId ||
        batch!.additions.some((a) => !sample.additionIds?.includes(a.id))
      )
        throw Error("После последних добавок требуется новая выкатка");
      if (!comparable(sample.target, sample.current))
        throw Error("Условия сравнения различаются");
      if (color.acceptedSampleId === sample.id) return;
      color.acceptedSampleId = sample.id;
      order.events = [
        ...(order.events || []),
        {
          id: id(),
          createdAt: now(),
          kind: "STATUS",
          text: `Цвет ${color.pantone} подтверждён оператором`,
          colorId,
        },
      ];
      await database.orders.put(order);
    },
  );
}

export async function finishOrder(orderId: string, database = db) {
  await database.transaction(
    "rw",
    database.orders,
    database.batches,
    database.recipes,
    async () => {
      const order = await database.orders.get(orderId);
      if (
        !order ||
        !order.colors.length ||
        order.colors.some((c) => !c.acceptedSampleId)
      )
        throw Error("Подтвердите результат каждого Pantone");
      for (const color of order.colors) {
        await acceptOrderColor(
          order.id,
          color.id,
          color.acceptedSampleId!,
          database,
        );
        const batch = (
          await database.batches.where("colorId").equals(color.id).toArray()
        ).find(
          (b) =>
            b.orderId === order.id &&
            b.samples.some((s) => s.id === color.acceptedSampleId),
        );
        const sample = batch?.samples.find(
          (s) => s.id === color.acceptedSampleId,
        );
        if (
          batch &&
          batch.compositionKnown !== false &&
          sample?.components.length &&
          !(await database.recipes.get(`sample-recipe-${sample.id}`))
        )
          await saveSampleRecipe(batch.id, sample.id, database);
      }
      await setOrderStatus(orderId, "DONE", database);
    },
  );
}

export async function setOrderStatus(
  orderId: string,
  status: "ACTIVE" | "DONE",
  database = db,
) {
  await database.transaction("rw", database.orders, async () => {
    const order = await database.orders.get(orderId);
    if (!order) throw Error("Заказ не найден");
    if ((order.status || "ACTIVE") === status) return;
    order.status = status;
    order.closedAt = status === "DONE" ? now() : undefined;
    order.events = [
      ...(order.events || []),
      {
        id: id(),
        createdAt: now(),
        kind: "STATUS",
        text: status === "DONE" ? "Заказ закрыт" : "Заказ возобновлён",
      },
    ];
    await database.orders.put(order);
  });
}

export async function addOrderNote(
  orderId: string,
  text: string,
  colorId?: string,
  database = db,
) {
  if (!text.trim()) throw Error("Введите примечание");
  await database.transaction("rw", database.orders, async () => {
    const order = await database.orders.get(orderId);
    if (!order) throw Error("Заказ не найден");
    if (colorId && !order.colors.some((c) => c.id === colorId))
      throw Error("Цвет заказа не найден");
    order.events = [
      ...(order.events || []),
      { id: id(), createdAt: now(), kind: "NOTE", text: text.trim(), colorId },
    ];
    await database.orders.put(order);
  });
}

export async function savePantone(
  input: Pantone,
  photos: Photo[] = [],
  database = db,
) {
  const entry = pantoneSchema.parse({
    ...input,
    id: pantoneKey(input.pantone),
    pantone: input.pantone.trim(),
  });
  if (!entry.id) throw Error("Укажите Pantone");
  await database.transaction(
    "rw",
    database.pantones,
    database.photos,
    async () => {
      const existing = await database.pantones.get(entry.id);
      if (existing) {
        for (const r of existing.references)
          if (!entry.references.some((v) => v.id === r.id))
            entry.references.push(r);
      }
      await database.photos.bulkPut(photos);
      for (const r of entry.references)
        if ((await database.photos.bulkGet(r.photoIds)).some((p) => !p))
          throw Error("Фото эталона не найдено");
      if (
        entry.currentReferenceId &&
        !entry.references.some((r) => r.id === entry.currentReferenceId)
      )
        throw Error("Эталон не найден");
      await database.pantones.put(entry);
    },
  );
}

export async function useColorReference(
  orderId: string,
  colorId: string,
  referenceId: string,
  database = db,
) {
  await database.transaction(
    "rw",
    database.orders,
    database.pantones,
    database.batches,
    async () => {
      const order = await database.orders.get(orderId),
        color = order?.colors.find((c) => c.id === colorId);
      if (!order || !color) throw Error("Цвет заказа не найден");
      if (order.status === "DONE") throw Error("Заказ закрыт");
      const entry = await database.pantones.get(pantoneKey(color.pantone));
      const reference = [
        ...(entry?.references || []),
        ...color.references,
      ].find(
        (r) =>
          r.id === referenceId &&
          (!r.pantone || pantoneKey(r.pantone) === pantoneKey(color.pantone)),
      );
      if (!reference) throw Error("Эталон Pantone не найден");
      if (!color.references.some((r) => r.id === reference.id))
        color.references.push(structuredClone(reference));
      color.currentReferenceId = reference.id;
      color.acceptedSampleId = undefined;
      order.references = order.colors[0].references;
      order.currentReferenceId = order.colors[0].currentReferenceId;
      await database.orders.put(order);
      await ensureWorkingBatch(orderId, colorId, database);
    },
  );
}

export async function saveSampleRecipe(
  batchId: string,
  sampleId: string,
  database = db,
) {
  return database.transaction(
    "rw",
    database.batches,
    database.recipes,
    async () => {
      const batch = await database.batches.get(batchId),
        sample = batch?.samples.find((s) => s.id === sampleId);
      if (!batch || !sample) throw Error("Выкатка не найдена");
      if (batch.compositionKnown === false || !sample.components.length)
        throw Error("Полный состав выкатки неизвестен");
      const recipeId = `sample-recipe-${sample.id}`;
      if (await database.recipes.get(recipeId))
        throw Error("Состав этой выкатки уже сохранён в рецептурах");
      const recipe: Recipe = {
        id: recipeId,
        familyId: recipeId,
        version: 1,
        name: `${batch.pantone} · выкатка ${new Date(sample.createdAt).toLocaleDateString("ru")}`,
        pantone: batch.pantone,
        source: "OWN",
        sourceNote:
          `${batch.name}. Выкатка от ${new Date(sample.createdAt).toLocaleString("ru")}. ${sample.comment}`.trim(),
        components: structuredClone(sample.components),
        createdAt: now(),
      };
      await database.recipes.add(recipe);
      return recipe;
    },
  );
}
