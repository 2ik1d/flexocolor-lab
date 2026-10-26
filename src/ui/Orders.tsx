import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  ArrowRight,
  FolderOpen,
  CheckCheck,
  Clock3,
  FlaskConical,
} from "lucide-react";
import { z } from "zod";
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
  orderColorSchema,
  orderSchema,
} from "../domain/types";
import { saveOrder, repeatOrder, db } from "../storage/db";
import { pantoneKey } from "../domain/pantones";
import { Field, ComponentsEditor } from "./common";
import { ColorKnowledge } from "./ColorKnowledge";
import { OperatorWorkspace } from "./OperatorWorkspace";
import { orderWorkflow } from "../domain/workflow";
import { fanMap } from "../domain/fan";
import { scale } from "../domain/mixture";
import { useFormDraft } from "./useFormDraft";
import { date } from "./common";
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
  const [creating, setCreating] = useState(
      !!query.get("pantone") || !!query.get("recipe"),
    ),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ACTIVE"),
    [repeating, setRepeating] = useState(""),
    [sort, setSort] = useState("recent");
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
        key={`${query.get("recipe") || query.get("pantone") || "new"}:${query.get("mass") || "1000"}`}
        {...props}
        initialPantone={query.get("pantone") || ""}
        initialRecipe={props.recipes.find((r) => r.id === query.get("recipe"))}
        initialMass={query.get("mass") || "1000"}
        onClose={() => setCreating(false)}
        onSave={async (values) => {
          await saveOrder(values);
          props.onChange();
          setCreating(false);
          location.hash = `orders/${values.id}`;
        }}
      />
    );
  const summaries = new Map(
    props.orders.map((o) => [o.id, orderWorkflow(o, props.batches)]),
  );
  let savedDraft: z.infer<typeof formDraftSchema> | undefined;
  try {
    const raw = localStorage.getItem("FlexoColor.new-order:default");
    if (raw) {
      const value = formDraftSchema.parse(JSON.parse(raw));
      if (
        value.code ||
        value.customer ||
        value.notes ||
        value.name ||
        value.colors.some((c) => c.pantone)
      )
        savedDraft = value;
    }
  } catch {
    /* An invalid optional draft can be ignored. */
  }
  const activeCount = props.orders.filter((o) => o.status !== "DONE").length;
  const readyCount = props.orders.filter(
    (o) => o.status !== "DONE" && !summaries.get(o.id)!.next,
  ).length;
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
    .sort((a, b) =>
      sort === "number"
        ? a.code.localeCompare(b.code, "ru", { numeric: true })
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : summaries
              .get(b.id)!
              .lastActivity.localeCompare(summaries.get(a.id)!.lastActivity),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАША СМЕНА · FLEXOCOLOR LAB</div>
          <h1>Заказы</h1>
          <p>
            От первого эталона до подтверждённого цвета. Продолжайте с нужного
            шага.
          </p>
        </div>
        <button onClick={() => setCreating(true)}>
          <Plus size={18} />
          Новый заказ
        </button>
      </div>
      <div className="order-overview" aria-label="Обзор заказов">
        <div>
          <Clock3 size={20} />
          <strong>{activeCount}</strong>
          <span>В работе</span>
        </div>
        <div>
          <CheckCheck size={20} />
          <strong>{readyCount}</strong>
          <span>Можно завершить</span>
        </div>
        <div>
          <FlaskConical size={20} />
          <strong>{props.recipes.length}</strong>
          <span>Сохранённых рецептур</span>
        </div>
      </div>
      {savedDraft && (
        <section className="card draft-resume">
          <div>
            <span className="eyebrow">НЕЗАВЕРШЁННАЯ КАРТОЧКА</span>
            <h3>
              Черновик заказа{savedDraft.code ? ` № ${savedDraft.code}` : ""}
            </h3>
            <p>
              {savedDraft.customer ||
                savedDraft.name ||
                "Информация о заказе сохранена на устройстве"}
            </p>
          </div>
          <button className="secondary" onClick={() => setCreating(true)}>
            Продолжить черновик
          </button>
        </section>
      )}
      <div className="library-toolbar">
        <div className="order-search">
          <Search size={20} />
          <input
            aria-label="Найти заказ"
            placeholder="Номер заказа, клиент или Pantone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Field label="Сортировка заказов">
          <select
            aria-label="Сортировка заказов"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Последняя работа</option>
            <option value="oldest">Сначала старые</option>
            <option value="number">По номеру</option>
          </select>
        </Field>
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
        {list.map((o) => {
          const summary = summaries.get(o.id)!;
          return (
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
                  {summary.colors.map((c) => (
                    <span
                      className={`tag order-color-status ${c.accepted ? "is-accepted" : ""}`}
                      key={c.color.id}
                    >
                      <i
                        style={{
                          background:
                            fanMap.get(pantoneKey(c.color.pantone))?.catalog
                              ?.hex || "#536273",
                        }}
                      />
                      {c.color.pantone}
                      {c.delta !== undefined
                        ? ` · ΔE ${c.delta.toFixed(2)}`
                        : ""}
                      {c.accepted ? " ✓" : ""}
                    </span>
                  ))}
                </div>
                <div className="order-progress">
                  <progress
                    max={o.colors.length || 1}
                    value={summary.accepted}
                    aria-label={`Подтверждено цветов заказа ${o.code}`}
                  />
                  <small>
                    {summary.accepted} из {o.colors.length} подтверждено ·{" "}
                    {summary.samples} выкаток
                  </small>
                </div>
                <p className="order-next">
                  {o.status === "DONE"
                    ? "Результат и история сохранены"
                    : summary.next
                      ? `${summary.next.color.pantone} · ${summary.next.label}`
                      : "Все цвета подтверждены — можно завершить"}
                </p>
                <small>
                  Последняя работа: {date(summary.lastActivity)}
                  {o.production?.material ? ` · ${o.production.material}` : ""}
                </small>
              </div>
              <div className="actions">
                <a
                  className="button button-link"
                  href={`#orders/${o.id}${summary.next ? `/colors/${summary.next.color.id}` : ""}`}
                >
                  {summary.action} <ArrowRight size={16} />
                </a>
                <a
                  className="button-link order-history-link"
                  href={`#orders/${o.id}`}
                >
                  Открыть и посмотреть историю
                </a>
                <button
                  disabled={repeating === o.id}
                  onClick={() => void repeat(o)}
                >
                  Повтор
                </button>
              </div>
            </article>
          );
        })}
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
const formDraftSchema = z.object({
  code: z.string(),
  name: z.string(),
  customer: z.string(),
  notes: z.string(),
  tolerance: z.string(),
  colors: z.array(orderColorSchema).min(1).max(12),
  production: orderSchema.shape.production,
});
export function OrderForm({
  order,
  initialPantone = "",
  initialRecipe,
  initialMass = "1000",
  onSave,
  onClose,
  ...props
}: OrderProps & {
  order?: Order;
  initialPantone?: string;
  initialRecipe?: Recipe;
  initialMass?: string;
  onSave: (order: Order) => Promise<void>;
  onClose: () => void;
}) {
  const draft = useFormDraft(
    `FlexoColor.new-order:${initialRecipe ? `${initialRecipe.id}:${initialMass}` : initialPantone || "default"}`,
    formDraftSchema,
    !order,
  );
  const [code, setCode] = useState(order?.code || draft.restored?.code || ""),
    [name, setName] = useState(order?.name || draft.restored?.name || ""),
    [customer, setCustomer] = useState(
      order?.customer || draft.restored?.customer || "",
    ),
    [notes, setNotes] = useState(order?.notes || draft.restored?.notes || ""),
    [colors, setColors] = useState<OrderColor[]>(
      () =>
        order?.colors.map((c) => structuredClone(c)) ||
        draft.restored?.colors || [
          {
            ...emptyColor(),
            pantone:
              initialRecipe?.pantone || initialRecipe?.name || initialPantone,
            startingComponents: startingComposition(),
          },
        ],
    ),
    [view, setView] = useState(""),
    [busy, setBusy] = useState(false),
    [tolerance, setTolerance] = useState(
      order
        ? String(order.tolerance || props.settings.tolerance || "")
        : (draft.restored?.tolerance ?? String(props.settings.tolerance || "")),
    ),
    [production, setProduction] = useState(
      order?.production ||
        draft.restored?.production || {
          material: "",
          anilox: "",
          uv: "",
          speed: "",
        },
    );
  useEffect(() => {
    if (!order)
      draft.save({
        code,
        name,
        customer,
        notes,
        colors,
        tolerance,
        production,
      });
  }, [code, name, customer, notes, colors, tolerance, production]);
  function startingComposition() {
    if (initialRecipe) {
      try {
        return scale(initialRecipe.components, initialMass);
      } catch {
        return undefined;
      }
    }
    return initialPantone
      ? structuredClone(knownComposition(initialPantone))
      : undefined;
  }
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
        {!order && (
          <div className="draft-status">
            <span>
              {draft.available
                ? draft.restored
                  ? "Черновик восстановлен · изменения сохраняются на устройстве"
                  : "Черновик сохраняется на устройстве"
                : "Черновик не сохраняется: хранилище браузера недоступно"}
            </span>
            <button
              className="subtle"
              onClick={() => {
                draft.clear();
                setCode("");
                setName("");
                setCustomer("");
                setNotes("");
                setColors([emptyColor()]);
                setTolerance(String(props.settings.tolerance || ""));
                setProduction({ material: "", anilox: "", uv: "", speed: "" });
              }}
            >
              Очистить форму
            </button>
          </div>
        )}
        {initialRecipe && (
          <p className="notice">
            Основа: {initialRecipe.name} · v{initialRecipe.version} · замес{" "}
            {initialMass} г. Проверьте фактически взвешенные массы перед первой
            выкаткой.
          </p>
        )}
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
        <details className="production-fields" open={!!production.material}>
          <summary>Условия печати — материал, анилокс, УФ</summary>
          <div className="form-grid">
            {(
              [
                ["material", "Материал / подложка", "Например, BOPP белый"],
                ["anilox", "Анилокс", "Линиатура и объём"],
                ["uv", "УФ-режим", "Лампа, мощность"],
                ["speed", "Скорость печати", "Например, 80 м/мин"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <Field key={key} label={label}>
                <input
                  value={production[key]}
                  placeholder={placeholder}
                  onChange={(e) =>
                    setProduction((p) => ({ ...p, [key]: e.target.value }))
                  }
                />
              </Field>
            ))}
          </div>
        </details>
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
                  production,
                  colors: clean,
                  pantone: clean.map((c) => c.pantone).join(", "),
                  references: clean[0].references,
                  currentReferenceId: clean[0].currentReferenceId,
                  tolerance: tolerance ? Number(tolerance) : undefined,
                });
                draft.clear();
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
