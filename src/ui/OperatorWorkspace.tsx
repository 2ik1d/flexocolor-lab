import { useState } from "react";
import type { OrderProps } from "./Orders";
import { OrderForm } from "./Orders";
import {
  type Order,
  type Component,
  type Measurement,
  type Photo,
  type OrderColor,
  id,
  now,
} from "../domain/types";
import {
  db,
  saveOrder,
  saveColorReference,
  useColorReference,
  ensureWorkingBatch,
  setColorComposition,
  addOrderComponents,
  saveSample,
  acceptOrderColor,
  finishOrder,
  setOrderStatus,
  saveSampleRecipe,
} from "../storage/db";
import { composition, total } from "../domain/mixture";
import { progress } from "../domain/progress";
import { fanMap } from "../domain/fan";
import { pantoneKey } from "../domain/pantones";
import { ReferenceEditor } from "./ReferenceEditor";
import { PhotoEditor, type PhotoSelection } from "./PhotoEditor";
import { MeasurementCard, SpectroInput } from "./Compare";
import { ProgressReport } from "./ProgressReport";
import {
  ComponentsEditor,
  Composition,
  ConditionsEditor,
  Field,
  date,
} from "./common";
import { OrderHistory } from "./OrderHistory";
import { ColorKnowledge } from "./ColorKnowledge";
import { SamplePhotos } from "./Records";
type Step = "reference" | "rollout" | "analysis" | "additions";
type Draft = {
  measurement?: Measurement;
  photo?: Photo;
  comment?: string;
  savedId?: string;
};
export function OperatorWorkspace({
  order,
  initialColorId,
  onRepeat,
  ...props
}: OrderProps & {
  order: Order;
  initialColorId?: string;
  onRepeat: () => Promise<void>;
}) {
  const own = props.batches.filter((b) => b.orderId === order.id);
  const [selected, setSelected] = useState(
      initialColorId || order.colors[0]?.id,
    ),
    [stage, setStage] = useState<1 | 2>(
      own.some((b) => b.additions.length) ? 2 : 1,
    ),
    [step, setStep] = useState<Step>(
      order.colors.find(
        (c) => c.id === initialColorId || c.id === order.colors[0]?.id,
      )?.currentReferenceId
        ? "rollout"
        : "reference",
    ),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [journal, setJournal] = useState(false),
    [replace, setReplace] = useState(false),
    [mode, setMode] = useState<"photo" | "lab">("photo"),
    [conditions, setConditions] = useState(props.settings.conditions),
    [referenceChoice, setReferenceChoice] = useState(""),
    [initial, setInitial] = useState<Component[]>(),
    [rows, setRows] = useState<
      {
        id: string;
        colorId: string;
        components: Component[];
        comment: string;
      }[]
    >([
      {
        id: id(),
        colorId: selected || "",
        components: [{ inkId: props.inks[0]?.id || "", grams: "" }],
        comment: "",
      },
    ]);
  const color = order.colors.find((c) => c.id === selected) || order.colors[0],
    closed = order.status === "DONE",
    draft = drafts[color.id] || {};
  const reference = color.references.find(
    (r) => r.id === color.currentReferenceId,
  );
  const colorBatches = own
    .filter((b) => b.colorId === color.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = colorBatches.find(
    (b) => b.status === "ACTIVE" && b.referenceId === color.currentReferenceId,
  );
  const latest = active?.samples.at(-1),
    previous = draft.measurement
      ? active?.samples.filter((s) => s.id !== draft.savedId).at(-1)
      : active?.samples.at(-2);
  const current = draft.measurement || latest?.current;
  const pending =
    active?.additions.filter((a) => !latest?.additionIds?.includes(a.id)) || [];
  const changes =
    active?.additions.filter(
      (a) =>
        ((draft.measurement && !draft.savedId) ||
          latest?.additionIds?.includes(a.id)) &&
        !previous?.additionIds?.includes(a.id),
    ) || [];
  const choices = [
    ...new Map(
      [
        ...(props.pantones.find((p) => p.id === pantoneKey(color.pantone))
          ?.references || []),
        ...color.references,
      ]
        .filter(
          (r) =>
            !r.pantone || pantoneKey(r.pantone) === pantoneKey(color.pantone),
        )
        .map((r) => [r.id, r]),
    ).values(),
  ];
  function patch(values: Partial<Draft>, colorId = color.id) {
    setDrafts((all) => ({ ...all, [colorId]: { ...all[colorId], ...values } }));
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
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
  async function persist() {
    if (draft.savedId) return draft.savedId;
    if (!draft.measurement) {
      if (latest && !pending.length) return latest.id;
      throw Error("Загрузите и сравните новую выкатку");
    }
    if (!reference) throw Error("Нет эталона");
    const batch = await ensureWorkingBatch(order.id, color.id),
      sampleId = id();
    await saveSample(
      batch.id,
      {
        id: sampleId,
        createdAt: now(),
        referenceId: reference.id,
        target: reference.measurement,
        current: draft.measurement,
        photoIds: [
          ...new Set([
            ...reference.photoIds,
            ...(draft.photo ? [draft.photo.id] : []),
          ]),
        ],
        components: composition(batch),
        comment: draft.comment?.trim() || "",
      },
      draft.photo ? [draft.photo] : [],
    );
    patch({ savedId: sampleId });
    return sampleId;
  }
  function select(c: OrderColor) {
    setSelected(c.id);
    setReplace(false);
    setReferenceChoice("");
    setInitial(c.startingComponents || []);
    const working = own.find(
      (b) =>
        b.colorId === c.id &&
        b.status === "ACTIVE" &&
        b.referenceId === c.currentReferenceId,
    );
    setStep(
      !c.currentReferenceId
        ? "reference"
        : working?.samples.length
          ? "analysis"
          : "rollout",
    );
    setConditions(
      c.references.find((r) => r.id === c.currentReferenceId)?.measurement
        .conditions || props.settings.conditions,
    );
  }
  function analyze(selection: PhotoSelection) {
    patch({
      measurement: {
        ...selection.measurement,
        profileId: props.settings.profileId || undefined,
        conditions: {
          ...props.settings.conditions,
          whitePoint: "D50",
          observer: "2",
        },
      },
      photo: selection.photo,
      comment: "",
      savedId: undefined,
    });
    setStep("analysis");
  }
  if (editing)
    return (
      <OrderForm
        {...props}
        order={order}
        onClose={() => setEditing(false)}
        onSave={async (values) => {
          await saveOrder(values);
          props.onChange();
          setEditing(false);
        }}
      />
    );
  const timeline = own
    .flatMap((batch) => [
      ...batch.samples.map((sample) => ({
        id: sample.id,
        createdAt: sample.createdAt,
        colorId: batch.colorId,
        label: `Выкатка · ΔE00 ${progress(sample.target, sample.current).toTarget?.de00.toFixed(2) || "—"}`,
      })),
      ...batch.additions
        .filter(
          (a, index, list) =>
            !a.operationId ||
            list.findIndex((v) => v.operationId === a.operationId) === index,
        )
        .map((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          colorId: batch.colorId,
          label: `Добавка · ${
            a.operationId
              ? batch.additions
                  .filter((v) => v.operationId === a.operationId)
                  .map(
                    (v) =>
                      `${props.inks.find((i) => i.id === v.component.inkId)?.name || v.component.inkId} ${v.component.grams} г`,
                  )
                  .join(" + ")
              : `${a.component.grams} г`
          }`,
        })),
    ])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <a className="back-link" href="#orders">
        ← Заказы
      </a>
      <div className="page-heading operator-heading">
        <div>
          <div className="eyebrow">
            {closed ? "ЗАКАЗ ЗАВЕРШЁН" : "РАБОЧЕЕ МЕСТО ОПЕРАТОРА"}
          </div>
          <h1>
            № {order.code || "Без номера"} <span>{order.name}</span>
          </h1>
          <p>
            {order.customer}
            {order.repeatOf ? " · Повтор: исходные краски без добавок" : ""}
          </p>
        </div>
        <div className="actions">
          {!closed && (
            <button className="subtle" onClick={() => setEditing(true)}>
              Информация о заказе
            </button>
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void perform(onRepeat)}
          >
            Повтор
          </button>
          <button className="secondary" onClick={() => setJournal(!journal)}>
            Весь журнал и примечания
          </button>
        </div>
      </div>
      {order.repeatOf && (
        <p className="hint">
          <a href={`#orders/${order.repeatOf}`}>История исходного заказа</a> ·
          эталоны и исходные составы перенесены, добавки сброшены.
        </p>
      )}
      {journal ? (
        <>
          <button className="subtle" onClick={() => setJournal(false)}>
            ← Вернуться к подбору
          </button>
          <OrderHistory
            order={order}
            batches={own}
            inks={props.inks}
            onChange={props.onChange}
            onError={props.onError}
          />
        </>
      ) : (
        <div className="operator-layout">
          <div className="operator-main">
            <nav className="operator-colors" aria-label="Pantone заказа">
              {order.colors.map((c) => {
                const catalog = fanMap.get(pantoneKey(c.pantone))?.catalog;
                return (
                  <button
                    key={c.id}
                    className={c.id === color.id ? "active" : ""}
                    onClick={() => select(c)}
                  >
                    <i style={{ background: catalog?.hex || "#33404b" }} />
                    <span>
                      {c.pantone}
                      <small>
                        {c.acceptedSampleId
                          ? "Подтверждён"
                          : c.currentReferenceId
                            ? "Эталон есть"
                            : "Нужен эталон"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>
            {closed ? (
              <section className="card approval-card">
                <h2>Заказ подтверждён и завершён</h2>
                <p>Все выкатки, добавки, дельты и примечания сохранены.</p>
                <button onClick={() => setJournal(true)}>
                  Посмотреть историю
                </button>
                <button
                  className="subtle"
                  onClick={() =>
                    void perform(async () => {
                      await setOrderStatus(order.id, "ACTIVE");
                    })
                  }
                >
                  Вернуть в работу
                </button>
              </section>
            ) : (
              <>
                <div className="operator-stage-tabs" aria-label="Этап подбора">
                  <button
                    className={stage === 1 ? "active" : ""}
                    onClick={() => {
                      setStage(1);
                      setStep(reference ? "analysis" : "reference");
                    }}
                  >
                    <b>01</b>
                    <span>
                      Первый подбор<small>Эталон → выкатка → анализ</small>
                    </span>
                  </button>
                  <button
                    className={stage === 2 ? "active" : ""}
                    disabled={
                      busy ||
                      (!draft.measurement &&
                        !own.some((batch) => batch.samples.length))
                    }
                    onClick={() =>
                      void perform(async () => {
                        if (draft.measurement && !draft.savedId)
                          await persist();
                        setStage(2);
                        setStep("additions");
                      })
                    }
                  >
                    <b>02</b>
                    <span>
                      Добавки и доводка
                      <small>Добавил → выкатал → сравнил</small>
                    </span>
                  </button>
                </div>
                <div
                  className="operator-step-tabs"
                  role="tablist"
                  aria-label="Шаг подбора"
                >
                  {(stage === 1
                    ? [
                        ["reference", "Эталон"],
                        ["rollout", "Выкатка"],
                        ["analysis", "Анализ"],
                      ]
                    : [
                        ["additions", "Добавки"],
                        ["rollout", "Новая выкатка"],
                        ["analysis", "Анализ"],
                      ]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      role="tab"
                      aria-selected={step === value}
                      className={step === value ? "active" : ""}
                      onClick={() => setStep(value as Step)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <fieldset className="operator-controls" disabled={busy}>
                  {step === "reference" && (
                    <>
                      <section className="card">
                        <div className="card-heading">
                          <div>
                            <div className="eyebrow">ФИЗИЧЕСКИЙ ЭТАЛОН</div>
                            <h2>{color.pantone}</h2>
                          </div>
                          <span className="tag">
                            {reference ? "Сохранён" : "Новый заказ"}
                          </span>
                        </div>
                        {reference && !replace ? (
                          <>
                            <MeasurementCard
                              title={reference.name}
                              measurement={reference.measurement}
                            />
                            <SamplePhotos ids={reference.photoIds} autoLoad />
                            <div className="actions">
                              <button onClick={() => setStep("rollout")}>
                                Дальше: загрузить выкатку
                              </button>
                              <button
                                className="secondary"
                                onClick={() => setReplace(true)}
                              >
                                Новый эталон
                              </button>
                            </div>
                          </>
                        ) : (
                          <p>
                            Сфотографируйте образец заказчика, выделите ровный
                            участок и сохраните. Этот оригинал остаётся эталоном
                            всего цикла.
                          </p>
                        )}
                        {choices.length > 0 && (
                          <details>
                            <summary>Сохранённые эталоны этого Pantone</summary>
                            <Field label="Сохранённый эталон">
                              <select
                                value={referenceChoice}
                                onChange={(e) =>
                                  setReferenceChoice(e.target.value)
                                }
                              >
                                <option value="">Выберите из истории</option>
                                {choices.map((r) => (
                                  <option value={r.id} key={r.id}>
                                    {r.name} · {date(r.createdAt)}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <button
                              disabled={!referenceChoice}
                              onClick={() =>
                                void perform(async () => {
                                  await useColorReference(
                                    order.id,
                                    color.id,
                                    referenceChoice,
                                  );
                                  patch({
                                    measurement: undefined,
                                    photo: undefined,
                                    savedId: undefined,
                                  });
                                  setStep("rollout");
                                })
                              }
                            >
                              Использовать сохранённый эталон
                            </button>
                          </details>
                        )}
                      </section>
                      {(!reference || replace) && (
                        <ReferenceEditor
                          key={color.id}
                          settings={props.settings}
                          onClose={() => setReplace(false)}
                          onError={props.onError}
                          onSave={async (r, photos) => {
                            await saveColorReference(
                              order.id,
                              color.id,
                              r,
                              photos,
                            );
                            patch({
                              measurement: undefined,
                              photo: undefined,
                              savedId: undefined,
                            });
                            setReplace(false);
                            setStep("rollout");
                            props.onChange();
                            props.onSuccess(
                              "Эталон сохранён. Сделайте первую выкатку.",
                            );
                          }}
                        />
                      )}
                    </>
                  )}
                  {step === "rollout" && (
                    <>
                      {!reference ? (
                        <section className="card">
                          <h2>Сначала нужен эталон</h2>
                          <button
                            onClick={() => {
                              setStage(1);
                              setStep("reference");
                            }}
                          >
                            Загрузить эталон
                          </button>
                        </section>
                      ) : (
                        <>
                          <section className="card rollout-intro">
                            <div className="eyebrow">
                              {latest ? "СЛЕДУЮЩАЯ ВЫКАТКА" : "ПЕРВАЯ ВЫКАТКА"}{" "}
                              · {color.pantone}
                            </div>
                            <h2>
                              {latest
                                ? "Выкатайте после добавок"
                                : "Выкатайте исходную краску"}
                            </h2>
                            <p>
                              {latest
                                ? "Прошлая выкатка подтянута. Сравним новую с ней и с исходным эталоном."
                                : "Загрузите оттиск — получите разницу с эталоном и направление коррекции."}
                            </p>
                            {latest && (
                              <div className="previous-rollout">
                                <MeasurementCard
                                  title="Прошлая выкатка — автоматически"
                                  measurement={latest.current}
                                />
                                <SamplePhotos
                                  ids={
                                    latest.current.captureId
                                      ? [latest.current.captureId]
                                      : []
                                  }
                                />
                              </div>
                            )}
                            <div className="segmented">
                              <button
                                className={mode === "photo" ? "active" : ""}
                                onClick={() => setMode("photo")}
                              >
                                Фото выкатки
                              </button>
                              <button
                                className={mode === "lab" ? "active" : ""}
                                onClick={() => setMode("lab")}
                              >
                                Lab / CSV прибора
                              </button>
                            </div>
                          </section>
                          {mode === "photo" ? (
                            <PhotoEditor
                              key={`${color.id}-${active?.additions.length}-${latest?.id || "first"}`}
                              compact
                              label="Выкатка"
                              onError={props.onError}
                              onAnalyze={analyze}
                              onInvalidate={() =>
                                patch({
                                  measurement: undefined,
                                  photo: undefined,
                                  savedId: undefined,
                                })
                              }
                            />
                          ) : (
                            <section className="card">
                              <ConditionsEditor
                                value={conditions}
                                onChange={(c) => {
                                  setConditions(c);
                                  patch({
                                    measurement: undefined,
                                    savedId: undefined,
                                  });
                                }}
                              />
                              <SpectroInput
                                title="Выкатка"
                                conditions={conditions}
                                onError={props.onError}
                                onInvalidate={() =>
                                  patch({
                                    measurement: undefined,
                                    savedId: undefined,
                                  })
                                }
                                onMeasurement={(measurement) => {
                                  patch({
                                    measurement,
                                    comment: "",
                                    photo: undefined,
                                    savedId: undefined,
                                  });
                                  setStep("analysis");
                                }}
                              />
                            </section>
                          )}
                          <details className="card">
                            <summary>
                              Что в исходной краске{" "}
                              {active?.compositionKnown !== false && active
                                ? `· ${total(composition(active))} г`
                                : "· состав пока неизвестен"}
                            </summary>
                            {active && (
                              <Composition
                                value={composition(active)}
                                inks={props.inks}
                                showPercent={active.compositionKnown !== false}
                                totalLabel={
                                  active.compositionKnown === false
                                    ? "Известные компоненты"
                                    : "Масса краски"
                                }
                              />
                            )}
                            <ComponentsEditor
                              value={initial ?? color.startingComponents ?? []}
                              onChange={setInitial}
                              inks={props.inks}
                            />
                            <button
                              className="secondary"
                              onClick={() =>
                                void perform(async () => {
                                  const components =
                                    initial ?? color.startingComponents ?? [];
                                  await setColorComposition(
                                    order.id,
                                    color.id,
                                    components,
                                  );
                                  const updated = (await db.orders.get(
                                    order.id,
                                  ))!;
                                  updated.colors.find(
                                    (c) => c.id === color.id,
                                  )!.startingComponents = components;
                                  await saveOrder(updated);
                                  patch({
                                    measurement: undefined,
                                    savedId: undefined,
                                  });
                                  props.onSuccess("Исходный состав сохранён");
                                })
                              }
                            >
                              Сохранить исходный состав
                            </button>
                          </details>
                        </>
                      )}
                    </>
                  )}
                  {step === "additions" && (
                    <section className="card multi-additions">
                      <div className="eyebrow">ЭТАП 02</div>
                      <h2>Что и в какой Pantone добавили</h2>
                      <p>
                        Одна запись может содержать добавки сразу к нескольким
                        цветам. После записи загрузите новые выкатки этих
                        цветов.
                      </p>
                      {rows.map((row, index) => (
                        <div className="addition-color-row" key={row.id}>
                          <Field label={`Куда добавили ${index + 1}`}>
                            <select
                              aria-label={`Куда добавили ${index + 1}`}
                              value={row.colorId}
                              onChange={(e) =>
                                setRows((all) =>
                                  all.map((v) =>
                                    v.id === row.id
                                      ? { ...v, colorId: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            >
                              {order.colors.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.pantone}
                                  {c.name ? ` · ${c.name}` : ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <ComponentsEditor
                            value={row.components}
                            inks={props.inks}
                            onChange={(components) =>
                              setRows((all) =>
                                all.map((v) =>
                                  v.id === row.id ? { ...v, components } : v,
                                ),
                              )
                            }
                          />
                          <Field label={`Примечание к добавкам ${index + 1}`}>
                            <input
                              value={row.comment}
                              onChange={(e) =>
                                setRows((all) =>
                                  all.map((v) =>
                                    v.id === row.id
                                      ? { ...v, comment: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </Field>
                          {rows.length > 1 && (
                            <button
                              className="subtle"
                              onClick={() =>
                                setRows((all) =>
                                  all.filter((v) => v.id !== row.id),
                                )
                              }
                            >
                              Убрать эту строку
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        className="secondary"
                        onClick={() =>
                          setRows([
                            ...rows,
                            {
                              id: id(),
                              colorId:
                                order.colors.find(
                                  (c) => !rows.some((r) => r.colorId === c.id),
                                )?.id || color.id,
                              components: [
                                { inkId: props.inks[0]?.id || "", grams: "" },
                              ],
                              comment: "",
                            },
                          ])
                        }
                      >
                        Ещё цвет для доводки
                      </button>
                      <div className="actions">
                        <button
                          onClick={() =>
                            void perform(async () => {
                              await addOrderComponents(order.id, rows);
                              for (const row of rows)
                                patch(
                                  {
                                    measurement: undefined,
                                    photo: undefined,
                                    savedId: undefined,
                                  },
                                  row.colorId,
                                );
                              setSelected(rows[0].colorId);
                              setRows([
                                {
                                  id: id(),
                                  colorId: rows[0].colorId,
                                  components: [
                                    {
                                      inkId: props.inks[0]?.id || "",
                                      grams: "",
                                    },
                                  ],
                                  comment: "",
                                },
                              ]);
                              setStep("rollout");
                              props.onSuccess(
                                "Добавки записаны. Загрузите новые выкатки выбранных цветов.",
                              );
                            })
                          }
                        >
                          Записать добавки и перейти к выкатке
                        </button>
                      </div>
                    </section>
                  )}
                  {step === "analysis" && (
                    <>
                      {reference && current ? (
                        <>
                          <div className="analysis-context">
                            <strong>
                              {color.pantone} ·{" "}
                              {draft.measurement && !draft.savedId
                                ? "Новая выкатка"
                                : "Сохранённая выкатка"}
                            </strong>
                            <span>
                              Оригинал: {reference.name}
                              {previous
                                ? " · Прошлая выкатка подтянута"
                                : " · Первый замер"}
                            </span>
                          </div>
                          {pending.length > 0 && !draft.measurement && (
                            <p className="notice">
                              После добавок нужна новая выкатка. Сейчас показан
                              результат до них.
                            </p>
                          )}
                          <ProgressReport
                            target={reference.measurement}
                            current={current}
                            previous={previous}
                            changes={changes}
                            inks={props.inks}
                            tolerance={
                              order.tolerance ||
                              props.settings.tolerance ||
                              undefined
                            }
                          />
                          <Field label="Что получилось / заметка">
                            <textarea
                              aria-label="Что получилось / заметка"
                              value={draft.comment || ""}
                              disabled={!!draft.savedId}
                              onChange={(e) =>
                                patch({ comment: e.target.value })
                              }
                              placeholder="Наблюдение, решение, особенности выкатки"
                            />
                          </Field>
                          <div className="card analysis-actions">
                            <h3>Следующее действие</h3>
                            <div className="actions">
                              <button
                                className="secondary"
                                disabled={
                                  (!draft.measurement && !latest) ||
                                  !!draft.savedId ||
                                  !!(!draft.measurement && pending.length)
                                }
                                onClick={() =>
                                  void perform(async () => {
                                    await persist();
                                    props.onSuccess(
                                      "Выкатка и дельты сохранены",
                                    );
                                  })
                                }
                              >
                                {draft.savedId
                                  ? "Выкатка сохранена"
                                  : "Сохранить выкатку"}
                              </button>
                              <button
                                onClick={() =>
                                  void perform(async () => {
                                    await persist();
                                    setStage(2);
                                    setStep("additions");
                                    setRows([
                                      {
                                        id: id(),
                                        colorId: color.id,
                                        components: [
                                          {
                                            inkId: props.inks[0]?.id || "",
                                            grams: "",
                                          },
                                        ],
                                        comment: "",
                                      },
                                    ]);
                                  })
                                }
                              >
                                Продолжить: добавить краску
                              </button>
                              <button
                                className="secondary"
                                onClick={() =>
                                  void perform(async () => {
                                    const sampleId = await persist();
                                    await acceptOrderColor(
                                      order.id,
                                      color.id,
                                      sampleId,
                                    );
                                    props.onSuccess(
                                      `${color.pantone}: результат подтверждён`,
                                    );
                                  })
                                }
                              >
                                Цвет устроил — подтвердить
                              </button>
                            </div>
                            {color.acceptedSampleId && (
                              <p className="accepted-label">
                                ✓ Результат {color.pantone} подтверждён
                              </p>
                            )}
                            {latest &&
                              active?.compositionKnown !== false &&
                              latest.components.length > 0 && (
                                <button
                                  className="subtle"
                                  onClick={() =>
                                    void perform(async () => {
                                      await saveSampleRecipe(
                                        active!.id,
                                        latest.id,
                                      );
                                      props.onSuccess(
                                        "Состав выкатки сохранён в рецептурах",
                                      );
                                    })
                                  }
                                >
                                  Сохранить состав результата в рецептуры
                                </button>
                              )}
                          </div>
                        </>
                      ) : (
                        <section className="card">
                          <h2>Загрузите выкатку для анализа</h2>
                          <p>
                            Покажем ΔE00, ΔE76, ΔL*, Δa*, Δb*, ΔC* и
                            рекомендации.
                          </p>
                          <button
                            onClick={() =>
                              setStep(reference ? "rollout" : "reference")
                            }
                          >
                            К {reference ? "выкатке" : "эталону"}
                          </button>
                        </section>
                      )}
                    </>
                  )}
                </fieldset>
                <section className="card order-finish">
                  <div>
                    <h3>
                      Подтверждено цветов:{" "}
                      {order.colors.filter((c) => c.acceptedSampleId).length} /{" "}
                      {order.colors.length}
                    </h3>
                    <p className="hint">
                      Подтвердите каждый цвет, затем завершите заказ.
                    </p>
                  </div>
                  <button
                    disabled={
                      busy || order.colors.some((c) => !c.acceptedSampleId)
                    }
                    onClick={() =>
                      void perform(async () => {
                        await finishOrder(order.id);
                        props.onSuccess("Заказ завершён и перенесён в историю");
                        location.hash = "orders";
                      })
                    }
                  >
                    Подтвердить и завершить заказ
                  </button>
                </section>
              </>
            )}
          </div>
          <aside className="operator-history">
            <section className="card">
              <h3>Заказ № {order.code}</h3>
              {order.notes && <p className="preserve-lines">{order.notes}</p>}
              <p className="hint">
                Допуск ΔE00:{" "}
                {order.tolerance || props.settings.tolerance || "не задан"}
              </p>
              <a href="#calibration">Калибровка и повторяемость</a>
            </section>
            <section className="card">
              <div className="card-heading">
                <h3>История рядом</h3>
                <span className="tag">{timeline.length}</span>
              </div>
              {!timeline.length && (
                <p className="hint">
                  Здесь появятся выкатки, дельты и внесённые добавки.
                </p>
              )}
              <div className="cycle-timeline">
                {timeline.slice(0, 12).map((event) => (
                  <button
                    className="history-event"
                    key={event.id}
                    onClick={() => {
                      const c = order.colors.find(
                        (v) => v.id === event.colorId,
                      );
                      if (c) select(c);
                      setJournal(true);
                    }}
                  >
                    <small>
                      {
                        order.colors.find((c) => c.id === event.colorId)
                          ?.pantone
                      }{" "}
                      · {date(event.createdAt)}
                    </small>
                    <span>{event.label}</span>
                  </button>
                ))}
              </div>
              <button className="subtle" onClick={() => setJournal(true)}>
                Вся история и примечания
              </button>
            </section>
            <details className="card">
              <summary>Веер, состав и предыдущие заказы</summary>
              <ColorKnowledge {...props} pantone={color.pantone} />
            </details>
          </aside>
        </div>
      )}
    </>
  );
}
