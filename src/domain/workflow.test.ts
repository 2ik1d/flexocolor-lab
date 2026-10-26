import { it, expect } from "vitest";
import { colorWorkflow, orderWorkflow } from "./workflow";
import {
  defaultConditions,
  type Batch,
  type Order,
  type Sample,
  type OrderColor,
} from "./types";
const measurement = {
  id: "m",
  createdAt: "2026-01-01T00:00:00Z",
  source: "SPECTRO_LAB" as const,
  lab: { l: 50, a: 1, b: 2 },
  conditions: defaultConditions,
};
const color: OrderColor = {
  id: "c",
  pantone: "TEST",
  name: "",
  references: [],
  currentReferenceId: "r",
};
const sample: Sample = {
  id: "s",
  createdAt: measurement.createdAt,
  target: measurement,
  current: measurement,
  photoIds: [],
  components: [],
  comment: "",
  additionIds: [],
};
const batch: Batch = {
  id: "b",
  orderId: "o",
  colorId: "c",
  referenceId: "r",
  createdAt: measurement.createdAt,
  name: "Test",
  pantone: "TEST",
  initial: [],
  additions: [],
  samples: [sample],
  comment: "",
  status: "ACTIVE",
};
it("возобновляет анализ сохранённой пробы, а после добавки требует выкатку", () => {
  expect(colorWorkflow(color, [batch]).state).toBe("analysis");
  const changed = {
    ...batch,
    additions: [
      {
        id: "a",
        createdAt: measurement.createdAt,
        component: { inkId: "i", grams: "1" },
        comment: "",
      },
    ],
  };
  expect(
    colorWorkflow({ ...color, acceptedSampleId: "s" }, [changed]).state,
  ).toBe("rollout");
  expect(
    colorWorkflow({ ...color, acceptedSampleId: "s" }, [batch]).accepted,
  ).toBe(true);
});
it("старый эталон не становится текущим результатом", () => {
  expect(
    colorWorkflow({ ...color, currentReferenceId: "new" }, [batch]).sample,
  ).toBeUndefined();
  expect(
    colorWorkflow({ ...color, currentReferenceId: "" }, [batch]).state,
  ).toBe("reference");
});
it("очередь показывает следующий неподтверждённый цвет и последнюю работу", () => {
  const second = {
    ...color,
    id: "c2",
    pantone: "TEST 2",
    currentReferenceId: "",
  };
  const order: Order = {
    id: "o",
    name: "Test",
    code: "1",
    customer: "",
    pantone: "",
    createdAt: measurement.createdAt,
    notes: "",
    references: [],
    currentReferenceId: "",
    colors: [{ ...color, acceptedSampleId: "s" }, second],
    events: [
      {
        id: "n",
        createdAt: "2026-01-02T00:00:00Z",
        kind: "NOTE",
        text: "Note",
      },
    ],
  };
  const result = orderWorkflow(order, [batch]);
  expect(result.accepted).toBe(1);
  expect(result.next?.color.id).toBe("c2");
  expect(result.action).toBe("Добавить эталон");
  expect(result.lastActivity).toBe("2026-01-02T00:00:00Z");
});
