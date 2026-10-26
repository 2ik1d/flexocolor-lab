import type { Batch, Order, OrderColor } from "./types";
import { progress } from "./progress";

export function colorWorkflow(color: OrderColor, batches: Batch[]) {
  const batch = batches
    .filter(
      (b) =>
        b.colorId === color.id && b.referenceId === color.currentReferenceId,
    )
    .sort(
      (a, b) =>
        Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
  const sample = batch?.samples.at(-1);
  const pending =
    batch?.additions.some((a) => !sample?.additionIds?.includes(a.id)) || false;
  const accepted = !!sample && color.acceptedSampleId === sample.id && !pending;
  const state: "accepted" | "reference" | "rollout" | "analysis" = accepted
    ? "accepted"
    : !color.currentReferenceId
      ? "reference"
      : pending || !sample
        ? "rollout"
        : "analysis";
  const labels = {
    accepted: "Подтверждён",
    reference: "Нужен эталон",
    rollout: pending ? "Выкатка после добавок" : "Первая выкатка",
    analysis: "Оценить результат",
  };
  return {
    batch,
    sample,
    pending,
    accepted,
    state,
    label: labels[state],
    delta: sample
      ? progress(sample.target, sample.current).toTarget?.de00
      : undefined,
  };
}

export function orderWorkflow(order: Order, batches: Batch[]) {
  const own = batches.filter((b) => b.orderId === order.id);
  const colors = order.colors.map((color) => ({
    color,
    ...colorWorkflow(color, own),
  }));
  const accepted = colors.filter((c) => c.accepted).length;
  const next = colors.find((c) => !c.accepted);
  const lastActivity = [
    order.createdAt,
    order.closedAt || "",
    ...(order.events || []).map((e) => e.createdAt),
    ...own.flatMap((b) => [
      b.createdAt,
      ...b.samples.map((s) => s.createdAt),
      ...b.additions.map((a) => a.createdAt),
    ]),
  ]
    .sort()
    .at(-1)!;
  return {
    colors,
    accepted,
    next,
    lastActivity,
    samples: own.reduce((n, b) => n + b.samples.length, 0),
    action:
      order.status === "DONE"
        ? "Просмотреть результат"
        : !next
          ? "Завершить заказ"
          : next.state === "reference"
            ? "Добавить эталон"
            : next.state === "rollout"
              ? "Загрузить выкатку"
              : "Продолжить подбор",
  };
}
