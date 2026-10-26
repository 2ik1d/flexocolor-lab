import "fake-indexeddb/auto";
import Dexie from "dexie";
import { it, expect } from "vitest";
import {
  LabDB,
  seed,
  addInk,
  exportData,
  importData,
  saveSample,
  validateBackup,
} from "./db";
import { composition, total } from "../domain/mixture";
import {
  id,
  now,
  defaultConditions,
  type Batch,
  type Measurement,
} from "../domain/types";
it("сохраняет партию, добавки, пробы и восстанавливает JSON", async () => {
  const d = new LabDB(id());
  await seed(d);
  const b: Batch = {
    id: id(),
    name: "ТЕСТ",
    pantone: "TEST",
    createdAt: now(),
    initial: [{ inkId: "double-v-0", grams: "100" }],
    additions: [],
    samples: [],
    comment: "",
    status: "ACTIVE",
  };
  await d.batches.add(b);
  const m: Measurement = {
    id: id(),
    createdAt: now(),
    source: "PHOTO_UNCALIBRATED",
    lab: { l: 50, a: 2, b: 3 },
    conditions: defaultConditions,
  };
  await saveSample(
    b.id,
    {
      id: id(),
      createdAt: "2026-01-01T00:00:00Z",
      target: m,
      current: m,
      photoIds: [],
      components: b.initial,
      comment: "",
    },
    [],
    d,
  );
  await addInk(b.id, "double-v-0", "0.1", "", d);
  const updated = (await d.batches.get(b.id))!;
  expect(total(composition(updated))).toBe("100.1");
  await saveSample(
    b.id,
    {
      id: id(),
      createdAt: now(),
      target: m,
      current: m,
      photoIds: [],
      components: composition(updated),
      comment: "",
    },
    [],
    d,
  );
  expect(await d.experiments.count()).toBe(1);
  const copy = await exportData(d);
  await d.batches.clear();
  await importData(JSON.parse(JSON.stringify(copy)), d);
  expect((await d.batches.get(b.id))?.samples).toHaveLength(2);
  expect((await d.experiments.toArray())[0].excluded).toBe(true);
  await expect(
    importData({ ...copy, batches: [{ bad: true }] }, d),
  ).rejects.toThrow();
  expect(await d.batches.count()).toBe(1);
  await d.delete();
});
it("мигрирует схему v1 → v5 без потери истории", async () => {
  const name = id(),
    old = new Dexie(name);
  old.version(1).stores({
    inks: "id,name",
    recipes: "id,familyId",
    batches: "id,createdAt",
    profiles: "id",
    experiments: "id,batchId",
    photos: "id",
    settings: "id",
  });
  await old
    .table("batches")
    .put({ id: "legacy", name: "Legacy", createdAt: now(), initial: [] });
  old.close();
  const current = new LabDB(name);
  const b = await current.batches.get("legacy");
  expect(b?.status).toBe("ACTIVE");
  expect(b?.samples).toEqual([]);
  expect(current.verno).toBe(5);
  expect((await current.orders.toArray())[0].name).toBe("Legacy");
  expect(b?.orderId).toBe("legacy-order-legacy");
  await current.delete();
});
it("отвергает повреждённые ссылки и отсутствующие настройки до замены базы", async () => {
  const d = new LabDB(id());
  await seed(d);
  const copy = await exportData(d);
  expect(() => validateBackup({ ...copy, settings: [] })).toThrow("настроек");
  expect(() =>
    validateBackup({
      ...copy,
      settings: [{ ...copy.settings[0], profileId: "missing" }],
    }),
  ).toThrow("профиль");
  expect(() =>
    validateBackup({
      ...copy,
      recipes: [
        {
          id: "r",
          familyId: "r",
          version: 1,
          name: "TEST",
          pantone: "",
          source: "OWN",
          sourceNote: "",
          components: [{ inkId: "missing", grams: "1" }],
          createdAt: now(),
        },
      ],
    }),
  ).toThrow("краска");
  await expect(
    importData({ ...copy, inks: [...copy.inks, copy.inks[0]] }, d),
  ).rejects.toThrow("ID");
  expect(await d.inks.count()).toBe(9);
  await d.delete();
});
it("восстанавливает копию v2 как отдельные заказы с прежними пробами и эталонами", async () => {
  const d = new LabDB(id());
  await seed(d);
  const copy = await exportData(d);
  const m: Measurement = {
    id: "m",
    createdAt: now(),
    source: "SPECTRO_LAB",
    lab: { l: 50, a: 2, b: 4 },
    conditions: defaultConditions,
  };
  const legacy = {
    ...copy,
    version: 2,
    batches: ["first", "second"].map((name) => ({
      id: name,
      name,
      pantone: "185 C",
      createdAt: now(),
      initial: [{ inkId: "double-v-0", grams: "1000" }],
      additions: [],
      samples: [
        {
          id: `sample-${name}`,
          createdAt: now(),
          target: m,
          current: m,
          components: [{ inkId: "double-v-0", grams: "1000" }],
          photoIds: [],
          comment: "",
        },
      ],
      comment: "",
      status: "ACTIVE",
    })),
  };
  await importData(legacy, d);
  const orders = await d.orders.toArray();
  expect(orders).toHaveLength(2);
  expect(orders[0].references[0].measurement.lab).toEqual(m.lab);
  expect((await d.batches.get("first"))?.samples).toHaveLength(1);
  expect((await d.batches.get("first"))?.orderId).not.toBe(
    (await d.batches.get("second"))?.orderId,
  );
  expect((await exportData(d)).version).toBe(5);
  await d.delete();
});
