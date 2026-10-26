import { it, expect } from "vitest";
import { makeRun, migrateLegacyBatches } from "./orders";
import { defaultConditions, type Order, type Batch } from "./types";
import { composition } from "./mixture";
const reference = {
  id: "reference1",
  createdAt: "2026-10-26T00:00:00Z",
  name: "Эталон клиента",
  photoIds: [],
  measurement: {
    id: "target",
    createdAt: "2026-10-26T00:00:00Z",
    source: "SPECTRO_LAB" as const,
    lab: { l: 50, a: 10, b: 5 },
    conditions: defaultConditions,
  },
};
const order: Order = {
  id: "order1",
  name: "Этикетка",
  code: "123",
  customer: "Клиент",
  pantone: "185 C",
  createdAt: "2026-10-26T00:00:00Z",
  notes: "",
  references: [reference],
  currentReferenceId: reference.id,
};
it("повторный запуск с тем же эталоном получает независимый фактический состав", () => {
  const first = makeRun(order, {
    runDate: "2026-10-26",
    shift: "Дневная",
    components: [{ inkId: "yellow", grams: "1000" }],
    comment: "",
  });
  first.additions.push({
    id: "add",
    createdAt: "2026-10-26T01:00:00Z",
    component: { inkId: "red", grams: "100" },
    comment: "",
  });
  const second = makeRun(order, {
    runDate: "2026-10-27",
    shift: "Ночная",
    components: [
      { inkId: "yellow", grams: "800" },
      { inkId: "black", grams: "20" },
    ],
    comment: "Краску меняли на другом заказе",
  });
  expect(second.referenceId).toBe(first.referenceId);
  expect(second.orderId).toBe(order.id);
  expect(second.additions).toEqual([]);
  expect(second.samples).toEqual([]);
  expect(composition(second)).toEqual([
    { inkId: "yellow", grams: "800" },
    { inkId: "black", grams: "20" },
  ]);
  expect(composition(first)).toEqual([
    { inkId: "yellow", grams: "1000" },
    { inkId: "red", grams: "100" },
  ]);
});
it("новая версия эталона не меняет уже созданный запуск", () => {
  const first = makeRun(order, {
    runDate: "2026-10-26",
    shift: "1",
    components: [{ inkId: "yellow", grams: "1000" }],
    comment: "",
  });
  const updated = {
    ...order,
    references: [reference, { ...reference, id: "reference2" }],
    currentReferenceId: "reference2",
  };
  const second = makeRun(updated, {
    runDate: "2026-10-27",
    shift: "1",
    components: [{ inkId: "red", grams: "300" }],
    comment: "",
  });
  expect(first.referenceId).toBe("reference1");
  expect(second.referenceId).toBe("reference2");
});
it("не позволяет начинать запуск без эталона или фактической краски", () => {
  expect(() =>
    makeRun(
      { ...order, currentReferenceId: "" },
      {
        runDate: "2026-10-26",
        shift: "1",
        components: [{ inkId: "red", grams: "1" }],
        comment: "",
      },
    ),
  ).toThrow("эталон");
  expect(() =>
    makeRun(order, {
      runDate: "2026-10-26",
      shift: "1",
      components: [],
      comment: "",
    }),
  ).toThrow("фактический");
});
it("старые замесы с одинаковым Pantone не объединяются в один заказ", () => {
  const batches: Batch[] = ["a", "b"].map((id) => ({
    id,
    name: "Одинаковое имя",
    pantone: "185 C",
    createdAt: "2026-10-26T00:00:00Z",
    initial: [],
    additions: [],
    samples: [],
    comment: "",
    status: "ACTIVE" as const,
  }));
  const orders = migrateLegacyBatches(batches);
  expect(orders).toHaveLength(2);
  expect(batches[0].orderId).not.toBe(batches[1].orderId);
});
