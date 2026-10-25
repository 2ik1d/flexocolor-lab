import type { ReactNode } from "react";
import { Trash2, Plus } from "lucide-react";
import type { Component, Ink, Conditions } from "../domain/types";
import { percent, total } from "../domain/mixture";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>;
}
export function ComponentsEditor({
  value,
  onChange,
  inks,
}: {
  value: Component[];
  onChange: (v: Component[]) => void;
  inks: Ink[];
}) {
  return (
    <div className="components">
      {value.map((c, i) => (
        <div className="component-row" key={i}>
          <select
            aria-label={`Краска ${i + 1}`}
            value={c.inkId}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i ? { ...v, inkId: e.target.value } : v,
                ),
              )
            }
          >
            {inks.map((ink) => (
              <option key={ink.id} value={ink.id}>
                {ink.name} · {ink.manufacturer}
                {ink.lot ? ` / ${ink.lot}` : ""}
              </option>
            ))}
          </select>
          <input
            aria-label={`Масса ${i + 1}`}
            inputMode="decimal"
            value={c.grams}
            onChange={(e) =>
              onChange(
                value.map((v, j) =>
                  j === i
                    ? { ...v, grams: e.target.value.replace(",", ".") }
                    : v,
                ),
              )
            }
          />
          <span>г</span>
          <button
            type="button"
            className="icon-button"
            aria-label={`Удалить компонент ${i + 1}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 size={17} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="subtle"
        onClick={() =>
          onChange([...value, { inkId: inks[0]?.id || "", grams: "0" }])
        }
      >
        <Plus size={16} />
        Добавить компонент
      </button>
    </div>
  );
}
export function Composition({
  value,
  inks,
}: {
  value: Component[];
  inks: Ink[];
}) {
  return (
    <div>
      {value.map((c, i) => (
        <div className="composition" key={i}>
          <span>{inks.find((ink) => ink.id === c.inkId)?.name || c.inkId}</span>
          <strong>{c.grams} г</strong>
          <small>{percent(c, value)}%</small>
        </div>
      ))}
      <div className="composition total">
        <span>Общая масса</span>
        <strong>{total(value)} г</strong>
      </div>
    </div>
  );
}
export function ConditionsEditor({
  value,
  onChange,
}: {
  value: Conditions;
  onChange: (v: Conditions) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="Идентификатор установки / освещения">
        <input
          value={value.setup}
          onChange={(e) => onChange({ ...value, setup: e.target.value })}
          placeholder="Коробка 1 · свет 1"
        />
      </Field>
      <Field label="Источник освещения">
        <input
          value={value.illuminant}
          onChange={(e) => onChange({ ...value, illuminant: e.target.value })}
        />
      </Field>
      <Field label="Белая точка Lab">
        <select
          value={value.whitePoint}
          onChange={(e) =>
            onChange({
              ...value,
              whitePoint: e.target.value as Conditions["whitePoint"],
            })
          }
        >
          <option>D50</option>
          <option>D65</option>
        </select>
      </Field>
      <Field label="Наблюдатель">
        <select
          value={value.observer}
          onChange={(e) =>
            onChange({ ...value, observer: e.target.value as "2" | "10" })
          }
        >
          <option value="2">2°</option>
          <option value="10">10°</option>
        </select>
      </Field>
      <Field label="Геометрия">
        <input
          value={value.geometry}
          onChange={(e) => onChange({ ...value, geometry: e.target.value })}
        />
      </Field>
      <Field label="Режим прибора">
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({ ...value, mode: e.target.value as Conditions["mode"] })
          }
        >
          {["unknown", "M0", "M1", "M2", "M3"].map((m) => (
            <option key={m} value={m}>
              {m === "unknown" ? "Неизвестен" : m}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export const date = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
