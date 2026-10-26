import "fake-indexeddb/auto";
import Dexie from "dexie";
import { it, expect } from "vitest";
import {
  LabDB,
  seed,
  ensureWorkingBatch,
  setColorComposition,
  addComponents,
  saveSample,
  saveColorReference,
  exportData,
  importData,
} from "./db";
import {
  id,
  now,
  defaultConditions,
  type Order,
  type OrderReference,
  type Measurement,
} from "../domain/types";
import { composition, total } from "../domain/mixture";
const m = (l: number): Measurement => ({
  id: id(),
  createdAt: now(),
  source: "SPECTRO_LAB",
  conditions: defaultConditions,
  lab: { l, a: 1, b: 2 },
});
const ref = (): OrderReference => ({
  id: id(),
  name: "Эталон",
  createdAt: now(),
  measurement: m(50),
  photoIds: [],
});
async function setup() {
  const d = new LabDB(id());
  await seed(d);
  const order: Order = {
    id: id(),
    name: "ТЕСТ",
    code: "",
    customer: "",
    pantone: "185 C",
    createdAt: now(),
    notes: "",
    references: [],
    currentReferenceId: "",
    colors: ["185 C", "300 C"].map((pantone) => ({
      id: id(),
      name: "",
      pantone,
      references: [],
      currentReferenceId: "",
    })),
  };
  await d.orders.add(order);
  return { d, order };
}
it("эталоны, составы и несколько добавок изолированы по Pantone", async () => {
  const { d, order } = await setup();
  const [a, b] = order.colors;
  await saveColorReference(order.id, a.id, ref(), [], d);
  await saveColorReference(order.id, b.id, ref(), [], d);
  const first = await setColorComposition(
    order.id,
    a.id,
    [{ inkId: "double-v-0", grams: "1000" }],
    d,
  );
  await addComponents(
    first.id,
    [
      { inkId: "double-v-1", grams: "10.1" },
      { inkId: "double-v-2", grams: "5.2" },
    ],
    "Внесены вместе",
    d,
  );
  const updated = (await d.batches.get(first.id))!;
  expect(total(composition(updated))).toBe("1015.3");
  expect(updated.additions).toHaveLength(2);
  expect(updated.additions[0].operationId).toBe(
    updated.additions[1].operationId,
  );
  const other = await ensureWorkingBatch(order.id, b.id, d);
  expect(other.additions).toEqual([]);
  expect(other.compositionKnown).toBe(false);
  expect(other.initial).toEqual([]);
  await d.delete();
});
it("неизвестный состав: две пробы и добавки сохраняются в копии без выдуманной массы", async () => {
  const { d, order } = await setup(),
    color = order.colors[0],
    reference = ref();
  await saveColorReference(order.id, color.id, reference, [], d);
  const first = await ensureWorkingBatch(order.id, color.id, d);
  await saveSample(
    first.id,
    {
      id: id(),
      createdAt: now(),
      referenceId: reference.id,
      target: reference.measurement,
      current: m(40),
      photoIds: [],
      components: [],
      comment: "",
    },
    [],
    d,
  );
  await addComponents(
    first.id,
    [
      { inkId: "double-v-0", grams: "10" },
      { inkId: "double-v-1", grams: "2" },
    ],
    "",
    d,
  );
  const next = (await d.batches.get(first.id))!;
  await saveSample(
    next.id,
    {
      id: id(),
      createdAt: now(),
      referenceId: reference.id,
      target: reference.measurement,
      current: m(48),
      photoIds: [],
      components: composition(next),
      comment: "",
    },
    [],
    d,
  );
  const copy = await exportData(d);
  await importData(copy, d);
  expect((await d.batches.get(first.id))!.compositionKnown).toBe(false);
  expect((await d.batches.get(first.id))!.samples).toHaveLength(2);
  expect((await d.experiments.toArray())[0].excluded).toBe(true);
  await d.delete();
});
it("не сохраняет половину операции при недопустимой добавке", async () => {
  const { d, order } = await setup();
  const batch = await ensureWorkingBatch(order.id, order.colors[0].id, d);
  await expect(
    addComponents(
      batch.id,
      [
        { inkId: "double-v-0", grams: "20" },
        { inkId: "missing", grams: "10" },
      ],
      "",
      d,
    ),
  ).rejects.toThrow();
  expect((await d.batches.get(batch.id))!.additions).toHaveLength(0);
  await d.delete();
});
it("новый фактический состав сохраняет прежние пробы и создаёт новую смесь", async () => {
  const { d, order } = await setup(),
    c = order.colors[0],
    r = ref();
  await saveColorReference(order.id, c.id, r, [], d);
  const old = await setColorComposition(
    order.id,
    c.id,
    [{ inkId: "double-v-0", grams: "100" }],
    d,
  );
  await saveSample(
    old.id,
    {
      id: id(),
      createdAt: now(),
      referenceId: r.id,
      target: r.measurement,
      current: m(40),
      photoIds: [],
      components: old.initial,
      comment: "",
    },
    [],
    d,
  );
  const next = await setColorComposition(
    order.id,
    c.id,
    [{ inkId: "double-v-1", grams: "300" }],
    d,
  );
  expect(next.id).not.toBe(old.id);
  expect((await d.batches.get(old.id))!.samples).toHaveLength(1);
  expect((await d.batches.get(old.id))!.status).toBe("DONE");
  await d.delete();
});
it("переносит базу и JSON v3 в Pantone заказа без потери эталона", async () => {
  const name = id(),
    legacy = new Dexie(name),
    r = ref();
  legacy.version(3).stores({
    inks: "id,name",
    recipes: "id,familyId,version",
    batches: "id,createdAt,status,orderId",
    orders: "id,name,code",
    profiles: "id",
    experiments: "id,batchId",
    photos: "id",
    settings: "id",
  });
  await legacy.table("orders").put({
    id: "order",
    name: "Старый заказ",
    code: "",
    customer: "",
    pantone: "185 C",
    createdAt: now(),
    notes: "",
    references: [r],
    currentReferenceId: r.id,
  });
  await legacy.table("batches").put({
    id: "batch",
    orderId: "order",
    referenceId: r.id,
    name: "Старая смесь",
    pantone: "185 C",
    createdAt: now(),
    initial: [{ inkId: "double-v-0", grams: "100" }],
    samples: [],
    additions: [],
    comment: "",
    status: "ACTIVE",
  });
  legacy.close();
  const d = new LabDB(name);
  await seed(d);
  const order = (await d.orders.get("order"))!;
  expect(order.colors).toHaveLength(1);
  expect(order.colors[0].references[0].id).toBe(r.id);
  expect((await d.batches.get("batch"))!.colorId).toBe(order.colors[0].id);
  const copy = await exportData(d),
    raw = {
      ...copy,
      version: 3,
      orders: copy.orders.map(({ colors, ...rest }) => rest),
      batches: copy.batches.map(({ colorId, ...rest }) => rest),
    };
  await importData(raw, d);
  expect((await d.orders.get("order"))!.colors[0].currentReferenceId).toBe(
    r.id,
  );
  await d.delete();
});
