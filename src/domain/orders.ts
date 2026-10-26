import { id, now, type Batch, type Order, type Component } from "./types";
import { normalize, total } from "./mixture";
export function migrateLegacyBatches(batches: Batch[]): Order[] {
  // Never merge by Pantone or name: neither establishes order identity.
  return batches
    .filter((b) => !b.orderId)
    .map((b) => {
      const orderId = `legacy-order-${b.id}`;
      const target = b.samples[0]?.target;
      const reference = target
        ? {
            id: `legacy-reference-${b.id}`,
            createdAt: b.samples[0].createdAt,
            name: "Эталон первой сохранённой пробы",
            measurement: target,
            photoIds: target.captureId
              ? b.samples[0].photoIds.filter((p) => p === target.captureId)
              : [],
          }
        : undefined;
      b.orderId = orderId;
      b.runDate = b.createdAt.slice(0, 10);
      b.shift = "Перенесённый замес";
      b.referenceId = reference?.id;
      return {
        id: orderId,
        name: b.name,
        code: "",
        customer: "",
        pantone: b.pantone,
        createdAt: b.createdAt,
        notes:
          "Перенесено из прежнего журнала. Принадлежность к заказу не определялась по Pantone.",
        references: reference ? [reference] : [],
        currentReferenceId: reference?.id || "",
      };
    });
}
export interface NewRun {
  runDate: string;
  shift: string;
  components: Component[];
  comment: string;
}
export function makeRun(order: Order, input: NewRun): Batch {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.runDate) ||
    !Number.isFinite(Date.parse(input.runDate))
  )
    throw Error("Укажите дату запуска");
  if (!input.shift.trim()) throw Error("Укажите смену");
  const initial = normalize(input.components);
  if (Number(total(initial)) <= 0)
    throw Error("Укажите фактический состав краски перед запуском");
  if (!order.references.some((r) => r.id === order.currentReferenceId))
    throw Error("Сначала сохраните эталон заказа");
  return {
    id: id(),
    orderId: order.id,
    referenceId: order.currentReferenceId,
    name: `${order.name} · ${input.runDate} · ${input.shift.trim()}`,
    pantone: order.pantone,
    createdAt: now(),
    runDate: input.runDate,
    shift: input.shift.trim(),
    initial,
    additions: [],
    samples: [],
    comment: input.comment,
    status: "ACTIVE",
  };
}
