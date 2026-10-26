import "fake-indexeddb/auto";
import Dexie from "dexie";
import { it, expect } from "vitest";
import {
  LabDB,
  seed,
  saveOrder,
  saveColorReference,
  useColorReference,
  ensureWorkingBatch,
  setColorComposition,
  addComponents,
  saveSample,
  repeatOrder,
  setOrderStatus,
  addOrderNote,
  exportData,
  importData,
  validateBackup,
  saveSampleRecipe,
  addOrderComponents,
  acceptOrderColor,
  finishOrder,
} from "./db";
import {
  id,
  now,
  defaultConditions,
  type Order,
  type Measurement,
  type OrderReference,
} from "../domain/types";
import { composition, total } from "../domain/mixture";
const m = (l: number): Measurement => ({
  id: id(),
  createdAt: now(),
  source: "SPECTRO_LAB",
  conditions: defaultConditions,
  lab: { l, a: 10, b: 5 },
});
const ref = (): OrderReference => ({
  id: id(),
  createdAt: now(),
  name: "Производственный эталон",
  photoIds: [],
  measurement: m(50),
});
async function setup() {
  const d = new LabDB(id());
  await seed(d);
  const order: Order = {
    id: id(),
    name: "Этикетка",
    code: "100",
    customer: "Клиент",
    pantone: "185 C",
    createdAt: now(),
    notes: "",
    references: [],
    currentReferenceId: "",
    colors: [
      {
        id: id(),
        pantone: "185 C",
        name: "Логотип",
        references: [],
        currentReferenceId: "",
      },
    ],
  };
  await saveOrder(order, d);
  return { d, order, color: order.colors[0] };
}
it("новый Pantone из заказа сохраняется в базе; повтор использует эталон без чужих выкаток", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  expect((await d.pantones.get("185 C"))!.references).toHaveLength(0);
  await saveColorReference(order.id, color.id, r, [], d);
  expect((await d.pantones.get("185 C"))!.currentReferenceId).toBe(r.id);
  const batch = await ensureWorkingBatch(order.id, color.id, d);
  await saveSample(
    batch.id,
    {
      id: id(),
      createdAt: now(),
      target: r.measurement,
      current: m(40),
      referenceId: r.id,
      components: [],
      photoIds: [],
      comment: "первый результат",
    },
    [],
    d,
  );
  const copy = await repeatOrder(order.id, d);
  expect(copy.repeatOf).toBe(order.id);
  expect(copy.colors[0].id).not.toBe(color.id);
  expect(copy.colors[0].currentReferenceId).toBe(r.id);
  expect(await d.batches.where("orderId").equals(copy.id).count()).toBe(1);
  const next = await ensureWorkingBatch(copy.id, copy.colors[0].id, d);
  expect(next.samples).toHaveLength(0);
  expect(next.initial).toEqual([]);
  await d.delete();
});
it("выбор из базы копирует эталон и не меняет другие заказы", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const copy = await repeatOrder(order.id, d);
  const newer = ref();
  await saveColorReference(order.id, color.id, newer, [], d);
  expect((await d.orders.get(copy.id))!.colors[0].currentReferenceId).toBe(
    r.id,
  );
  await useColorReference(copy.id, copy.colors[0].id, newer.id, d);
  expect((await d.orders.get(copy.id))!.colors[0].currentReferenceId).toBe(
    newer.id,
  );
  expect((await d.orders.get(order.id))!.colors[0].references).toHaveLength(2);
  await d.delete();
});
it("закрытый заказ блокирует выкатки, добавки, эталоны и состав; после возобновления цикл продолжается", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await ensureWorkingBatch(order.id, color.id, d);
  await setOrderStatus(order.id, "DONE", d);
  await expect(
    addComponents(batch.id, [{ inkId: "double-v-0", grams: "5" }], "", d),
  ).rejects.toThrow("закрыт");
  await expect(ensureWorkingBatch(order.id, color.id, d)).rejects.toThrow(
    "закрыт",
  );
  await expect(
    saveColorReference(order.id, color.id, ref(), [], d),
  ).rejects.toThrow("закрыт");
  await expect(
    setColorComposition(
      order.id,
      color.id,
      [{ inkId: "double-v-0", grams: "100" }],
      d,
    ),
  ).rejects.toThrow("закрыт");
  await expect(
    saveSample(
      batch.id,
      {
        id: id(),
        createdAt: now(),
        target: r.measurement,
        current: m(40),
        referenceId: r.id,
        components: [],
        photoIds: [],
        comment: "",
      },
      [],
      d,
    ),
  ).rejects.toThrow("закрыт");
  await addOrderNote(order.id, "Согласован тираж", undefined, d);
  await setOrderStatus(order.id, "ACTIVE", d);
  await addComponents(batch.id, [{ inkId: "double-v-0", grams: "5" }], "", d);
  expect((await d.batches.get(batch.id))!.additions).toHaveLength(1);
  expect((await d.orders.get(order.id))!.events).toHaveLength(3);
  await d.delete();
});
it("при смене эталона состав и добавки не теряются, прошлое сравнение сохраняется", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await setColorComposition(
    order.id,
    color.id,
    [{ inkId: "double-v-0", grams: "100" }],
    d,
  );
  await addComponents(batch.id, [{ inkId: "double-v-1", grams: "5" }], "", d);
  const before = (await d.batches.get(batch.id))!;
  await saveSample(
    batch.id,
    {
      id: id(),
      createdAt: now(),
      target: r.measurement,
      current: m(40),
      referenceId: r.id,
      components: composition(before),
      photoIds: [],
      comment: "",
    },
    [],
    d,
  );
  const newer = ref();
  await saveColorReference(order.id, color.id, newer, [], d);
  const next = await ensureWorkingBatch(order.id, color.id, d);
  expect(next.id).not.toBe(batch.id);
  expect(total(composition(next))).toBe("105");
  expect(next.referenceId).toBe(newer.id);
  expect((await d.batches.get(batch.id))!.samples[0].target.id).toBe(
    r.measurement.id,
  );
  expect((await d.batches.get(batch.id))!.status).toBe("DONE");
  validateBackup(await exportData(d));
  await d.delete();
});
it("заметки, закрытие, база и эталоны восстанавливаются из JSON v5; v4 получает справочник", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  await addOrderNote(
    order.id,
    "  Добавили 5 г\nВыкатка светлее  ",
    color.id,
    d,
  );
  await setOrderStatus(order.id, "DONE", d);
  const copy = await exportData(d);
  await importData(copy, d);
  expect((await d.orders.get(order.id))!.events![0].text).toBe(
    "Добавили 5 г\nВыкатка светлее",
  );
  expect((await d.orders.get(order.id))!.status).toBe("DONE");
  expect((await d.pantones.get("185 C"))!.references[0].id).toBe(r.id);
  const { pantones, ...legacy } = copy;
  await importData({ ...legacy, version: 4 }, d);
  expect((await d.pantones.get("185 C"))!.currentReferenceId).toBe(r.id);
  await d.delete();
});
it("одинаковые Pantone с разным регистром не создают дубликаты в заказе", async () => {
  const { d, order, color } = await setup();
  await expect(
    saveOrder(
      {
        ...order,
        colors: [color, { ...color, id: id(), pantone: " PANTONE 185   c " }],
      },
      d,
    ),
  ).rejects.toThrow("уже есть");
  expect(await d.pantones.count()).toBe(1);
  await d.delete();
});
it("переименование Pantone не переносит старый эталон на новый цвет справочника", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const latest = (await d.orders.get(order.id))!;
  latest.colors[0].pantone = "186 C";
  latest.colors[0].currentReferenceId = "";
  latest.pantone = "186 C";
  latest.currentReferenceId = "";
  await saveOrder(latest, d);
  expect((await d.pantones.get("186 C"))!.references).toHaveLength(0);
  expect((await d.pantones.get("185 C"))!.references).toHaveLength(1);
  latest.colors[0].currentReferenceId = r.id;
  await expect(saveOrder(latest, d)).rejects.toThrow("другому Pantone");
  await d.delete();
});
it("повторный ID пробы отклоняется и не создаёт вторую запись", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await ensureWorkingBatch(order.id, color.id, d);
  const sample = {
    id: id(),
    createdAt: now(),
    target: r.measurement,
    current: m(40),
    referenceId: r.id,
    components: [],
    photoIds: [],
    comment: "",
  };
  await saveSample(batch.id, sample, [], d);
  await expect(saveSample(batch.id, sample, [], d)).rejects.toThrow(
    "уже сохранена",
  );
  expect((await d.batches.get(batch.id))!.samples).toHaveLength(1);
  await d.delete();
});
it("миграция IndexedDB v4 собирает Pantone и версии эталона", async () => {
  const { d, order, color } = await setup();
  const r = ref();
  await d.delete();
  const databaseName = id(),
    old = new Dexie(databaseName);
  old.version(4).stores({
    inks: "id,name",
    recipes: "id,familyId,version",
    batches: "id,createdAt,status,orderId,colorId",
    orders: "id,name,code",
    profiles: "id",
    experiments: "id,batchId",
    photos: "id",
    settings: "id",
  });
  color.references = [r];
  color.currentReferenceId = r.id;
  await old.table("orders").put(order);
  old.close();
  const next = new LabDB(databaseName);
  expect((await next.pantones.get("185 C"))!.references[0].id).toBe(r.id);
  expect((await next.orders.get(order.id))!.colors[0].id).toBe(color.id);
  await next.delete();
});

it("повтор старого заказа не заменяет текущую версию в общем справочнике", async () => {
  const { d, order, color } = await setup(),
    old = ref(),
    newer = ref();
  await saveColorReference(order.id, color.id, old, [], d);
  const other = await repeatOrder(order.id, d);
  await saveColorReference(other.id, other.colors[0].id, newer, [], d);
  const repeat = await repeatOrder(order.id, d);
  expect(repeat.colors[0].currentReferenceId).toBe(old.id);
  expect((await d.pantones.get("185 C"))!.currentReferenceId).toBe(newer.id);
  await d.delete();
});

it("состав выкатки попадает в собственные рецептуры один раз, неизвестный состав не становится рецептом", async () => {
  const { d, order, color } = await setup(),
    r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const unknown = await ensureWorkingBatch(order.id, color.id, d),
    firstId = id();
  await saveSample(
    unknown.id,
    {
      id: firstId,
      createdAt: now(),
      target: r.measurement,
      current: m(40),
      referenceId: r.id,
      components: [],
      photoIds: [],
      comment: "Неизвестная смесь",
    },
    [],
    d,
  );
  await expect(saveSampleRecipe(unknown.id, firstId, d)).rejects.toThrow(
    "неизвестен",
  );
  const known = await setColorComposition(
    order.id,
    color.id,
    [{ inkId: "double-v-0", grams: "100" }],
    d,
  );
  await addComponents(known.id, [{ inkId: "double-v-1", grams: "5" }], "", d);
  const batch = (await d.batches.get(known.id))!,
    sampleId = id();
  await saveSample(
    batch.id,
    {
      id: sampleId,
      createdAt: now(),
      target: r.measurement,
      current: m(48),
      referenceId: r.id,
      components: composition(batch),
      photoIds: [],
      comment: "Результат согласован",
    },
    [],
    d,
  );
  const recipe = await saveSampleRecipe(batch.id, sampleId, d);
  expect(total(recipe.components)).toBe("105");
  expect(recipe.source).toBe("OWN");
  expect(recipe.sourceNote).toContain("Результат согласован");
  await expect(saveSampleRecipe(batch.id, sampleId, d)).rejects.toThrow(
    "уже сохранён",
  );
  expect(await d.recipes.count()).toBe(1);
  validateBackup(await exportData(d));
  await d.delete();
});

it("сбой фото откатывает пробу, фотографию и эксперимент целиком", async () => {
  const { d, order, color } = await setup(),
    r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await ensureWorkingBatch(order.id, color.id, d);
  await saveSample(
    batch.id,
    {
      id: id(),
      createdAt: now(),
      target: r.measurement,
      current: m(40),
      referenceId: r.id,
      components: [],
      photoIds: [],
      comment: "",
    },
    [],
    d,
  );
  await addComponents(batch.id, [{ inkId: "double-v-0", grams: "5" }], "", d);
  const next = (await d.batches.get(batch.id))!;
  await expect(
    saveSample(
      batch.id,
      {
        id: id(),
        createdAt: now(),
        target: r.measurement,
        current: m(48),
        referenceId: r.id,
        components: composition(next),
        photoIds: ["missing"],
        comment: "",
      },
      [],
      d,
    ),
  ).rejects.toThrow("Фото");
  expect((await d.batches.get(batch.id))!.samples).toHaveLength(1);
  expect(await d.experiments.count()).toBe(0);
  await d.delete();
});

it("повтор переносит исходную чистую краску, номер и эталон; без добавок, проб и подтверждения", async () => {
  const { d, order, color } = await setup(),
    r = ref();
  order.colors[0].startingComponents = [{ inkId: "double-v-0", grams: "1000" }];
  order.production = {
    material: "BOPP",
    anilox: "160",
    uv: "LED",
    speed: "80",
  };
  await saveOrder(order, d);
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await ensureWorkingBatch(order.id, color.id, d);
  await addComponents(batch.id, [{ inkId: "double-v-1", grams: "12" }], "", d);
  const repeat = await repeatOrder(order.id, d);
  const batches = await d.batches.where("orderId").equals(repeat.id).toArray();
  expect(batches).toHaveLength(1);
  expect(batches[0].initial).toEqual([{ inkId: "double-v-0", grams: "1000" }]);
  expect(batches[0].additions).toEqual([]);
  expect(batches[0].samples).toEqual([]);
  expect(repeat.code).toBe(order.code);
  expect(repeat.production).toEqual(order.production);
  expect(repeat.colors[0].currentReferenceId).toBe(r.id);
  expect(repeat.colors[0].acceptedSampleId).toBeUndefined();
  await d.delete();
});

it("несколько цветов доводятся атомарно; ошибка второго не записывает добавку первого", async () => {
  const { d, order, color } = await setup(),
    other = { ...color, id: id(), pantone: "300 C" };
  order.colors.push(other);
  await saveOrder(order, d);
  for (const c of order.colors) {
    const r = ref();
    await saveColorReference(order.id, c.id, r, [], d);
    const batch = await ensureWorkingBatch(order.id, c.id, d);
    await saveSample(
      batch.id,
      {
        id: id(),
        createdAt: now(),
        target: r.measurement,
        current: m(40),
        referenceId: r.id,
        photoIds: [],
        components: [],
        comment: "",
      },
      [],
      d,
    );
  }
  await expect(
    addOrderComponents(
      order.id,
      [
        {
          colorId: color.id,
          components: [{ inkId: "double-v-0", grams: "5" }],
          comment: "",
        },
        {
          colorId: other.id,
          components: [{ inkId: "missing", grams: "2" }],
          comment: "",
        },
      ],
      d,
    ),
  ).rejects.toThrow();
  expect(
    (await d.batches.toArray()).every((b) => b.additions.length === 0),
  ).toBe(true);
  await addOrderComponents(
    order.id,
    [
      {
        colorId: color.id,
        components: [{ inkId: "double-v-0", grams: "5" }],
        comment: "",
      },
      {
        colorId: other.id,
        components: [{ inkId: "double-v-1", grams: "2" }],
        comment: "",
      },
    ],
    d,
  );
  expect(
    (await d.batches.toArray()).every((b) => b.additions.length === 1),
  ).toBe(true);
  await d.delete();
});

it("заказ завершается только после подтверждённых актуальных выкаток; добавка сбрасывает подтверждение", async () => {
  const { d, order, color } = await setup(),
    r = ref();
  await saveColorReference(order.id, color.id, r, [], d);
  const batch = await ensureWorkingBatch(order.id, color.id, d),
    first = id();
  await saveSample(
    batch.id,
    {
      id: first,
      createdAt: now(),
      target: r.measurement,
      current: m(48),
      referenceId: r.id,
      photoIds: [],
      components: [],
      comment: "",
    },
    [],
    d,
  );
  await expect(finishOrder(order.id, d)).rejects.toThrow("Подтвердите");
  await acceptOrderColor(order.id, color.id, first, d);
  await addOrderComponents(
    order.id,
    [
      {
        colorId: color.id,
        components: [{ inkId: "double-v-0", grams: "1" }],
        comment: "",
      },
    ],
    d,
  );
  expect(
    (await d.orders.get(order.id))!.colors[0].acceptedSampleId,
  ).toBeUndefined();
  await expect(acceptOrderColor(order.id, color.id, first, d)).rejects.toThrow(
    "новая выкатка",
  );
  const updated = (await d.batches.get(batch.id))!,
    second = id();
  await saveSample(
    batch.id,
    {
      id: second,
      createdAt: now(),
      target: r.measurement,
      current: m(49),
      referenceId: r.id,
      photoIds: [],
      components: composition(updated),
      comment: "",
    },
    [],
    d,
  );
  await acceptOrderColor(order.id, color.id, second, d);
  await finishOrder(order.id, d);
  expect((await d.orders.get(order.id))!.status).toBe("DONE");
  validateBackup(await exportData(d));
  await d.delete();
});

it("при завершении сохраняет подтверждённый полный состав, а в повторе остаётся чистый исходный", async () => {
  const { d, order, color } = await setup(),
    r = ref();
  try {
    order.colors[0].startingComponents = [
      { inkId: "double-v-0", grams: "100" },
    ];
    await saveOrder(order, d);
    await saveColorReference(order.id, color.id, r, [], d);
    const batch = await ensureWorkingBatch(order.id, color.id, d);
    const putSample = async (sampleId: string) => {
      const latest = (await d.batches.get(batch.id))!;
      await saveSample(
        batch.id,
        {
          id: sampleId,
          createdAt: now(),
          target: r.measurement,
          current: m(49),
          referenceId: r.id,
          photoIds: [],
          components: composition(latest),
          comment: "Подтверждённый тестовый результат",
        },
        [],
        d,
      );
    };
    await putSample(id());
    await addComponents(
      batch.id,
      [{ inkId: "double-v-1", grams: "10" }],
      "",
      d,
    );
    const accepted = id();
    await putSample(accepted);
    await acceptOrderColor(order.id, color.id, accepted, d);
    await finishOrder(order.id, d);
    const recipe = (await d.recipes.get(`sample-recipe-${accepted}`))!;
    expect(total(recipe.components)).toBe("110");
    expect(recipe.sourceNote).toContain("Подтверждённый тестовый результат");
    const repeated = await repeatOrder(order.id, d);
    expect(total(repeated.colors[0].startingComponents!)).toBe("100");
    validateBackup(await exportData(d));
  } finally {
    await d.delete();
  }
});
