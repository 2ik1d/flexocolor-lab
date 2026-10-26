import { useState } from "react";
import { Plus, Search, ArrowRight, FolderOpen } from "lucide-react";
import { useHash } from "./routing";
import {
  id,
  now,
  type Order,
  type OrderColor,
  type Batch,
  type Ink,
  type Settings,
  type Component,
  type Experiment,
  type Pantone,
  type Recipe,
} from "../domain/types";
import { saveOrder, repeatOrder, db } from "../storage/db";
import { pantoneKey } from "../domain/pantones";
import { Field, ComponentsEditor } from "./common";
import { ColorKnowledge } from "./ColorKnowledge";
import { OperatorWorkspace } from "./OperatorWorkspace";
export interface OrderProps {
  orders: Order[];
  batches: Batch[];
  inks: Ink[];
  settings: Settings;
  experiments: Experiment[];
  pantones: Pantone[];
  recipes: Recipe[];
  onChange: () => void;
  onError: (s: string) => void;
  onSuccess: (s: string) => void;
}
const emptyColor = (): OrderColor => ({
  id: id(),
  pantone: "",
  name: "",
  references: [],
  currentReferenceId: "",
});
export function Orders(props: OrderProps) {
  const hash = useHash(),
    parts = hash.split("?")[0].slice(1).split("/"),
    query = new URLSearchParams(hash.split("?")[1]);
  const order = props.orders.find((o) => o.id === parts[1]);
  const [creating, setCreating] = useState(!!query.get("pantone")),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ACTIVE"),
    [repeating, setRepeating] = useState("");
  async function repeat(source: Order) {
    setRepeating(source.id);
    try {
      const copy = await repeatOrder(source.id);
      props.onChange();
      location.hash = `orders/${copy.id}`;
    } catch (e) {
      props.onError((e as Error).message);
    } finally {
      setRepeating("");
    }
  }
  if (order)
    return (
      <OperatorWorkspace
        key={order.id}
        {...props}
        order={order}
        initialColorId={parts[3]}
        onRepeat={() => repeat(order)}
      />
    );
  if (parts[1])
    return (
      <section className="card">
        <h1>Открываем заказ…</h1>
        <a href="#orders">К списку заказов</a>
      </section>
    );
  if (creating)
    return (
      <OrderForm
        {...props}
        initialPantone={query.get("pantone") || ""}
        onClose={() => setCreating(false)}
        onSave={async (values) => {
          await saveOrder(values);
          props.onChange();
          setCreating(false);
          location.hash = `orders/${values.id}`;
        }}
      />
    );
  const list = props.orders
    .filter(
      (o) =>
        (!search.trim()
          ? filter === "ALL" || (o.status || "ACTIVE") === filter
          : true) &&
        `${o.code} ${o.name} ${o.customer} ${o.colors.map((c) => c.pantone).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">РАБОЧИЕ ЗАКАЗЫ</div>
          <h1>Заказы</h1>
          <p>Найдите номер для повтора или начните новый подбор.</p>
        </div>
        <button onClick={() => setCreating(true)}>
          <Plus size={18} />
          Новый заказ
        </button>
      </div>
      <div className="order-search">
        <Search size={20} />
        <input
          aria-label="Найти заказ"
          placeholder="Номер заказа, клиент или Pantone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="segmented" aria-label="Статус заказов">
        {[
          ["ACTIVE", "В работе"],
          ["DONE", "Завершённые"],
          ["ALL", "Все заказы"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="operator-order-list">
        {list.map((o) => (
          <article className="card operator-order-record" key={o.id}>
            <div>
              <span className="tag">
                {o.status === "DONE" ? "Подтверждён и завершён" : "В работе"}
              </span>
              <h2>№ {o.code || "Без номера"}</h2>
              <p>
                {o.name}
                {o.customer ? ` · ${o.customer}` : ""}
              </p>
              <div className="color-list-chips">
                {o.colors.map((c) => (
                  <span className="tag" key={c.id}>
                    {c.pantone}
                  </span>
                ))}
              </div>
            </div>
            <div className="actions">
              <a className="button-link" href={`#orders/${o.id}`}>
                Открыть и посмотреть историю <ArrowRight size={16} />
              </a>
              <button
                disabled={repeating === o.id}
                onClick={() => void repeat(o)}
              >
                Повтор
              </button>
            </div>
          </article>
        ))}
      </div>
      {!list.length && (
        <section className="card empty-state">
          <FolderOpen size={36} />
          <h3>
            {search ? "Заказ не найден" : "Новый заказ — с первого эталона"}
          </h3>
          <p>
            Номер, информация, нужные Pantone — затем фото эталона и первая
            выкатка.
          </p>
          <button onClick={() => setCreating(true)}>Создать заказ</button>
        </section>
      )}
    </>
  );
}
export function OrderForm({
  order,
  initialPantone = "",
  onSave,
  onClose,
  ...props
}: OrderProps & {
  order?: Order;
  initialPantone?: string;
  onSave: (order: Order) => Promise<void>;
  onClose: () => void;
}) {
  const [code, setCode] = useState(order?.code || ""),
    [name, setName] = useState(order?.name || ""),
    [customer, setCustomer] = useState(order?.customer || ""),
    [notes, setNotes] = useState(order?.notes || ""),
    [colors, setColors] = useState<OrderColor[]>(
      order?.colors.map((c) => structuredClone(c)) || [
        { ...emptyColor(), pantone: initialPantone },
      ],
    ),
    [view, setView] = useState(""),
    [busy, setBusy] = useState(false),
    [tolerance, setTolerance] = useState(
      String(order?.tolerance || props.settings.tolerance || ""),
    );
  function update(colorId: string, values: Partial<OrderColor>) {
    setColors((all) =>
      all.map((c) => (c.id === colorId ? { ...c, ...values } : c)),
    );
  }
  function knownComposition(value: string) {
    const key = pantoneKey(value);
    return (
      props.pantones.find((p) => p.id === key)?.startingComponents ||
      [...props.recipes]
        .filter((r) => pantoneKey(r.pantone) === key)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        ?.components ||
      [...props.batches]
        .filter(
          (b) =>
            pantoneKey(b.pantone) === key &&
            b.compositionKnown !== false &&
            b.initial.length,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.initial
    );
  }
  return (
    <>
      <button className="subtle" onClick={onClose}>
        ← Назад
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">КАРТОЧКА ЗАКАЗА</div>
          <h1>{order ? "Информация о заказе" : "Новый заказ"}</h1>
          <p>
            Сначала укажите заказ и цвета. Эталоны и выкатки — на следующем
            экране.
          </p>
        </div>
      </div>
      <section className="card order-form">
        <div className="form-grid">
          <Field label="Номер заказа">
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Например, 24018"
            />
          </Field>
          <Field label="Клиент">
            <input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </Field>
          <Field label="Название заказа">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Что печатаем"
            />
          </Field>
          <Field label="Допуск ΔE00">
            <input
              inputMode="decimal"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value.replace(",", "."))}
              placeholder="По согласованию"
            />
          </Field>
        </div>
        <Field label="Информация о заказе">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Материал, анилокс, особенности тиража…"
          />
        </Field>
        <div className="card-heading">
          <h2>Цвета заказа</h2>
          <Field label="Количество Pantone">
            <input
              type="number"
              min={order?.colors.length || 1}
              max={12}
              value={colors.length}
              onChange={(e) => {
                const count = Math.max(
                  order?.colors.length || 1,
                  Math.min(12, Number(e.target.value) || 1),
                );
                setColors((old) =>
                  Array.from(
                    { length: count },
                    (_, i) => old[i] || emptyColor(),
                  ),
                );
              }}
            />
          </Field>
        </div>
        <datalist id="operator-pantones">
          {props.pantones.map((p) => (
            <option key={p.id} value={p.pantone} />
          ))}
        </datalist>
        {colors.map((color, index) => (
          <section className="order-color-editor" key={color.id}>
            <div className="color-editor-heading">
              <span className="color-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Field label={`Pantone ${index + 1}`}>
                <input
                  list="operator-pantones"
                  placeholder="185 C"
                  value={color.pantone}
                  onChange={(e) =>
                    update(color.id, {
                      pantone: e.target.value,
                      currentReferenceId: "",
                      references: color.references.map((r) => ({
                        ...r,
                        pantone: r.pantone || color.pantone,
                      })),
                      acceptedSampleId: undefined,
                      startingComponents: structuredClone(
                        knownComposition(e.target.value),
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Назначение цвета ${index + 1}`}>
                <input
                  value={color.name}
                  onChange={(e) => update(color.id, { name: e.target.value })}
                  placeholder="Фон, логотип…"
                />
              </Field>
              <button
                className="secondary"
                disabled={!color.pantone.trim()}
                onClick={() => setView(view === color.id ? "" : color.id)}
              >
                {view === color.id
                  ? "Скрыть карточку"
                  : "Посмотреть цвет и состав"}
              </button>
            </div>
            {view === color.id && (
              <ColorKnowledge
                pantone={color.pantone}
                {...props}
                onUse={(components) =>
                  update(color.id, {
                    startingComponents: structuredClone(components),
                  })
                }
              />
            )}
            <details open={!!color.startingComponents?.length}>
              <summary>
                Исходная краска / состав {color.pantone || index + 1}
              </summary>
              <p className="hint">
                Состав до добавок. Его используем при повторе заказа. Если
                состав пока неизвестен, можно начать с фотографии.
              </p>
              <ComponentsEditor
                value={color.startingComponents || []}
                onChange={(startingComponents) =>
                  update(color.id, { startingComponents })
                }
                inks={props.inks}
              />
            </details>
          </section>
        ))}
        <button
          className="subtle"
          disabled={colors.length >= 12}
          onClick={() => setColors([...colors, emptyColor()])}
        >
          + Ещё Pantone
        </button>
        <div className="actions">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!code.trim()) throw Error("Введите номер заказа");
                if (colors.some((c) => !c.pantone.trim()))
                  throw Error("Укажите номера всех Pantone");
                if (
                  tolerance &&
                  (!Number.isFinite(Number(tolerance)) ||
                    Number(tolerance) <= 0)
                )
                  throw Error("Допуск должен быть больше нуля");
                const latest = order
                  ? await db.orders.get(order.id)
                  : undefined;
                const clean = colors.map((c) => ({
                  ...c,
                  pantone: c.pantone.trim(),
                }));
                await onSave({
                  ...latest,
                  id: order?.id || id(),
                  createdAt: order?.createdAt || now(),
                  code: code.trim(),
                  name: name.trim() || `Заказ ${code.trim()}`,
                  customer: customer.trim(),
                  notes,
                  colors: clean,
                  pantone: clean.map((c) => c.pantone).join(", "),
                  references: clean[0].references,
                  currentReferenceId: clean[0].currentReferenceId,
                  tolerance: tolerance ? Number(tolerance) : undefined,
                });
              } catch (e) {
                props.onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {order
              ? "Сохранить изменения"
              : "Создать заказ и перейти к эталонам"}
          </button>
          <button className="subtle" onClick={onClose}>
            Отмена
          </button>
        </div>
      </section>
    </>
  );
}
