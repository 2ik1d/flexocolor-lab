import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Batch, Component, Ink, Order } from "../domain/types";
import { percent, total } from "../domain/mixture";
import { orderWorkflow } from "../domain/workflow";
import { date } from "./common";

export function ProductionSheet({
  title,
  subtitle,
  components,
  inks,
  order,
  batches = [],
  note,
  onClose,
}: {
  title: string;
  subtitle?: string;
  components?: Component[];
  inks: Ink[];
  order?: Order;
  batches?: Batch[];
  note?: string;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = [
          ...document.querySelectorAll<HTMLElement>(
            ".sheet-overlay button, .sheet-overlay a[href]",
          ),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          last?.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first?.focus();
          event.preventDefault();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [onClose]);
  const workflow = order && orderWorkflow(order, batches);
  return createPortal(
    <div
      className="sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Карта замеса и отчёт"
    >
      <div className="sheet-toolbar">
        <span>Карта для производства</span>
        <div className="actions">
          <button onClick={() => window.print()}>
            <Printer size={18} /> Печать / PDF
          </button>
          <button
            ref={close}
            className="secondary"
            onClick={onClose}
            aria-label="Закрыть карту замеса"
          >
            <X size={18} /> Закрыть
          </button>
        </div>
      </div>
      <article className="production-sheet">
        <header>
          <strong>FLEXOCOLOR LAB</strong>
          <span>{date(new Date().toISOString())}</span>
        </header>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {order && (
          <>
            <div className="sheet-metadata">
              <span>
                Клиент: <b>{order.customer || "—"}</b>
              </span>
              <span>
                Статус:{" "}
                <b>{order.status === "DONE" ? "Завершён" : "В работе"}</b>
              </span>
              <span>
                Допуск ΔE00: <b>{order.tolerance ?? "Не задан"}</b>
              </span>
              {Object.entries(order.production || {}).map(
                ([key, value]) =>
                  value && (
                    <span key={key}>
                      {
                        (
                          {
                            material: "Материал",
                            anilox: "Анилокс",
                            uv: "УФ-режим",
                            speed: "Скорость",
                          } as Record<string, string>
                        )[key]
                      }
                      : <b>{value}</b>
                    </span>
                  ),
              )}
            </div>
            {order.notes && <p className="preserve-lines">{order.notes}</p>}
          </>
        )}
        {components && <SheetComposition components={components} inks={inks} />}
        {workflow?.colors.map((item) => {
          const reference = item.color.references.find(
            (r) => r.id === item.color.currentReferenceId,
          );
          return (
            <section className="sheet-color" key={item.color.id}>
              <h2>
                {item.color.pantone}
                {item.color.name ? ` · ${item.color.name}` : ""}
              </h2>
              <p>
                {item.label} · ΔE00: {item.delta?.toFixed(2) ?? "—"} · Выкаток:{" "}
                {item.batch?.samples.length || 0}
              </p>
              {reference && (
                <p>
                  Эталон: {reference.name} · Lab{" "}
                  {reference.measurement.lab.l.toFixed(2)} /{" "}
                  {reference.measurement.lab.a.toFixed(2)} /{" "}
                  {reference.measurement.lab.b.toFixed(2)} ·{" "}
                  {reference.measurement.source.startsWith("PHOTO")
                    ? "Фотооценка"
                    : "Прибор"}
                </p>
              )}
              <h3>Исходная краска — до добавок</h3>
              {item.color.startingComponents?.length ? (
                <SheetComposition
                  components={item.color.startingComponents}
                  inks={inks}
                />
              ) : (
                <p>Исходный состав не записан</p>
              )}
              {!!item.sample?.components.length && (
                <>
                  <h3>Состав последней выкатки</h3>
                  <SheetComposition
                    components={item.sample.components}
                    inks={inks}
                    known={item.batch?.compositionKnown !== false}
                  />
                  {item.pending && (
                    <p>
                      После этой выкатки внесены добавки. Новая выкатка ещё не
                      сохранена.
                    </p>
                  )}
                </>
              )}
              {!!item.batch?.additions.length && (
                <>
                  <h3>Фактические добавки</h3>
                  <ul>
                    {item.batch.additions.map((a) => (
                      <li key={a.id}>
                        {date(a.createdAt)} ·{" "}
                        {inks.find((i) => i.id === a.component.inkId)?.name ||
                          a.component.inkId}{" "}
                        — {a.component.grams} г
                        {a.comment ? ` · ${a.comment}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
        {!!order?.events?.filter((e) => e.kind === "NOTE").length && (
          <section>
            <h2>Примечания к заказу</h2>
            {order.events
              .filter((e) => e.kind === "NOTE")
              .map((e) => (
                <p className="preserve-lines" key={e.id}>
                  {date(e.createdAt)}
                  {e.colorId
                    ? ` · ${order.colors.find((c) => c.id === e.colorId)?.pantone || ""}`
                    : ""}
                  <br />
                  {e.text}
                </p>
              ))}
          </section>
        )}
        {note && <p className="preserve-lines">{note}</p>}
        <footer>
          <span>Оператор: ___________________</span>
          <span>Дата / подпись: ___________________</span>
        </footer>
      </article>
    </div>,
    document.body,
  );
}

function SheetComposition({
  components,
  inks,
  known = true,
}: {
  components: Component[];
  inks: Ink[];
  known?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Базовая краска / код</th>
            <th>Производитель</th>
            <th>Масса, г</th>
            <th>{known ? "Доля, %" : ""}</th>
            <th>Взвешено</th>
          </tr>
        </thead>
        <tbody>
          {components.map((c, index) => {
            const ink = inks.find((i) => i.id === c.inkId);
            return (
              <tr key={index}>
                <td>
                  {ink?.name || c.inkId}
                  <small>
                    {ink?.code}
                    {ink?.lot ? ` · партия ${ink.lot}` : ""}
                  </small>
                </td>
                <td>{ink?.manufacturer}</td>
                <td>{c.grams}</td>
                <td>{known ? percent(c, components) : "—"}</td>
                <td>□</td>
              </tr>
            );
          })}
          <tr className="sheet-total">
            <td colSpan={2}>{known ? "Итого" : "Известные компоненты"}</td>
            <td>{total(components)}</td>
            <td colSpan={2}>{known ? "100%" : "Исходный состав неизвестен"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
