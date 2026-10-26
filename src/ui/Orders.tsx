import { useEffect, useState } from "react";
import { ArrowLeft, FolderOpen, Plus, ArrowRight, Trash2 } from "lucide-react";
import { useHash } from "./routing";
import {
  db,
  saveColorReference,
  ensureWorkingBatch,
  setColorComposition,
  addComponents,
  saveSample,
  saveOrder,
  repeatOrder,
  setOrderStatus,
  useColorReference,
  saveSampleRecipe,
} from "../storage/db";
import {
  id,
  now,
  orderSchema,
  type Order,
  type OrderColor,
  type Batch,
  type Ink,
  type Settings,
  type Component,
  type Experiment,
  type Measurement,
  type Pantone,
  type Recipe,
} from "../domain/types";
import { composition, total } from "../domain/mixture";
import { progress } from "../domain/progress";
import { ReferenceEditor } from "./ReferenceEditor";
import { PhotoEditor, type PhotoSelection } from "./PhotoEditor";
import { MeasurementCard, SpectroInput } from "./Compare";
import { SamplePhotos } from "./Records";
import {
  ComponentsEditor,
  Composition,
  Field,
  date,
  ConditionsEditor,
} from "./common";
import { ProgressReport } from "./ProgressReport";
import { pantoneKey } from "../domain/pantones";
import { OrderHistory } from "./OrderHistory";
import { RecipeStarter } from "./RecipeStarter";
interface Props {
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
const newColor = (): OrderColor => ({
  id: id(),
  pantone: "",
  name: "",
  references: [],
  currentReferenceId: "",
});
export function Orders(props: Props) {
  const hash = useHash(),
    query = new URLSearchParams(hash.split("?")[1]),
    path = hash.split("?")[0].slice(1).split("/"),
    order = props.orders.find((o) => o.id === path[1]);
  const [creating, setCreating] = useState(!!query.get("pantone")),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  async function repeat(orderId: string) {
    try {
      const copy = await repeatOrder(orderId);
      props.onChange();
      location.hash = `orders/${copy.id}`;
    } catch (e) {
      props.onError((e as Error).message);
    }
  }
  if (order)
    return (
      <OrderWorkspace
        key={order.id}
        {...props}
        order={order}
        selectedId={
          path[2] === "colors"
            ? path[3]
            : props.batches.find((b) => b.id === path[3])?.colorId
        }
      />
    );
  if (path[1])
    return (
      <section className="card">
        <h1>Заказ не найден</h1>
        <a href="#orders">Все заказы</a>
      </section>
    );
  const list = props.orders
    .filter(
      (o) =>
        (status === "all" || (o.status || "ACTIVE") === status) &&
        `${o.name} ${o.code} ${o.customer} ${o.colors.map((c) => c.pantone).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FLEXOCOLOR LAB</div>
          <h1>Заказы</h1>
          <p>Выберите заказ и Pantone — продолжайте подбирать цвет.</p>
        </div>
        <button onClick={() => setCreating(!creating)}>
          <Plus size={18} />
          Новый заказ
        </button>
      </div>
      {creating && (
        <OrderForm
          pantones={props.pantones}
          initialPantone={query.get("pantone") || ""}
          onClose={() => setCreating(false)}
          onError={props.onError}
          onSave={async (values) => {
            const first = values.colors[0];
            const order = orderSchema.parse({
              id: id(),
              createdAt: now(),
              pantone: first.pantone,
              references: first.references,
              currentReferenceId: first.currentReferenceId,
              ...values,
            });
            await saveOrder(order);
            props.onChange();
            setCreating(false);
            location.hash = `orders/${order.id}`;
          }}
        />
      )}
      {!!props.orders.length && (
        <div className="segmented" aria-label="Статус заказов">
          {[
            ["all", "Все"],
            ["ACTIVE", "В работе"],
            ["DONE", "Закрытые"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "active" : ""}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!!props.orders.length && (
        <input
          className="search"
          aria-label="Найти заказ"
          value={search}
          placeholder="Заказ, клиент или Pantone…"
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="record-grid">
        {list.map((o) => (
          <article className="record card order-record" key={o.id}>
            <div className="card-heading">
              <FolderOpen size={22} />
              <small>{o.code || "Без номера"}</small>
              <span className="tag">
                {o.status === "DONE" ? "Закрыт" : "В работе"}
              </span>
            </div>
            <h3>{o.name}</h3>
            {o.customer && <p>{o.customer}</p>}
            <div className="color-list-chips">
              {o.colors.map((c) => (
                <span className="tag" key={c.id}>
                  {c.pantone}
                </span>
              ))}
            </div>
            <div className="record-meta">
              <span>
                Проб:{" "}
                {props.batches
                  .filter((b) => b.orderId === o.id)
                  .reduce((sum, b) => sum + b.samples.length, 0)}
              </span>
              <ArrowRight size={18} />
            </div>
            <div className="actions">
              <a className="button-link" href={`#orders/${o.id}`}>
                Просмотреть <ArrowRight size={16} />
              </a>
              <button className="secondary" onClick={() => void repeat(o.id)}>
                Повторить
              </button>
            </div>
          </article>
        ))}
      </div>
      {!!props.orders.length && !list.length && (
        <p>Заказы по этому запросу не найдены.</p>
      )}
      {!props.orders.length && !creating && (
        <section className="card empty-state">
          <FolderOpen size={40} />
          <h3>С какого заказа начнём?</h3>
          <p>
            В одном заказе можно добавить сразу несколько Pantone. У каждого
            будет свой эталон, краска и история проб.
          </p>
          <button onClick={() => setCreating(true)}>Создать заказ</button>
        </section>
      )}
    </>
  );
}
type OrderFields = Pick<
  Order,
  "name" | "code" | "customer" | "notes" | "colors"
>;
function OrderForm({
  order,
  pantones,
  initialPantone = "",
  onSave,
  onError,
  onClose,
}: {
  order?: Order;
  pantones: Pantone[];
  initialPantone?: string;
  onSave: (v: OrderFields) => Promise<void>;
  onError: (s: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(order?.name || ""),
    [code, setCode] = useState(order?.code || ""),
    [customer, setCustomer] = useState(order?.customer || ""),
    [colors, setColors] = useState<OrderColor[]>(
      order?.colors.map((c) => ({ ...c })) || [
        { ...newColor(), pantone: initialPantone },
      ],
    ),
    [busy, setBusy] = useState(false);
  return (
    <section className="card order-form">
      <h3>{order ? "Заказ и его Pantone" : "Новый заказ"}</h3>
      <Field label="Название заказа">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="Номер заказа">
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Клиент">
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          />
        </Field>
      </div>
      <h4>Pantone в заказе</h4>
      <p className="hint">
        Выберите из базы или введите новый номер. Новый Pantone сохранится в
        справочнике вместе с заказом.
      </p>
      <datalist id="order-pantones">
        {pantones.map((p) => (
          <option key={p.id} value={p.pantone}>
            {p.currentReferenceId ? "Есть эталон" : "Без эталона"}
          </option>
        ))}
      </datalist>
      {colors.map((c, i) => (
        <div className="pantone-edit-row" key={c.id}>
          <Field label={`Pantone ${i + 1}`}>
            <input
              list="order-pantones"
              placeholder="185 C"
              value={c.pantone}
              onChange={(e) =>
                setColors((cs) =>
                  cs.map((v) =>
                    v.id === c.id
                      ? {
                          ...v,
                          pantone: e.target.value,
                          references: v.references.map((r) => ({
                            ...r,
                            pantone: r.pantone || v.pantone,
                          })),
                          currentReferenceId: "",
                        }
                      : v,
                  ),
                )
              }
            />
          </Field>
          <Field label={`Эталон Pantone ${i + 1}`}>
            <select
              aria-label={`Эталон Pantone ${i + 1}`}
              value={c.currentReferenceId || ""}
              onChange={(e) => {
                const entry = pantones.find(
                  (p) => p.id === pantoneKey(c.pantone),
                );
                const reference = [
                  ...c.references,
                  ...(entry?.references || []),
                ].find(
                  (r) =>
                    r.id === e.target.value &&
                    (!r.pantone ||
                      pantoneKey(r.pantone) === pantoneKey(c.pantone)),
                );
                setColors((cs) =>
                  cs.map((v) =>
                    v.id === c.id
                      ? {
                          ...v,
                          currentReferenceId: reference?.id || "",
                          references:
                            reference &&
                            !v.references.some((r) => r.id === reference.id)
                              ? [...v.references, structuredClone(reference)]
                              : v.references,
                        }
                      : v,
                  ),
                );
              }}
            >
              <option value="">Новый — загрузить после создания</option>
              {[
                ...new Map(
                  [
                    ...(pantones.find((p) => p.id === pantoneKey(c.pantone))
                      ?.references || []),
                    ...c.references.filter(
                      (r) =>
                        (!r.pantone ||
                          pantoneKey(r.pantone) === pantoneKey(c.pantone)) &&
                        order?.colors.some(
                          (old) =>
                            old.id === c.id &&
                            pantoneKey(old.pantone) === pantoneKey(c.pantone) &&
                            old.references.some((ref) => ref.id === r.id),
                        ),
                    ),
                  ].map((r) => [r.id, r]),
                ).values(),
              ].map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {date(r.createdAt)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Где используется ${i + 1}`}>
            <input
              placeholder="Логотип / фон (необязательно)"
              value={c.name}
              onChange={(e) =>
                setColors((cs) =>
                  cs.map((v) =>
                    v.id === c.id ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          {!order?.colors.some((v) => v.id === c.id) && colors.length > 1 && (
            <button
              className="icon-button"
              aria-label={`Убрать Pantone ${i + 1}`}
              onClick={() => setColors((cs) => cs.filter((v) => v.id !== c.id))}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ))}
      <button
        className="secondary"
        onClick={() => setColors([...colors, newColor()])}
      >
        <Plus size={16} />
        Ещё Pantone
      </button>
      <div className="actions">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (!name.trim()) throw Error("Введите название заказа");
              if (colors.some((c) => !c.pantone.trim()))
                throw Error("Укажите номера Pantone");
              if (
                new Set(colors.map((c) => pantoneKey(c.pantone))).size !==
                colors.length
              )
                throw Error("Этот Pantone уже есть в заказе");
              await onSave({
                name: name.trim(),
                code,
                customer,
                notes: order?.notes || "",
                colors: colors.map((c) => ({
                  ...c,
                  pantone: c.pantone.trim(),
                })),
              });
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Сохранить заказ
        </button>
        <button className="subtle" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </section>
  );
}
function OrderWorkspace({
  order,
  selectedId,
  ...props
}: Props & { order: Order; selectedId?: string }) {
  const [editing, setEditing] = useState(false),
    [tab, setTab] = useState<"work" | "history">("work"),
    [busy, setBusy] = useState(false);
  const closed = order.status === "DONE";
  async function action(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
      props.onChange();
    } catch (e) {
      props.onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const color =
    order.colors.find((c) => c.id === selectedId) || order.colors[0];
  return (
    <>
      <a className="back-link" href="#orders">
        <ArrowLeft size={16} />
        Все заказы
      </a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {[order.code, order.customer].filter(Boolean).join(" · ") ||
              "ЗАКАЗ"}
          </div>
          <h1>{order.name}</h1>
          <span className="tag">{closed ? "Заказ закрыт" : "В работе"}</span>
          {order.repeatOf && (
            <p>
              <a href={`#orders/${order.repeatOf}`}>Исходный заказ</a>
            </p>
          )}
        </div>
        <div className="actions order-actions">
          {!closed && (
            <button className="secondary" onClick={() => setEditing(!editing)}>
              Изменить / добавить Pantone
            </button>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const copy = await repeatOrder(order.id);
                location.hash = `orders/${copy.id}`;
              })
            }
          >
            Повторить заказ
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await setOrderStatus(order.id, closed ? "ACTIVE" : "DONE");
                setEditing(false);
                props.onSuccess(
                  closed
                    ? "Заказ возобновлён"
                    : "Заказ закрыт. История сохранена.",
                );
              })
            }
          >
            {closed ? "Возобновить заказ" : "Закрыть заказ"}
          </button>
        </div>
      </div>
      {editing && (
        <OrderForm
          order={order}
          pantones={props.pantones}
          onError={props.onError}
          onClose={() => setEditing(false)}
          onSave={async (values) => {
            const latest = (await db.orders.get(order.id))!;
            const colors = values.colors.map((c) => {
              const old = latest.colors.find((v) => v.id === c.id);
              return old
                ? {
                    ...old,
                    pantone: c.pantone,
                    name: c.name,
                    references: [
                      ...new Map(
                        [
                          ...old.references.map((r) => ({
                            ...r,
                            pantone: r.pantone || old.pantone,
                          })),
                          ...c.references,
                        ].map((r) => [r.id, r]),
                      ).values(),
                    ],
                    currentReferenceId: c.currentReferenceId,
                  }
                : c;
            });
            await saveOrder({
              ...latest,
              ...values,
              colors,
              pantone: colors.map((c) => c.pantone).join(", "),
              references: colors[0].references,
              currentReferenceId: colors[0].currentReferenceId,
            });
            setEditing(false);
            props.onChange();
          }}
        />
      )}
      <div className="segmented" aria-label="Раздел заказа">
        <button
          className={tab === "work" ? "active" : ""}
          onClick={() => setTab("work")}
        >
          Эталон и выкатки
        </button>
        <button
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          История заказа
        </button>
      </div>
      {tab === "history" ? (
        <OrderHistory
          order={order}
          batches={props.batches.filter((b) => b.orderId === order.id)}
          inks={props.inks}
          onChange={props.onChange}
          onError={props.onError}
        />
      ) : (
        <>
          <nav className="pantone-tabs" aria-label="Pantone заказа">
            {order.colors.map((c) => (
              <a
                className={c.id === color?.id ? "active" : ""}
                href={`#orders/${order.id}/colors/${c.id}`}
                key={c.id}
              >
                {c.pantone}
                {c.name && <small>{c.name}</small>}
              </a>
            ))}
          </nav>
          {color && (
            <ColorWorkspace
              key={`${color.id}-${color.pantone}-${color.currentReferenceId}-${closed}`}
              {...props}
              order={order}
              color={color}
            />
          )}
        </>
      )}
    </>
  );
}
function ColorWorkspace({
  order,
  color,
  ...props
}: Props & { order: Order; color: OrderColor }) {
  const [editingReference, setEditingReference] = useState(
      !color.currentReferenceId,
    ),
    [initial, setInitial] = useState<Component[]>([
      { inkId: props.inks[0]?.id || "", grams: "" },
    ]),
    [additions, setAdditions] = useState<Component[]>([
      { inkId: props.inks[0]?.id || "", grams: "" },
    ]),
    [comment, setComment] = useState(""),
    [sampleComment, setSampleComment] = useState(""),
    [catalogReference, setCatalogReference] = useState(""),
    [inputVersion, setInputVersion] = useState(0),
    [candidate, setCandidate] = useState<Measurement>(),
    [photo, setPhoto] = useState<PhotoSelection["photo"]>(),
    [busy, setBusy] = useState(false),
    [savedId, setSavedId] = useState(""),
    [mode, setMode] = useState<"photo" | "lab">("photo"),
    [conditions, setConditions] = useState(props.settings.conditions);
  useEffect(() => {
    if (candidate && window.matchMedia("(max-width:900px)").matches)
      document
        .getElementById("comparison-" + color.id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [candidate?.id]);
  const reference = color.references.find(
    (r) => r.id === color.currentReferenceId,
  );
  const closed = order.status === "DONE";
  const availableReferences = [
    ...new Map(
      [
        ...(props.pantones.find((p) => p.id === pantoneKey(color.pantone))
          ?.references || []),
        ...color.references.filter(
          (r) =>
            !r.pantone || pantoneKey(r.pantone) === pantoneKey(color.pantone),
        ),
      ].map((r) => [r.id, r]),
    ).values(),
  ];
  const batches = props.batches
    .filter((b) => b.orderId === order.id && b.colorId === color.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active =
    batches.find(
      (b) =>
        b.status === "ACTIVE" && b.referenceId === (reference?.id || undefined),
    ) ||
    batches.find(
      (b) => b.status === "ACTIVE" && !b.referenceId && !b.samples.length,
    );
  const samples = batches
    .flatMap((b) =>
      [...b.samples].reverse().map((s) => ({ sample: s, batch: b })),
    )
    .sort((a, b) => b.sample.createdAt.localeCompare(a.sample.createdAt));
  const latest = samples[0];
  const previous = candidate
    ? samples.find((s) => s.batch.id === active?.id && s.sample.id !== savedId)
    : undefined;
  const report =
    reference && candidate
      ? progress(reference.measurement, candidate, previous?.sample)
      : undefined;
  const changes =
    active?.additions.filter(
      (a) => !previous?.sample.additionIds?.includes(a.id),
    ) || [];
  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      props.onChange();
    } catch (e) {
      props.onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function receive(s: PhotoSelection) {
    setPhoto(s.photo);
    setCandidate({
      ...s.measurement,
      profileId: props.settings.profileId || undefined,
      conditions: {
        ...props.settings.conditions,
        whitePoint: "D50",
        observer: "2",
      },
    });
    setSavedId("");
  }
  return (
    <div className="color-workspace">
      <div className="workflow-strip">
        <span>1 · Эталон</span>
        <span>2 · Выкатка</span>
        <span>3 · Сравнение и советы</span>
        <span>4 · Добавка → новая выкатка</span>
      </div>
      {closed && (
        <p className="notice">
          Заказ закрыт{order.closedAt ? ` · ${date(order.closedAt)}` : ""}.
          Эталоны, выкатки и результаты доступны для просмотра.
        </p>
      )}
      <section className="card target-strip">
        <div>
          <div className="eyebrow">ЭТАЛОН · {color.pantone}</div>
          {reference ? (
            <>
              <strong>{reference.name}</strong>
              <p className="hint">
                {reference.measurement.source.startsWith("PHOTO")
                  ? "Фотооценка"
                  : "Измерение прибора"}{" "}
                · {date(reference.createdAt)}
              </p>
              <SamplePhotos
                key={reference.id}
                ids={reference.photoIds}
                autoLoad
              />
              <details>
                <summary>
                  Просмотреть эталон и его версии ({color.references.length})
                </summary>
                {[...color.references].reverse().map((r) => (
                  <div key={r.id}>
                    <p>
                      {r.name} · {date(r.createdAt)}
                      {r.id === reference.id ? " · Текущий" : ""}
                    </p>
                    <MeasurementCard
                      title="Эталон"
                      measurement={r.measurement}
                    />
                    <SamplePhotos ids={r.photoIds} />
                  </div>
                ))}
              </details>
            </>
          ) : (
            <p>Загрузите эталон этого Pantone и выделите цветовой участок.</p>
          )}
        </div>
        <button
          disabled={closed || busy}
          className={reference ? "secondary" : ""}
          onClick={() => setEditingReference(!editingReference)}
        >
          {reference ? "Заменить эталон" : "Добавить эталон"}
        </button>
      </section>
      {!closed && availableReferences.length > 0 && (
        <details className="card reference-picker">
          <summary>Выбрать сохранённый эталон из базы Pantone</summary>
          <Field label="Сохранённый эталон">
            <select
              value={catalogReference}
              onChange={(e) => setCatalogReference(e.target.value)}
            >
              <option value="">Выберите версию</option>
              {availableReferences.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {date(r.createdAt)}
                </option>
              ))}
            </select>
          </Field>
          <button
            disabled={
              busy || !catalogReference || catalogReference === reference?.id
            }
            onClick={() =>
              void attempt(async () => {
                await useColorReference(order.id, color.id, catalogReference);
                props.onSuccess("Эталон из базы выбран");
              })
            }
          >
            Использовать эталон
          </button>
        </details>
      )}
      {editingReference && !closed && (
        <ReferenceEditor
          settings={props.settings}
          onError={props.onError}
          onClose={() => setEditingReference(false)}
          onSave={async (r, photos) => {
            await saveColorReference(order.id, color.id, r, photos);
            setEditingReference(false);
            setCandidate(undefined);
            setPhoto(undefined);
            setSavedId("");
            props.onChange();
            props.onSuccess(`Эталон ${color.pantone} сохранён`);
          }}
        />
      )}
      <div className="bench-grid">
        <div className="stack">
          {!closed && (
            <RecipeStarter
              color={color}
              recipes={props.recipes}
              batches={props.batches}
              inks={props.inks}
              onError={props.onError}
              onUse={(components) => {
                setInitial(components);
                document
                  .querySelector<HTMLDetailsElement>(".mixture-panel details")
                  ?.setAttribute("open", "");
                props.onSuccess(
                  "Рецептура подставлена. Проверьте и сохраните фактический состав.",
                );
              }}
            />
          )}
          <section className="card mixture-panel">
            <div className="card-heading">
              <h3>Что есть в краске</h3>
              <strong className="mass-badge">
                {active?.compositionKnown !== false && active
                  ? `${total(composition(active))} г`
                  : "Масса неизвестна"}
              </strong>
            </div>
            {active?.compositionKnown !== false && active ? (
              <Composition value={composition(active)} inks={props.inks} />
            ) : (
              <p className="hint">
                Можно сравнивать фото без рецептуры. Внесённые добавки
                сохранятся отдельно; общая масса пока неизвестна.
              </p>
            )}
            {active?.compositionKnown === false &&
              active.additions.length > 0 && (
                <>
                  <p className="hint">
                    Известные добавки:{" "}
                    {total(active.additions.map((a) => a.component))} г
                  </p>
                  <Composition
                    value={composition(active)}
                    inks={props.inks}
                    totalLabel="Всего известных добавок"
                    showPercent={false}
                  />
                </>
              )}
            {!closed && (
              <details>
                <summary>
                  {active &&
                  (active.samples.length > 0 ||
                    active.additions.length > 0 ||
                    active.compositionKnown !== false)
                    ? "Краска изменилась / указать новый исходный состав"
                    : "Указать исходный состав (если известен)"}
                </summary>
                <p className="hint">
                  Если эту краску меняли на другом заказе, введите, что сейчас в
                  ёмкости. Прошлые пробы останутся в истории.
                </p>
                <ComponentsEditor
                  value={initial}
                  onChange={setInitial}
                  inks={props.inks}
                />
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void attempt(async () => {
                      await setColorComposition(order.id, color.id, initial);
                      setCandidate(undefined);
                      setPhoto(undefined);
                      setSampleComment("");
                      setInputVersion((v) => v + 1);
                      setSavedId("");
                      props.onSuccess("Исходный состав сохранён");
                    })
                  }
                >
                  Сохранить исходный состав
                </button>
              </details>
            )}
          </section>
          {!closed && (
            <section className="card addition-panel">
              <h3>Что добавил</h3>
              <ComponentsEditor
                value={additions}
                onChange={setAdditions}
                inks={props.inks}
              />
              <Field label="Заметка к добавке">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </Field>
              <button
                disabled={busy || !reference}
                onClick={() =>
                  void attempt(async () => {
                    const batch = await ensureWorkingBatch(order.id, color.id);
                    await addComponents(batch.id, additions, comment);
                    setAdditions([
                      { inkId: props.inks[0]?.id || "", grams: "" },
                    ]);
                    setComment("");
                    setCandidate(undefined);
                    setPhoto(undefined);
                    setSampleComment("");
                    setInputVersion((v) => v + 1);
                    setSavedId("");
                    props.onSuccess(
                      "Добавки записаны. Выкатайте и загрузите новую пробу.",
                    );
                  })
                }
              >
                Записать добавки
              </button>
              {!reference && (
                <p className="hint">
                  Сначала сохраните или выберите эталон Pantone.
                </p>
              )}
            </section>
          )}
          {reference && !closed && (
            <fieldset className="sample-input" disabled={busy}>
              <div className="sample-section-heading">
                <h3>
                  {samples.length
                    ? "Выкатал — загрузить пробу"
                    : "Загрузить исходный оттиск"}
                </h3>
                <button
                  className="subtle"
                  onClick={() => {
                    setMode(mode === "photo" ? "lab" : "photo");
                    setCandidate(undefined);
                    setPhoto(undefined);
                    setSavedId("");
                  }}
                >
                  {mode === "photo" ? "Ввести Lab / CSV" : "Загрузить фото"}
                </button>
              </div>
              {mode === "photo" ? (
                <PhotoEditor
                  key={inputVersion}
                  compact
                  label="Новая проба"
                  onAnalyze={receive}
                  onInvalidate={() => {
                    setCandidate(undefined);
                    setSavedId("");
                  }}
                  onError={props.onError}
                />
              ) : (
                <section className="card">
                  <ConditionsEditor
                    value={conditions}
                    onChange={(value) => {
                      setConditions(value);
                      setCandidate(undefined);
                      setSavedId("");
                    }}
                  />
                  <SpectroInput
                    title="Новая проба"
                    conditions={conditions}
                    onMeasurement={(m) => {
                      setCandidate(m);
                      setPhoto(undefined);
                      setSavedId("");
                    }}
                    onError={props.onError}
                    onInvalidate={() => {
                      setCandidate(undefined);
                      setSavedId("");
                    }}
                  />
                </section>
              )}
              <Field label="Что вышло / примечание к выкатке">
                <textarea
                  value={sampleComment}
                  onChange={(e) => setSampleComment(e.target.value)}
                  disabled={!!savedId}
                  placeholder="Оценка результата, условия, решение…"
                />
              </Field>
            </fieldset>
          )}
        </div>
        <aside className="stack bench-results" id={"comparison-" + color.id}>
          {latest &&
            (!candidate || savedId === latest.sample.id) &&
            latest.batch.compositionKnown !== false &&
            latest.sample.components.length > 0 && (
              <button
                className="secondary"
                disabled={
                  busy ||
                  props.recipes.some(
                    (r) => r.id === `sample-recipe-${latest.sample.id}`,
                  )
                }
                onClick={() =>
                  void attempt(async () => {
                    await saveSampleRecipe(latest.batch.id, latest.sample.id);
                    props.onSuccess(
                      "Состав выкатки сохранён в рецептурах этого Pantone",
                    );
                  })
                }
              >
                {props.recipes.some(
                  (r) => r.id === `sample-recipe-${latest.sample.id}`,
                )
                  ? "Состав выкатки уже в рецептурах"
                  : "Сохранить состав выкатки в рецептуры"}
              </button>
            )}
          {candidate && reference && !closed && (
            <button
              className="wide"
              disabled={busy || !!savedId || !report?.toTarget}
              onClick={() =>
                void attempt(async () => {
                  const batch = await ensureWorkingBatch(order.id, color.id);
                  const sampleId = id();
                  await saveSample(
                    batch.id,
                    {
                      id: sampleId,
                      createdAt: now(),
                      target: reference.measurement,
                      current: candidate,
                      referenceId: reference.id,
                      photoIds: [
                        ...new Set([
                          ...reference.photoIds,
                          ...(photo ? [photo.id] : []),
                        ]),
                      ],
                      components: composition(batch),
                      comment: sampleComment.trim(),
                      additionIds: [],
                    },
                    photo ? [photo] : [],
                  );
                  setSavedId(sampleId);
                  props.onSuccess("Проба сохранена");
                })
              }
            >
              {savedId ? "Проба сохранена" : "Сохранить пробу"}
            </button>
          )}
          {candidate && reference ? (
            <ProgressReport
              target={reference.measurement}
              current={candidate}
              previous={previous?.sample}
              changes={previous?.batch.id === active?.id ? changes : []}
              inks={props.inks}
            />
          ) : latest && reference ? (
            <>
              <p className="hint">
                Последняя сохранённая проба · {date(latest.sample.createdAt)}
                {latest.sample.referenceId !== reference.id
                  ? " · Эталон изменён: разница пересчитана, исходное сравнение сохранено в истории."
                  : ""}
              </p>
              <ProgressReport
                target={reference.measurement}
                current={latest.sample.current}
                previous={
                  samples.find(
                    (s) =>
                      s.batch.id === latest.batch.id &&
                      s.sample.id !== latest.sample.id,
                  )?.sample
                }
                changes={latest.batch.additions.filter(
                  (a) =>
                    latest.sample.additionIds?.includes(a.id) &&
                    !samples[1]?.sample.additionIds?.includes(a.id),
                )}
                inks={props.inks}
              />
            </>
          ) : (
            <section className="card">
              <h3>Туда или не туда?</h3>
              <p>
                После анализа здесь появятся разница с эталоном, изменение
                относительно прошлой пробы и советы.
              </p>
              <p className="hint">
                Первая проба станет точкой отсчёта. После добавки загрузите
                следующую.
              </p>
            </section>
          )}
        </aside>
      </div>
      <details className="card color-history">
        <summary>
          Вся история {color.pantone} · проб: {samples.length}
        </summary>
        {batches.map((b) => (
          <section className="history-mixture" key={b.id}>
            <h3>
              {date(b.createdAt)} · {b.pantone} ·{" "}
              {b.compositionKnown === false
                ? "Исходный состав неизвестен"
                : `Исходная масса ${total(b.initial)} г`}
            </h3>
            {b.initial.length > 0 && (
              <Composition
                value={b.initial}
                inks={props.inks}
                showPercent={b.compositionKnown !== false}
                totalLabel={
                  b.compositionKnown === false
                    ? "Известные компоненты"
                    : "Исходная масса"
                }
              />
            )}
            <div className="timeline">
              {[
                ...b.samples.map((s) => ({
                  kind: "sample" as const,
                  value: s,
                })),
                ...b.additions.map((a) => ({
                  kind: "addition" as const,
                  value: a,
                })),
              ]
                .sort((a, c) =>
                  a.value.createdAt.localeCompare(c.value.createdAt),
                )
                .map((event) => (
                  <article key={event.value.id}>
                    <small>{date(event.value.createdAt)}</small>
                    {event.kind === "addition" ? (
                      <h4>
                        + {event.value.component.grams} г ·{" "}
                        {
                          props.inks.find(
                            (i) => i.id === event.value.component.inkId,
                          )?.name
                        }
                        {event.value.comment && ` · ${event.value.comment}`}
                      </h4>
                    ) : (
                      <>
                        <h4>
                          Проба · ΔE00{" "}
                          {progress(
                            event.value.target,
                            event.value.current,
                          ).toTarget?.de00.toFixed(2) ?? "условия различаются"}
                        </h4>
                        {event.value.comment && (
                          <p className="preserve-lines">
                            {event.value.comment}
                          </p>
                        )}
                        <details>
                          <summary>Фото, измерение и состав</summary>
                          <MeasurementCard
                            title="Оттиск"
                            measurement={event.value.current}
                          />
                          <SamplePhotos ids={event.value.photoIds} />
                          {event.value.components.length > 0 && (
                            <Composition
                              value={event.value.components}
                              inks={props.inks}
                              showPercent={b.compositionKnown !== false}
                              totalLabel={
                                b.compositionKnown === false
                                  ? "Зафиксированные компоненты"
                                  : "Общая масса"
                              }
                            />
                          )}
                        </details>
                      </>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
        {!batches.length && (
          <p>
            Здесь сохранятся все пробы и внесённые компоненты этого Pantone.
          </p>
        )}
      </details>
    </div>
  );
}
