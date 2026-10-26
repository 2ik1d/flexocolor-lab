import { useEffect, useState } from "react";
import { useHash } from "./routing";
import {
  FolderOpen,
  Plus,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  History,
  ScanLine,
} from "lucide-react";
import {
  id,
  now,
  orderSchema,
  type Order,
  type Batch,
  type Ink,
  type Settings,
  type Component,
  type Experiment,
  type OrderReference,
  type Measurement,
} from "../domain/types";
import { db, saveOrderReference, createRun } from "../storage/db";
import { difference } from "../color/color";
import { composition, total } from "../domain/mixture";
import { Compare, MeasurementCard, SpectroInput } from "./Compare";
import { PhotoEditor, type PhotoSelection } from "./PhotoEditor";
import { Batches, SamplePhotos } from "./Records";
import {
  ComponentsEditor,
  Composition,
  Field,
  Notice,
  date,
  ConditionsEditor,
} from "./common";
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
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function Orders(props: Props) {
  const hash = useHash(),
    path = hash.slice(1).split("/");
  const [creating, setCreating] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    setCreating(false);
  }, [hash]);
  const order = props.orders.find((o) => o.id === path[1]);
  const run = order
    ? props.batches.find((b) => b.id === path[3] && b.orderId === order.id)
    : undefined;
  if (order && run)
    return <RunWorkspace key={run.id} {...props} order={order} run={run} />;
  if (order) return <OrderDetail key={order.id} {...props} order={order} />;
  if (path[1])
    return (
      <section className="card">
        <h1>Заказ не найден</h1>
        <a href="#orders">Вернуться к заказам</a>
      </section>
    );
  const list = props.orders
    .filter((o) =>
      `${o.name} ${o.code} ${o.customer} ${o.pantone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
  function lastDate(o: Order) {
    return props.batches
      .filter((b) => b.orderId === o.id)
      .reduce((s, b) => (b.createdAt > s ? b.createdAt : s), o.createdAt);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">РАБОТА ПО ЗАКАЗАМ</div>
          <h1>Заказы</h1>
          <p>
            Эталон, запуски по сменам и вся история приладки — в одном месте.
          </p>
        </div>
        <button onClick={() => setCreating(!creating)}>
          <Plus size={18} />
          Новый заказ
        </button>
      </div>
      {creating && (
        <OrderForm
          onSave={async (values) => {
            const order = orderSchema.parse({
              id: id(),
              createdAt: now(),
              references: [],
              currentReferenceId: "",
              ...values,
            });
            await db.orders.add(order);
            props.onChange();
            location.hash = `orders/${order.id}`;
          }}
          onError={props.onError}
          onClose={() => setCreating(false)}
        />
      )}
      {props.orders.length > 0 && (
        <input
          className="search"
          aria-label="Найти заказ"
          placeholder="Заказ, номер, клиент или Pantone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="record-grid order-grid">
        {list.map((o) => {
          const runs = props.batches
            .filter((b) => b.orderId === o.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const ref = o.references.find((r) => r.id === o.currentReferenceId);
          return (
            <a
              className="record card order-record"
              href={`#orders/${o.id}`}
              key={o.id}
            >
              <div className="card-heading">
                <FolderOpen size={23} />
                <span className="tag">{o.code || "Без номера"}</span>
              </div>
              <h3>{o.name}</h3>
              <p>
                {[o.customer, o.pantone].filter(Boolean).join(" · ") ||
                  "Клиент и Pantone не указаны"}
              </p>
              <div className="order-reference-status">
                {ref ? (
                  <>
                    <i
                      style={{
                        background: ref.measurement.stats
                          ? `rgb(${ref.measurement.stats.median.join(",")})`
                          : "#53615a",
                      }}
                    />
                    Эталон сохранён
                  </>
                ) : (
                  "Нужно добавить эталон"
                )}
              </div>
              <div className="record-meta">
                <span>
                  {runs.length} запусков ·{" "}
                  {runs.reduce((s, b) => s + b.samples.length, 0)} проб
                </span>
                <ArrowRight size={18} />
              </div>
              <small>
                {runs[0]
                  ? `Последний запуск: ${runs[0].runDate || date(runs[0].createdAt)} · ${runs[0].shift || ""}`
                  : "Запусков ещё не было"}
              </small>
            </a>
          );
        })}
      </div>
      {!props.orders.length && !creating && (
        <section className="card empty-state">
          <FolderOpen size={42} />
          <h3>Один заказ — одна история цвета</h3>
          <p>
            Сохраните эталон один раз. Когда заказ повторится, начните новый
            запуск с фактическим составом краски на эту смену.
          </p>
          <button onClick={() => setCreating(true)}>
            Создать первый заказ
          </button>
        </section>
      )}
      {props.orders.length > 0 && !list.length && <p>Заказы не найдены.</p>}
    </>
  );
}
function OrderForm({
  order,
  onSave,
  onClose,
  onError,
}: {
  order?: Order;
  onSave: (
    v: Pick<Order, "name" | "code" | "customer" | "pantone" | "notes">,
  ) => Promise<void>;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [values, setValues] = useState({
      name: order?.name || "",
      code: order?.code || "",
      customer: order?.customer || "",
      pantone: order?.pantone || "",
      notes: order?.notes || "",
    }),
    [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h3>{order ? "Карточка заказа" : "Новый заказ"}</h3>
      <div className="form-grid">
        {(["name", "code", "customer", "pantone"] as const).map((k, i) => (
          <Field
            key={k}
            label={
              ["Название заказа", "Номер заказа", "Клиент", "Pantone заказа"][i]
            }
          >
            <input
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            />
          </Field>
        ))}
      </div>
      <Field label="Примечание к заказу">
        <textarea
          value={values.notes}
          onChange={(e) => setValues({ ...values, notes: e.target.value })}
        />
      </Field>
      <div className="actions">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (!values.name.trim()) throw Error("Введите название заказа");
              await onSave({ ...values, name: values.name.trim() });
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
          Отмена
        </button>
      </div>
    </section>
  );
}
function OrderDetail({ order, ...props }: Props & { order: Order }) {
  const [editing, setEditing] = useState(false),
    [addingReference, setAddingReference] = useState(false),
    [starting, setStarting] = useState(false);
  const runs = props.batches
    .filter((b) => b.orderId === order.id)
    .sort(
      (a, b) =>
        (b.runDate || b.createdAt).localeCompare(a.runDate || a.createdAt) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const reference = order.references.find(
    (r) => r.id === order.currentReferenceId,
  );
  return (
    <>
      <a className="back-link" href="#orders">
        <ArrowLeft size={17} />
        Все заказы
      </a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {[order.code, order.customer].filter(Boolean).join(" · ") ||
              "КАРТОЧКА ЗАКАЗА"}
          </div>
          <h1>{order.name}</h1>
          <p>{order.pantone || "Pantone не указан"}</p>
        </div>
        <button disabled={!reference} onClick={() => setStarting(!starting)}>
          <Plus size={18} />
          Новый запуск
        </button>
      </div>
      <button className="subtle" onClick={() => setEditing(!editing)}>
        Изменить карточку заказа
      </button>
      {editing && (
        <OrderForm
          order={order}
          onClose={() => setEditing(false)}
          onError={props.onError}
          onSave={async (values) => {
            await db.orders.update(order.id, values);
            setEditing(false);
            props.onChange();
          }}
        />
      )}
      <section className="card order-reference">
        <div className="card-heading">
          <h3>Эталон заказа</h3>
          {reference && (
            <button
              className="subtle"
              onClick={() => setAddingReference(!addingReference)}
            >
              Новая версия эталона
            </button>
          )}
        </div>
        {reference ? (
          <>
            <div className="reference-overview">
              <div>
                <h4>{reference.name}</h4>
                <p className="hint">
                  {reference.measurement.source.startsWith("PHOTO")
                    ? "Фотооценка"
                    : "Измерение прибора"}{" "}
                  · {date(reference.createdAt)} · версия{" "}
                  {order.references.findIndex((r) => r.id === reference.id) + 1}
                </p>
              </div>
              <div className="reference-coordinates">
                L* {reference.measurement.lab.l.toFixed(1)} · a*{" "}
                {reference.measurement.lab.a.toFixed(1)} · b*{" "}
                {reference.measurement.lab.b.toFixed(1)}
              </div>
            </div>
            <SamplePhotos
              key={reference.id}
              ids={reference.photoIds}
              autoLoad
            />
            <p className="hint">
              Этот эталон используется для новых запусков заказа. Ранее
              сохранённые пробы и эталоны остаются в своей истории.
            </p>
          </>
        ) : (
          <>
            <p>
              Загрузите исходный эталон или введите измерение прибора. Он
              останется в этом заказе для следующих смен.
            </p>
            <button onClick={() => setAddingReference(true)}>
              Добавить эталон заказа
            </button>
          </>
        )}
        {order.notes && <p>{order.notes}</p>}
      </section>
      {addingReference && (
        <ReferenceEditor
          settings={props.settings}
          onError={props.onError}
          onClose={() => setAddingReference(false)}
          onSave={async (ref, photos) => {
            await saveOrderReference(order.id, ref, photos);
            setAddingReference(false);
            props.onChange();
            props.onSuccess("Эталон сохранён в заказе");
          }}
        />
      )}
      {starting && (
        <NewRunForm
          order={order}
          inks={props.inks}
          previous={runs[0]}
          onClose={() => setStarting(false)}
          onError={props.onError}
          onStart={async (input) => {
            const run = await createRun(order.id, input);
            props.onChange();
            location.hash = `orders/${order.id}/runs/${run.id}`;
          }}
        />
      )}
      <div className="section-heading">
        <h2>История запусков</h2>
        <span className="tag">{runs.length} запусков</span>
      </div>
      {!runs.length && (
        <section className="card empty-state">
          <CalendarDays size={35} />
          <h3>Каждая смена начинается отдельно</h3>
          <p>
            Укажите дату, смену и фактический состав краски перед запуском. Все
            пробы и добавки сохранятся здесь.
          </p>
          {reference && (
            <button onClick={() => setStarting(true)}>
              Начать первый запуск
            </button>
          )}
        </section>
      )}
      <div className="run-list">
        {runs.map((b) => (
          <article className="card run-record" key={b.id}>
            <div className="card-heading">
              <div>
                <h3>
                  {b.runDate || date(b.createdAt)} ·{" "}
                  {b.shift || "Смена не указана"}
                </h3>
                <small>
                  {b.status === "ACTIVE" ? "В работе" : "Завершён"} · эталон v
                  {order.references.findIndex((r) => r.id === b.referenceId) +
                    1 || "—"}
                </small>
              </div>
              <a
                className="button secondary"
                href={`#orders/${order.id}/runs/${b.id}`}
              >
                Открыть запуск
                <ArrowRight size={16} />
              </a>
            </div>
            <div className="run-summary">
              <span>{b.samples.length} проб</span>
              <span>{b.additions.length} добавок</span>
              <strong>{total(composition(b))} г</strong>
            </div>
            {b.comment && <p>{b.comment}</p>}
            <details>
              <summary>Все пробы, добавки и состав этого запуска</summary>
              <RunHistory run={b} inks={props.inks} />
            </details>
          </article>
        ))}
      </div>
      {order.references.length > 1 && (
        <details className="card">
          <summary>Все версии эталона ({order.references.length})</summary>
          {order.references.map((r, i) => (
            <article className="reference-version" key={r.id}>
              <h4>
                v{i + 1} · {r.name}
              </h4>
              <small>{date(r.createdAt)}</small>
              <MeasurementCard title="Эталон" measurement={r.measurement} />
              <SamplePhotos ids={r.photoIds} />
            </article>
          ))}
        </details>
      )}
    </>
  );
}
function ReferenceEditor({
  settings,
  onSave,
  onClose,
  onError,
}: {
  settings: Settings;
  onSave: (
    ref: OrderReference,
    photos: PhotoSelection["photo"][],
  ) => Promise<void>;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [selection, setSelection] = useState<PhotoSelection>(),
    [measurement, setMeasurement] = useState<Measurement>(),
    [kind, setKind] = useState<"photo" | "lab">("photo"),
    [name, setName] = useState("Исходный эталон"),
    [conditions, setConditions] = useState(settings.conditions),
    [busy, setBusy] = useState(false);
  return (
    <section className="reference-editor">
      <div className="card">
        <div className="card-heading">
          <h3>Сохранить эталон</h3>
          <button className="subtle" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <Field label="Название эталона">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="segmented">
          <button
            className={kind === "photo" ? "active" : ""}
            onClick={() => {
              setKind("photo");
              setMeasurement(undefined);
            }}
          >
            Фотография
          </button>
          <button
            className={kind === "lab" ? "active" : ""}
            onClick={() => {
              setKind("lab");
              setSelection(undefined);
            }}
          >
            Lab / CSV
          </button>
        </div>
        {kind === "lab" && (
          <>
            <ConditionsEditor value={conditions} onChange={setConditions} />
            <SpectroInput
              title="Эталон заказа"
              conditions={conditions}
              onMeasurement={setMeasurement}
              onError={onError}
            />
          </>
        )}
      </div>
      {kind === "photo" && (
        <PhotoEditor
          label="Эталон заказа"
          onInvalidate={() => {
            setSelection(undefined);
            setMeasurement(undefined);
          }}
          onAnalyze={(s) => {
            const m = {
              ...s.measurement,
              profileId: settings.profileId || undefined,
              conditions: {
                ...settings.conditions,
                whitePoint: "D50" as const,
                observer: "2" as const,
              },
            };
            setSelection({ ...s, measurement: m });
            setMeasurement(m);
          }}
          onError={onError}
        />
      )}
      {measurement && (
        <section className="card">
          <MeasurementCard title="Выбранный эталон" measurement={measurement} />
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!name.trim()) throw Error("Укажите название эталона");
                await onSave(
                  {
                    id: id(),
                    createdAt: now(),
                    name: name.trim(),
                    measurement,
                    photoIds: selection ? [selection.photo.id] : [],
                  },
                  selection ? [selection.photo] : [],
                );
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить эталон заказа
          </button>
        </section>
      )}
    </section>
  );
}
function NewRunForm({
  order,
  inks,
  previous,
  onStart,
  onClose,
  onError,
}: {
  order: Order;
  inks: Ink[];
  previous?: Batch;
  onStart: (input: {
    runDate: string;
    shift: string;
    components: Component[];
    comment: string;
  }) => Promise<void>;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [runDate, setRunDate] = useState(localDate),
    [shift, setShift] = useState(""),
    [components, setComponents] = useState<Component[]>([
      { inkId: inks[0]?.id || "", grams: "" },
    ]),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="card">
      <h3>Новый запуск заказа «{order.name}»</h3>
      <div className="form-grid">
        <Field label="Дата запуска">
          <input
            type="date"
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
          />
        </Field>
        <Field label="Смена">
          <input
            placeholder="Например, дневная / Иванов"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
          />
        </Field>
      </div>
      <h4>Краска на начало смены</h4>
      <p>
        Укажите фактические компоненты и массы. Если краску корректировали на
        другом заказе, её прежний состав здесь не подходит.
      </p>
      <ComponentsEditor
        value={components}
        onChange={setComponents}
        inks={inks}
      />
      {previous && (
        <button
          className="subtle"
          onClick={() => {
            setComponents(composition(previous));
            setComment(
              "Состав взят из предыдущего запуска этого заказа. Проверить фактические массы перед началом.",
            );
          }}
        >
          Подставить состав прошлого запуска этого заказа
        </button>
      )}
      <Field label="Комментарий к запуску">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>
      <div className="actions">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onStart({ runDate, shift, components, comment });
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Начать запуск
        </button>
        <button className="subtle" onClick={onClose}>
          Отмена
        </button>
      </div>
    </section>
  );
}
function RunWorkspace({
  order,
  run,
  ...props
}: Props & { order: Order; run: Batch }) {
  const [tab, setTab] = useState<"sample" | "mixture">("sample");
  const reference = order.references.find((r) => r.id === run.referenceId);
  return (
    <>
      <a href={`#orders/${order.id}`} className="back-link">
        <ArrowLeft size={17} />
        Заказ и вся история
      </a>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {order.code || "ЗАКАЗ"} · {order.pantone}
          </div>
          <h1>{order.name}</h1>
          <p>
            {run.runDate} · {run.shift} ·{" "}
            {run.status === "ACTIVE" ? "В работе" : "Завершён"}
          </p>
        </div>
        <span className="tag">
          Эталон v
          {order.references.findIndex((r) => r.id === run.referenceId) + 1 ||
            "—"}
        </span>
      </div>
      <div className="run-context">
        <span>
          <b>{total(composition(run))} г</b> в смеси
        </span>
        <span>{run.samples.length} проб</span>
        <span>{run.additions.length} добавок</span>
      </div>
      <div className="segmented">
        <button
          className={tab === "sample" ? "active" : ""}
          onClick={() => setTab("sample")}
        >
          <ScanLine size={17} />
          Новая проба
        </button>
        <button
          className={tab === "mixture" ? "active" : ""}
          onClick={() => setTab("mixture")}
        >
          <History size={17} />
          Состав и история смены
        </button>
      </div>
      {tab === "sample" ? (
        run.status === "ACTIVE" ? (
          <Compare
            key={`${run.id}:${run.referenceId || ""}`}
            batches={[run]}
            inks={props.inks}
            settings={props.settings}
            onChange={props.onChange}
            onError={props.onError}
            onSuccess={props.onSuccess}
            fixedBatchId={run.id}
            reference={reference}
            embedded
          />
        ) : (
          <section className="card">
            <p>
              Запуск завершён. Его пробы и добавки доступны в истории смены.
            </p>
            <button onClick={() => setTab("mixture")}>
              Открыть историю смены
            </button>
          </section>
        )
      ) : (
        <Batches
          batches={[run]}
          inks={props.inks}
          recipes={[]}
          experiments={props.experiments}
          onChange={props.onChange}
          onError={props.onError}
          fixedBatchId={run.id}
        />
      )}
    </>
  );
}
function RunHistory({ run, inks }: { run: Batch; inks: Ink[] }) {
  const events = [
    ...run.samples.map((value) => ({ kind: "sample" as const, value })),
    ...run.additions.map((value) => ({ kind: "addition" as const, value })),
  ].sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt));
  return (
    <>
      <h4>Исходная смесь</h4>
      <Composition value={run.initial} inks={inks} />
      <div className="timeline order-timeline">
        {events.map((e) => (
          <article key={e.value.id}>
            <small>{date(e.value.createdAt)}</small>
            {e.kind === "addition" ? (
              <>
                <h4>
                  Добавлено {e.value.component.grams} г ·{" "}
                  {inks.find((i) => i.id === e.value.component.inkId)?.name}
                </h4>
                <p>{e.value.comment}</p>
              </>
            ) : (
              <>
                <h4>
                  Проба · ΔE00{" "}
                  {difference(
                    e.value.target.lab,
                    e.value.current.lab,
                  ).de00.toFixed(2)}
                </h4>
                <MeasurementCard title="Оттиск" measurement={e.value.current} />
                <details>
                  <summary>Эталон, состав и фотографии пробы</summary>
                  <MeasurementCard
                    title="Эталон этой пробы"
                    measurement={e.value.target}
                  />
                  <Composition value={e.value.components} inks={inks} />
                  <SamplePhotos ids={e.value.photoIds} />
                </details>
                <p>{e.value.comment}</p>
              </>
            )}
          </article>
        ))}
      </div>
      {!events.length && (
        <p className="hint">Проб и добавок в этом запуске ещё нет.</p>
      )}
    </>
  );
}
