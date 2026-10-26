import { useState } from "react";
import type { Batch, Ink, Order } from "../domain/types";
import { addOrderNote } from "../storage/db";
import { progress } from "../domain/progress";
import { Composition, Field, date } from "./common";
import { MeasurementCard } from "./Compare";
import { SamplePhotos } from "./Records";

export function OrderHistory({
  order,
  batches,
  inks,
  onChange,
  onError,
}: {
  order: Order;
  batches: Batch[];
  inks: Ink[];
  onChange: () => void;
  onError: (s: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "notes">("all"),
    [text, setText] = useState(""),
    [colorId, setColorId] = useState(""),
    [busy, setBusy] = useState(false);
  const notes = [
    ...(order.notes.trim()
      ? [
          {
            id: "legacy-notes",
            createdAt: order.createdAt,
            kind: "NOTE" as const,
            text: order.notes,
            colorId: undefined,
          },
        ]
      : []),
    ...(order.events || []),
    ...batches.flatMap((batch) => [
      ...(batch.comment.trim()
        ? [
            {
              id: `note-${batch.id}`,
              createdAt: batch.createdAt,
              kind: "NOTE" as const,
              text: batch.comment,
              colorId: batch.colorId,
            },
          ]
        : []),
      ...batch.samples
        .filter((s) => s.comment.trim())
        .map((s) => ({
          id: `note-${s.id}`,
          createdAt: s.createdAt,
          kind: "NOTE" as const,
          text: `Результат выкатки: ${s.comment}`,
          colorId: batch.colorId,
        })),
      ...batch.additions
        .filter(
          (a, index, list) =>
            a.comment.trim() &&
            (!a.operationId ||
              list.findIndex((v) => v.operationId === a.operationId) === index),
        )
        .map((a) => ({
          id: `note-${a.operationId || a.id}`,
          createdAt: a.createdAt,
          kind: "NOTE" as const,
          text: `К добавке: ${a.comment}`,
          colorId: batch.colorId,
        })),
    ]),
  ];
  const events = [
    ...notes.map((n) => ({
      id: n.id,
      createdAt: n.createdAt,
      kind: n.kind === "NOTE" ? "note" : "status",
      colorId: n.colorId,
      content: (
        <>
          <h4>{n.kind === "NOTE" ? "Примечание" : "Статус заказа"}</h4>
          <p className="preserve-lines">{n.text}</p>
        </>
      ),
    })),
    ...order.colors.flatMap((color) =>
      color.references.map((r) => ({
        id: `${color.id}-${r.id}`,
        createdAt: r.createdAt,
        kind: "reference",
        colorId: color.id,
        content: (
          <>
            <h4>Эталон · {r.name}</h4>
            <details>
              <summary>Просмотреть эталон</summary>
              <MeasurementCard title="Эталон" measurement={r.measurement} />
              <SamplePhotos ids={r.photoIds} />
            </details>
          </>
        ),
      })),
    ),
    ...batches.flatMap((batch) => [
      {
        id: batch.id,
        createdAt: batch.createdAt,
        kind: "mixture",
        colorId: batch.colorId,
        content: (
          <>
            <h4>Исходная смесь</h4>
            {batch.compositionKnown === false ? (
              <p>Полный состав неизвестен.</p>
            ) : (
              <Composition value={batch.initial} inks={inks} />
            )}
          </>
        ),
      },
      ...batch.additions
        .filter(
          (a, index, list) =>
            !a.operationId ||
            list.findIndex((v) => v.operationId === a.operationId) === index,
        )
        .map((a) => {
          const group = a.operationId
            ? batch.additions.filter((v) => v.operationId === a.operationId)
            : [a];
          const result = batch.samples.find((s) =>
            s.additionIds?.includes(a.id),
          );
          return {
            id: a.operationId || a.id,
            createdAt: a.createdAt,
            kind: "addition",
            colorId: batch.colorId,
            content: (
              <>
                <h4>Что добавили</h4>
                <Composition
                  value={group.map((v) => v.component)}
                  inks={inks}
                  totalLabel="Добавлено"
                  showPercent={false}
                />
                <p>
                  {result
                    ? `Результат записан в выкатке от ${date(result.createdAt)}`
                    : "Ожидается выкатка после добавки"}
                </p>
              </>
            ),
          };
        }),
      ...batch.samples.map((sample, index) => {
        const result = progress(
          sample.target,
          sample.current,
          batch.samples[index - 1],
        );
        return {
          id: sample.id,
          createdAt: sample.createdAt,
          kind: "sample",
          colorId: batch.colorId,
          content: (
            <>
              <h4>Что вышло · Выкатка {index + 1}</h4>
              <p>
                ΔE00: {result.toTarget?.de00.toFixed(2) ?? "условия отличаются"}
                {result.trend === "CLOSER"
                  ? " · Ближе к эталону"
                  : result.trend === "FARTHER"
                    ? " · Дальше от эталона"
                    : result.trend === "UNCHANGED"
                      ? " · Почти без изменения"
                      : ""}
              </p>
              <details>
                <summary>Измерение, фото и состав выкатки</summary>
                <MeasurementCard title="Выкатка" measurement={sample.current} />
                <SamplePhotos ids={sample.photoIds} />
                <Composition
                  value={sample.components}
                  inks={inks}
                  showPercent={batch.compositionKnown !== false}
                  totalLabel={
                    batch.compositionKnown === false
                      ? "Известные компоненты"
                      : "Общая масса"
                  }
                />
              </details>
            </>
          ),
        };
      }),
    ]),
  ]
    .filter((event) => filter === "all" || event.kind === "note")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="card order-history">
      <h2>История заказа</h2>
      <div className="segmented" aria-label="Раздел истории">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Все события
        </button>
        <button
          className={filter === "notes" ? "active" : ""}
          onClick={() => setFilter("notes")}
        >
          Примечания ({notes.filter((n) => n.kind === "NOTE").length})
        </button>
      </div>
      <details className="note-composer" open>
        <summary>Добавить примечание</summary>
        <Field label="Примечание к заказу">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что добавили, что получилось, условия или решение…"
          />
        </Field>
        <Field label="К какому цвету относится">
          <select value={colorId} onChange={(e) => setColorId(e.target.value)}>
            <option value="">Ко всему заказу</option>
            {order.colors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.pantone}
              </option>
            ))}
          </select>
        </Field>
        <button
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await addOrderNote(order.id, text, colorId || undefined);
              setText("");
              onChange();
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Сохранить примечание
        </button>
      </details>
      <div className="timeline">
        {events.map((event) => (
          <article key={event.id} data-event={event.kind}>
            <small>
              {date(event.createdAt)}
              {event.colorId
                ? ` · ${order.colors.find((c) => c.id === event.colorId)?.pantone || "Цвет заказа"}`
                : ""}
            </small>
            {event.content}
          </article>
        ))}
      </div>
      {!events.length && (
        <p>
          {filter === "notes"
            ? "Примечаний пока нет."
            : "Здесь сохранятся эталоны, выкатки, добавки, результаты и примечания."}
        </p>
      )}
    </section>
  );
}
