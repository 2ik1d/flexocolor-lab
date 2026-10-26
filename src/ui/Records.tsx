import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Beaker, Check, Copy } from "lucide-react";
import { db, addInk } from "../storage/db";
import {
  id,
  now,
  type Batch,
  type Ink,
  type Recipe,
  type Component,
  type Experiment,
  recipeSchema,
  batchSchema,
  inkSchema,
} from "../domain/types";
import { composition, total, normalize, scale } from "../domain/mixture";
import { difference } from "../color/color";
import { ComponentsEditor, Composition, Field, Notice, date } from "./common";
import { MeasurementCard } from "./Compare";
interface Shared {
  inks: Ink[];
  onChange: () => void;
  onError: (s: string) => void;
}
export function Batches({
  batches,
  recipes,
  experiments,
  fixedBatchId,
  ...props
}: Shared & {
  batches: Batch[];
  recipes: Recipe[];
  experiments: Experiment[];
  fixedBatchId?: string;
}) {
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState(fixedBatchId || ""),
    [name, setName] = useState(""),
    [pantone, setPantone] = useState(""),
    [comment, setComment] = useState(""),
    [components, setComponents] = useState<Component[]>([
      { inkId: props.inks[0]?.id || "", grams: "1000" },
    ]),
    [addId, setAddId] = useState(props.inks[0]?.id || ""),
    [grams, setGrams] = useState(""),
    [addComment, setAddComment] = useState("");
  const batch = batches.find((b) => b.id === selected);
  async function create() {
    try {
      const initial = normalize(components);
      if (Number(total(initial)) <= 0)
        throw Error("Введите положительную массу");
      const b = batchSchema.parse({
        id: id(),
        name,
        pantone,
        createdAt: now(),
        initial,
        additions: [],
        samples: [],
        comment,
        status: "ACTIVE",
      });
      await db.batches.add(b);
      setCreating(false);
      setSelected(b.id);
      props.onChange();
    } catch (e) {
      props.onError((e as Error).message);
    }
  }
  if (batch) {
    const cs = composition(batch);
    const timeline = [
      ...batch.additions.map((a) => ({
        kind: "addition" as const,
        date: a.createdAt,
        value: a,
      })),
      ...batch.samples.map((s) => ({
        kind: "sample" as const,
        date: s.createdAt,
        value: s,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <>
        {!fixedBatchId && (
          <button className="subtle" onClick={() => setSelected("")}>
            <ArrowLeft size={17} />
            Все партии
          </button>
        )}
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              ПАРТИЯ · {batch.status === "ACTIVE" ? "В РАБОТЕ" : "ЗАВЕРШЕНА"}
            </div>
            {fixedBatchId ? (
              <h3>Состав и история смены</h3>
            ) : (
              <h1>{batch.name}</h1>
            )}
            <p>
              {batch.pantone} · {date(batch.createdAt)}
            </p>
          </div>
          <button
            className="secondary"
            onClick={async () => {
              await db.batches.update(batch.id, {
                status: batch.status === "ACTIVE" ? "DONE" : "ACTIVE",
              });
              props.onChange();
            }}
          >
            <Check size={17} />
            {batch.status === "ACTIVE" ? "Завершить" : "Возобновить"}
          </button>
        </div>
        <div className="work-grid">
          <div className="stack">
            <section className="card">
              <h3>Текущий состав</h3>
              <Composition value={cs} inks={props.inks} />
              <p className="hint">
                Исходная масса: {total(batch.initial)} г · добавок:{" "}
                {batch.additions.length}
              </p>
              {batch.comment && <p>{batch.comment}</p>}
            </section>
            {batch.status === "ACTIVE" && (
              <section className="card">
                <h3>Внести ручную добавку</h3>
                <Notice>
                  Добавляйте только фактически внесённую краску. Это запись
                  операции, а не рекомендация модели.
                </Notice>
                <Field label="Базовая краска">
                  <select
                    value={addId}
                    onChange={(e) => setAddId(e.target.value)}
                  >
                    {props.inks.map((i) => (
                      <option value={i.id} key={i.id}>
                        {i.name} / {i.manufacturer} {i.lot}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Масса добавки, г">
                  <input
                    aria-label="Масса добавки, г"
                    inputMode="decimal"
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                  />
                </Field>
                <Field label="Комментарий">
                  <input
                    value={addComment}
                    onChange={(e) => setAddComment(e.target.value)}
                  />
                </Field>
                <button
                  onClick={async () => {
                    try {
                      await addInk(batch.id, addId, grams, addComment);
                      setGrams("");
                      setAddComment("");
                      props.onChange();
                    } catch (e) {
                      props.onError((e as Error).message);
                    }
                  }}
                >
                  <Plus size={18} />
                  Зафиксировать добавку
                </button>
              </section>
            )}
            <details className="card">
              <summary>Исходная смесь</summary>
              <Composition value={batch.initial} inks={props.inks} />
            </details>
          </div>
          <section className="card">
            <h3>Ход приладки</h3>
            {!timeline.length && (
              <p className="hint">
                Проб пока нет. Выполните сравнение в разделе «Быстрая приладка».
              </p>
            )}
            <div className="timeline">
              {timeline.map((t) => (
                <article key={t.value.id}>
                  <small>{date(t.date)}</small>
                  {t.kind === "addition" ? (
                    <>
                      <h4>
                        + {t.value.component.grams} г ·{" "}
                        {
                          props.inks.find(
                            (i) => i.id === t.value.component.inkId,
                          )?.name
                        }
                      </h4>
                      <p>{t.value.comment}</p>
                    </>
                  ) : (
                    <>
                      <h4>
                        Проба · ΔE00{" "}
                        {difference(
                          t.value.target.lab,
                          t.value.current.lab,
                        ).de00.toFixed(2)}
                      </h4>
                      <MeasurementCard
                        title="Оттиск"
                        measurement={t.value.current}
                      />
                      <p>{t.value.comment}</p>
                      <details>
                        <summary>Состав и фотографии пробы</summary>
                        <Composition
                          value={t.value.components}
                          inks={props.inks}
                        />
                        <SamplePhotos ids={t.value.photoIds} />
                      </details>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
        <details className="card">
          <summary>Данные для будущей модели</summary>
          <Notice>
            Данные группируются по условиям, профилю и источнику. Автоматическое
            обучение и выдача добавок пока отключены.
          </Notice>
          {experiments
            .filter((e) => e.batchId === batch.id)
            .map((e) => (
              <div className="experiment" key={e.id}>
                <span>
                  {date(e.afterMeasurement.createdAt)} · добавок{" "}
                  {e.additions.length}
                  <small>
                    {e.qualityWarnings.join(" · ") ||
                      "Формальные проверки пройдены; модель не валидирована"}
                  </small>
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={e.excluded}
                    onChange={async (ev) => {
                      await db.experiments.update(e.id, {
                        excluded: ev.target.checked,
                      });
                      props.onChange();
                    }}
                  />{" "}
                  Исключить из обучения
                </label>
              </div>
            ))}
        </details>
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ПРОИЗВОДСТВЕННЫЙ ЖУРНАЛ</div>
          <h1>История замесов</h1>
          <p>Исходная смесь → проба → добавка → новая проба.</p>
        </div>
        <button onClick={() => setCreating(!creating)}>
          <Plus size={18} />
          Новая партия
        </button>
      </div>
      {creating && (
        <section className="card">
          <h3>Создать партию</h3>
          <div className="form-grid">
            <Field label="Название партии">
              <input
                aria-label="Название партии"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Тираж / заказ"
              />
            </Field>
            <Field label="Номер Pantone">
              <input
                aria-label="Номер Pantone"
                value={pantone}
                onChange={(e) => setPantone(e.target.value)}
                placeholder="Например, 185 C"
              />
            </Field>
          </div>
          <Field label="Взять состав из рецептуры">
            <select
              defaultValue=""
              onChange={(e) => {
                const r = recipes.find((r) => r.id === e.target.value);
                if (r) {
                  setComponents(r.components);
                  setPantone(r.pantone);
                }
              }}
            >
              <option value="">Ручной ввод</option>
              {recipes.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.name} · v{r.version}
                </option>
              ))}
            </select>
          </Field>
          <ComponentsEditor
            value={components}
            onChange={setComponents}
            inks={props.inks}
          />
          <Field label="Комментарий к партии">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <button onClick={() => void create()}>Создать партию</button>
        </section>
      )}
      <div className="record-grid">
        {batches.map((b) => (
          <button
            className="record card"
            key={b.id}
            onClick={() => setSelected(b.id)}
          >
            <div className="card-heading">
              <Beaker size={23} />
              <span className="tag">
                {b.status === "ACTIVE" ? "В работе" : "Завершена"}
              </span>
            </div>
            <h3>{b.name}</h3>
            <p>{b.pantone || "Pantone не указан"}</p>
            <div className="record-meta">
              <strong>{total(composition(b))} г</strong>
              <span>
                {b.samples.length} проб · {b.additions.length} добавок
              </span>
            </div>
            <small>{date(b.createdAt)}</small>
          </button>
        ))}
      </div>
      {!batches.length && !creating && (
        <section className="card empty-state">
          <Beaker size={40} />
          <h3>Начните с исходной смеси</h3>
          <p>
            Укажите фактический состав и массу. Все следующие пробы и добавки
            сохранятся в этой партии.
          </p>
          <button onClick={() => setCreating(true)}>
            Создать первую партию
          </button>
        </section>
      )}
    </>
  );
}
export function SamplePhotos({
  ids,
  autoLoad = false,
}: {
  ids: string[];
  autoLoad?: boolean;
}) {
  const [urls, setUrls] = useState<string[]>();
  const key = ids.join("|");
  useEffect(() => {
    let active = true;
    setUrls(undefined);
    if (autoLoad)
      void db.photos
        .bulkGet(ids)
        .then((photos) => {
          if (active) setUrls(photos.flatMap((p) => (p ? [p.dataUrl] : [])));
        })
        .catch(() => {
          if (active) setUrls([]);
        });
    return () => {
      active = false;
    };
  }, [autoLoad, key]);
  return (
    <div>
      {urls ? (
        urls.map((url, i) => (
          <img
            key={i}
            className="saved-photo"
            src={url}
            alt={`Фото пробы ${i + 1}`}
          />
        ))
      ) : (
        <button
          className="subtle"
          onClick={async () =>
            setUrls(
              (await db.photos.bulkGet(ids)).flatMap((p) =>
                p ? [p.dataUrl] : [],
              ),
            )
          }
        >
          Показать фотографии ({ids.length})
        </button>
      )}
    </div>
  );
}
export function Recipes({ recipes, ...props }: Shared & { recipes: Recipe[] }) {
  const [editing, setEditing] = useState<Recipe | null>(),
    [name, setName] = useState(""),
    [pantone, setPantone] = useState(""),
    [source, setSource] = useState<Recipe["source"]>("OWN"),
    [sourceNote, setSourceNote] = useState(""),
    [cs, setCs] = useState<Component[]>([]),
    [target, setTarget] = useState("1000");
  function open(r: Recipe | null) {
    setEditing(r);
    setName(r?.name || "");
    setPantone(r?.pantone || "");
    setSource(r?.source || "OWN");
    setSourceNote(r?.sourceNote || "");
    setCs(r?.components || [{ inkId: props.inks[0]?.id || "", grams: "1000" }]);
  }
  async function save(newVersion: boolean) {
    try {
      const components = normalize(cs);
      if (!Number(total(components))) throw Error("Введите состав");
      if (source !== "OWN" && !sourceNote.trim())
        throw Error("Укажите проверяемый источник рецептуры");
      const familyId = editing?.familyId || id();
      const r = recipeSchema.parse({
        id: !newVersion && editing ? editing.id : id(),
        familyId,
        version: editing
          ? newVersion
            ? Math.max(
                ...recipes
                  .filter((r) => r.familyId === familyId)
                  .map((r) => r.version),
              ) + 1
            : editing.version
          : 1,
        name,
        pantone,
        source,
        sourceNote,
        components,
        createdAt: now(),
      });
      await db.recipes.put(r);
      setEditing(undefined);
      props.onChange();
    } catch (e) {
      props.onError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">БИБЛИОТЕКА СОСТАВОВ</div>
          <h1>Рецептуры</h1>
          <p>Проверяемый источник и отдельные версии каждого состава.</p>
        </div>
        <button onClick={() => open(null)}>
          <Plus size={18} />
          Новая рецептура
        </button>
      </div>
      {editing !== undefined && (
        <section className="card">
          <h3>{editing ? "Редактирование рецептуры" : "Новая рецептура"}</h3>
          <div className="form-grid">
            <Field label="Название рецептуры">
              <input
                aria-label="Название рецептуры"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Pantone">
              <input
                value={pantone}
                onChange={(e) => setPantone(e.target.value)}
              />
            </Field>
            <Field label="Тип источника">
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as Recipe["source"])}
              >
                <option value="OWN">Собственная производственная</option>
                <option value="SUPPLIER">Рецептура поставщика</option>
                <option value="PANTONE">Официальная Pantone</option>
              </select>
            </Field>
            <Field label="Источник / документ / примечание">
              <input
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
              />
            </Field>
          </div>
          <ComponentsEditor value={cs} onChange={setCs} inks={props.inks} />
          <SafeComposition cs={cs} inks={props.inks} />
          <div className="actions">
            <Field label="Масштабировать до, г">
              <input
                aria-label="Масштабировать до, г"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
            <button
              className="secondary"
              onClick={() => {
                try {
                  setCs(scale(cs, target));
                } catch (e) {
                  props.onError((e as Error).message);
                }
              }}
            >
              Пересчитать
            </button>
          </div>
          <div className="actions">
            <button onClick={() => void save(false)}>
              Сохранить рецептуру
            </button>
            {editing && (
              <button className="secondary" onClick={() => void save(true)}>
                <Copy size={17} />
                Сохранить новой версией
              </button>
            )}
            <button className="subtle" onClick={() => setEditing(undefined)}>
              Закрыть
            </button>
          </div>
        </section>
      )}
      <div className="record-grid">
        {recipes.map((r) => (
          <button className="record card" onClick={() => open(r)} key={r.id}>
            <div className="card-heading">
              <span className="tag">v{r.version}</span>
              <small>
                {r.source === "OWN"
                  ? "Собственная"
                  : r.source === "SUPPLIER"
                    ? "Поставщик"
                    : "Pantone"}
              </small>
            </div>
            <h3>{r.name}</h3>
            <p>{r.pantone}</p>
            <Composition value={r.components} inks={props.inks} />
            <small>
              {r.sourceNote ||
                "Источник: собственная производственная рецептура"}
            </small>
          </button>
        ))}
      </div>
      {!recipes.length && (
        <Notice>
          Рецептур пока нет. Непроверенные формулы Pantone в базу не включены.
        </Notice>
      )}
    </>
  );
}
function SafeComposition({ cs, inks }: { cs: Component[]; inks: Ink[] }) {
  try {
    return <Composition value={normalize(cs)} inks={inks} />;
  } catch {
    return <p className="hint">Введите массы до 3 знаков после запятой.</p>;
  }
}
export function Inks(props: Shared) {
  const [editing, setEditing] = useState<Ink>();
  const [search, setSearch] = useState("");
  function open(ink?: Ink) {
    setEditing(
      ink || {
        id: id(),
        manufacturer: "Double V",
        name: "",
        code: "",
        type: "УФ-флексо",
        group: "",
        lot: "",
        createdAt: now(),
        notes: "",
        calibration: [],
      },
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">МАТЕРИАЛЫ</div>
          <h1>База красок</h1>
          <p>
            Названия баз без выдуманных координат и характеристик смешивания.
          </p>
        </div>
        <button onClick={() => open()}>
          <Plus size={18} />
          Добавить краску
        </button>
      </div>
      <input
        className="search"
        aria-label="Поиск красок"
        placeholder="Поиск по названию, производителю, партии…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {editing && (
        <section className="card">
          <h3>Карточка краски</h3>
          <div className="form-grid">
            {(
              [
                "manufacturer",
                "name",
                "code",
                "type",
                "group",
                "lot",
                "notes",
              ] as const
            ).map((k, i) => (
              <Field
                key={k}
                label={
                  [
                    "Производитель",
                    "Название краски",
                    "Код",
                    "Тип",
                    "Цветовая группа",
                    "Партия",
                    "Примечания",
                  ][i]
                }
              >
                <input
                  aria-label={k === "name" ? "Название краски" : undefined}
                  value={editing[k]}
                  onChange={(e) =>
                    setEditing({ ...editing, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
          </div>
          <p className="hint">
            Дата добавления: {date(editing.createdAt)}. Калибровочных записей:{" "}
            {editing.calibration.length}.
          </p>
          <div className="actions">
            <button
              onClick={async () => {
                try {
                  await db.inks.put(inkSchema.parse(editing));
                  setEditing(undefined);
                  props.onChange();
                } catch (e) {
                  props.onError((e as Error).message);
                }
              }}
            >
              Сохранить краску
            </button>
            <button className="subtle" onClick={() => setEditing(undefined)}>
              Закрыть
            </button>
          </div>
        </section>
      )}
      <div className="record-grid">
        {props.inks
          .filter((i) =>
            `${i.name} ${i.manufacturer} ${i.lot}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((i) => (
            <button
              className="record card ink-record"
              key={i.id}
              onClick={() => open(i)}
            >
              <div className="eyebrow">{i.manufacturer}</div>
              <h3>{i.name}</h3>
              <p>
                {i.type}
                {i.lot ? ` · партия ${i.lot}` : ""}
              </p>
              <small>
                {i.code || "Код не указан"} · калибровка{" "}
                {i.calibration.length ? "есть" : "не выполнена"}
              </small>
            </button>
          ))}
      </div>
    </>
  );
}
