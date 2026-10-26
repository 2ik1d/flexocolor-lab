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
interface Props {
  orders: Order[];
  batches: Batch[];
  inks: Ink[];
  settings: Settings;
  experiments: Experiment[];
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
  const path = useHash().slice(1).split("/"),
    order = props.orders.find((o) => o.id === path[1]);
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState("");
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
    .filter((o) =>
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
          onClose={() => setCreating(false)}
          onError={props.onError}
          onSave={async (values) => {
            const first = values.colors[0];
            const order = orderSchema.parse({
              id: id(),
              createdAt: now(),
              pantone: first.pantone,
              references: [],
              currentReferenceId: "",
              ...values,
            });
            await db.orders.add(order);
            props.onChange();
            setCreating(false);
            location.hash = `orders/${order.id}`;
          }}
        />
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
          <a
            className="record card order-record"
            key={o.id}
            href={`#orders/${o.id}`}
          >
            <div className="card-heading">
              <FolderOpen size={22} />
              <small>{o.code || "Без номера"}</small>
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
          </a>
        ))}
      </div>
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
  onSave,
  onError,
  onClose,
}: {
  order?: Order;
  onSave: (v: OrderFields) => Promise<void>;
  onError: (s: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(order?.name || ""),
    [code, setCode] = useState(order?.code || ""),
    [customer, setCustomer] = useState(order?.customer || ""),
    [colors, setColors] = useState<OrderColor[]>(
      order?.colors.map((c) => ({ ...c })) || [newColor()],
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
      {colors.map((c, i) => (
        <div className="pantone-edit-row" key={c.id}>
          <Field label={`Pantone ${i + 1}`}>
            <input
              placeholder="185 C"
              value={c.pantone}
              onChange={(e) =>
                setColors((cs) =>
                  cs.map((v) =>
                    v.id === c.id ? { ...v, pantone: e.target.value } : v,
                  ),
                )
              }
            />
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
  const [editing, setEditing] = useState(false);
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
        </div>
        <button className="secondary" onClick={() => setEditing(!editing)}>
          Изменить / добавить Pantone
        </button>
      </div>
      {editing && (
        <OrderForm
          order={order}
          onError={props.onError}
          onClose={() => setEditing(false)}
          onSave={async (values) => {
            await db.transaction("rw", db.orders, async () => {
              const latest = (await db.orders.get(order.id))!;
              const colors = values.colors.map((c) => {
                const old = latest.colors.find((v) => v.id === c.id);
                return old
                  ? {
                      ...old,
                      pantone: c.pantone,
                      name: c.name,
                      currentReferenceId:
                        old.pantone === c.pantone ? old.currentReferenceId : "",
                    }
                  : c;
              });
              await db.orders.put({
                ...latest,
                ...values,
                colors,
                pantone: colors.map((c) => c.pantone).join(", "),
              });
            });
            setEditing(false);
            props.onChange();
          }}
        />
      )}
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
        <ColorWorkspace key={color.id} {...props} order={order} color={color} />
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
    .flatMap((b) => b.samples.map((s) => ({ sample: s, batch: b })))
    .sort((a, b) => b.sample.createdAt.localeCompare(a.sample.createdAt));
  const latest = samples[0];
  const previous = candidate
    ? samples.find((s) => s.sample.id !== savedId)
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
            </>
          ) : (
            <p>Загрузите эталон этого Pantone и выделите цветовой участок.</p>
          )}
        </div>
        <button
          className={reference ? "secondary" : ""}
          onClick={() => setEditingReference(!editingReference)}
        >
          {reference ? "Заменить эталон" : "Добавить эталон"}
        </button>
      </section>
      {editingReference && (
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
            <details>
              <summary>
                {active
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
                    setSavedId("");
                    props.onSuccess("Исходный состав сохранён");
                  })
                }
              >
                Сохранить исходный состав
              </button>
            </details>
          </section>
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
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  const batch = await ensureWorkingBatch(order.id, color.id);
                  await addComponents(batch.id, additions, comment);
                  setAdditions([{ inkId: props.inks[0]?.id || "", grams: "" }]);
                  setComment("");
                  setCandidate(undefined);
                  setSavedId("");
                  props.onSuccess(
                    "Добавки записаны. Выкатайте и загрузите новую пробу.",
                  );
                })
              }
            >
              Записать добавки
            </button>
          </section>
          {reference && (
            <>
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
                    onChange={setConditions}
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
                  />
                </section>
              )}
            </>
          )}
        </div>
        <aside className="stack bench-results" id={"comparison-" + color.id}>
          {candidate && reference && (
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
                      comment: "",
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
                previous={samples[1]?.sample}
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
              <Composition value={b.initial} inks={props.inks} />
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
