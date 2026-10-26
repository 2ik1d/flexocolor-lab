import { useState } from "react";
import { ArrowRight, FlaskConical, Save } from "lucide-react";
import type {
  Batch,
  Ink,
  Settings,
  Measurement,
  Photo,
  Conditions,
  OrderReference,
} from "../domain/types";
import { id, now, labSchema } from "../domain/types";
import { composition, total } from "../domain/mixture";
import { difference } from "../color/color";
import { ColorCorrectionEngine } from "../correction/engine";
import { saveSample } from "../storage/db";
import { parseMeasurements } from "../measurements/csv";
import { PhotoEditor, type PhotoSelection } from "./PhotoEditor";
import { Field, Notice, ConditionsEditor } from "./common";
const sourceNames = {
  PHOTO_UNCALIBRATED: "Оценка по фотографии",
  PHOTO_CALIBRATED: "Калиброванная фотооценка",
  SPECTRO_LAB: "Измерение спектрофотометром · Lab",
  SPECTRO_SPECTRAL: "Измерение спектрофотометром · спектр",
};
export function MeasurementCard({
  measurement,
  title,
}: {
  measurement: Measurement;
  title: string;
}) {
  const s = measurement.stats;
  return (
    <div className="measurement">
      <div className="eyebrow">{title}</div>
      <strong>{sourceNames[measurement.source]}</strong>
      <div className="lab-values">
        L* {measurement.lab.l.toFixed(2)}
        <span>a* {measurement.lab.a.toFixed(2)}</span>
        <span>b* {measurement.lab.b.toFixed(2)}</span>
      </div>
      {s && (
        <>
          <div className="swatch-line">
            <i style={{ background: `rgb(${s.median.join(",")})` }} />
            <small>
              Медиана RGB {s.median.map((v) => v.toFixed(0)).join(" / ")}
              <br />
              Среднее RGB {s.mean.map((v) => v.toFixed(1)).join(" / ")}
            </small>
          </div>
          <p className="hint">
            {s.pixels.toLocaleString("ru")} пикселей · исключено{" "}
            {(s.excluded * 100).toFixed(1)}% · разброс RGB {s.spread.toFixed(2)}
          </p>
          {s.heterogeneous && (
            <Notice>
              Неоднородная область. Выберите более равномерный участок или
              сделайте новый снимок.
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
export function Compare({
  batches,
  inks,
  settings,
  onChange,
  onError,
  onSuccess,
  fixedBatchId,
  reference,
  embedded = false,
}: {
  batches: Batch[];
  inks: Ink[];
  settings: Settings;
  onChange: () => void;
  onError: (s: string) => void;
  onSuccess: (s: string) => void;
  fixedBatchId?: string;
  reference?: OrderReference;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<"one" | "two" | "spectro" | "saved">(
      reference ? "saved" : "one",
    ),
    [target, setTarget] = useState<Measurement | undefined>(
      reference?.measurement,
    ),
    [current, setCurrent] = useState<Measurement>(),
    [photos, setPhotos] = useState<Photo[]>([]),
    [batchId, setBatchId] = useState(fixedBatchId || ""),
    [comment, setComment] = useState(""),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [conditions, setConditions] = useState<Conditions>(
      reference?.measurement.conditions || settings.conditions,
    );
  function invalidate(which: "both" | "target" | "current") {
    if (which !== "current") setTarget(undefined);
    if (which !== "target") setCurrent(undefined);
    setSaved(false);
  }
  const batch = batches.find((b) => b.id === batchId);
  const compatible =
    target &&
    current &&
    JSON.stringify(target.conditions) === JSON.stringify(current.conditions) &&
    target.source.startsWith("PHOTO") === current.source.startsWith("PHOTO");
  const diff = compatible ? difference(target.lab, current.lab) : undefined;
  function receive(a: PhotoSelection, b?: PhotoSelection, isCurrent = false) {
    const withConditions = (m: Measurement): Measurement => ({
      ...m,
      profileId: settings.profileId || undefined,
      conditions: { ...settings.conditions, whitePoint: "D50", observer: "2" },
    });
    if (isCurrent) setCurrent(withConditions(a.measurement));
    else {
      setTarget(withConditions(a.measurement));
      if (b) setCurrent(withConditions(b.measurement));
    }
    setPhotos((ps) => [...ps.filter((p) => p.id !== a.photo.id), a.photo]);
    setSaved(false);
  }
  function changeMode(m: typeof mode) {
    setMode(m);
    setTarget(m === "saved" ? reference?.measurement : undefined);
    setCurrent(undefined);
    setPhotos([]);
    setSaved(false);
  }
  async function save() {
    if (!target || !current || !batch || !diff) return;
    setSaving(true);
    try {
      const activePhotos = photos.filter(
        (p) => p.id === target.captureId || p.id === current.captureId,
      );
      await saveSample(
        batch.id,
        {
          id: id(),
          createdAt: now(),
          target,
          current,
          photoIds: [
            ...new Set([
              ...activePhotos.map((p) => p.id),
              ...(target.id === reference?.measurement.id
                ? reference.photoIds
                : []),
            ]),
          ],
          referenceId: batch.referenceId,
          components: composition(batch),
          comment,
        },
        activePhotos,
      );
      onChange();
      setSaved(true);
      onSuccess(
        fixedBatchId
          ? "Проба сохранена в этом запуске заказа"
          : "Проба и фотографии сохранены в партии",
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const engine =
    target && current && batch
      ? new ColorCorrectionEngine().calculate({
          target: target.lab,
          current: current.lab,
          composition: composition(batch),
          mass: total(composition(batch)),
          availableInks: inks,
          calibration: [],
          history: [],
          conditions: current.conditions,
        })
      : undefined;
  return (
    <>
      {!embedded && (
        <>
          <div className="intro">
            <div>
              <div className="eyebrow">РАБОЧЕЕ МЕСТО КОЛОРИСТА</div>
              <h1>
                Быстрая приладка<span className="accent">.</span>
              </h1>
              <p>
                Сравните эталон с оттиском. Сохраните пробу. Уточните смесь.
              </p>
            </div>
            <div className="local-chip">
              <span />
              Локальное хранение
            </div>
          </div>
          <div className="steps">
            <span className="active">
              01 <b>Снимок</b>
            </span>
            <ArrowRight size={17} />
            <span className={target ? "active" : ""}>
              02 <b>Сравнение</b>
            </span>
            <ArrowRight size={17} />
            <span className={saved ? "active" : ""}>
              03 <b>Проба в истории</b>
            </span>
          </div>
        </>
      )}
      <div className="segmented mode">
        {reference && (
          <button
            className={mode === "saved" ? "active" : ""}
            onClick={() => changeMode("saved")}
          >
            Эталон заказа
          </button>
        )}
        <button
          className={mode === "one" ? "active" : ""}
          onClick={() => changeMode("one")}
        >
          Один общий снимок
        </button>
        <button
          className={mode === "two" ? "active" : ""}
          onClick={() => changeMode("two")}
        >
          {embedded ? "Два новых снимка" : "Два снимка"}
        </button>
        <button
          className={mode === "spectro" ? "active" : ""}
          onClick={() => changeMode("spectro")}
        >
          Lab / CSV
        </button>
      </div>
      <div className="work-grid compare-grid">
        <div className="stack">
          {mode === "saved" && reference && (
            <>
              <section className="card">
                <h3>Сохранённый эталон · {reference.name}</h3>
                <p className="hint">
                  {new Date(reference.createdAt).toLocaleDateString("ru-RU")} ·
                  эталон этого запуска
                </p>
                <Notice>
                  Снимите текущий оттиск. Сохранённое фото эталона при другом
                  освещении может дать ошибку: для надёжного сравнения сделайте
                  новый общий снимок с физическим эталоном.
                </Notice>
              </section>
              {reference.measurement.source.startsWith("PHOTO") ? (
                <PhotoEditor
                  key="saved-current"
                  label="Оттиск"
                  onInvalidate={() => invalidate("current")}
                  onAnalyze={(a) => receive(a, undefined, true)}
                  onError={onError}
                />
              ) : (
                <section className="card">
                  <ConditionsEditor
                    value={conditions}
                    onChange={setConditions}
                  />
                  <SpectroInput
                    title="Оттиск"
                    conditions={conditions}
                    onMeasurement={(m) => {
                      setCurrent(m);
                      setSaved(false);
                    }}
                    onError={onError}
                  />
                </section>
              )}
            </>
          )}
          {mode === "one" && (
            <PhotoEditor
              key="one"
              label="Общий снимок"
              twoRegions
              onInvalidate={() => invalidate("both")}
              onAnalyze={(a, b) => receive(a, b)}
              onError={onError}
            />
          )}
          {mode === "two" && (
            <>
              <PhotoEditor
                key="target"
                label="Эталон"
                onInvalidate={() => invalidate("target")}
                onAnalyze={(a) => receive(a)}
                onError={onError}
              />
              <PhotoEditor
                key="current"
                label="Оттиск"
                onInvalidate={() => invalidate("current")}
                onAnalyze={(a) => receive(a, undefined, true)}
                onError={onError}
              />
            </>
          )}
          {mode === "spectro" && (
            <section className="card">
              <h3>Измерения прибора</h3>
              <Notice>
                Указывайте условия, соответствующие реальному измерению. CSV:
                L,a,b; дополнительные столбцы R400,R410… — отражение от 0 до 1.
                Lab берётся из прибора; спектр хранится без пересчёта.
              </Notice>
              <ConditionsEditor value={conditions} onChange={setConditions} />
              <SpectroInput
                title="Эталон"
                conditions={conditions}
                onMeasurement={(m) => {
                  setTarget(m);
                  setSaved(false);
                }}
                onError={onError}
              />
              <SpectroInput
                title="Оттиск"
                conditions={conditions}
                onMeasurement={(m) => {
                  setCurrent(m);
                  setSaved(false);
                }}
                onError={onError}
              />
            </section>
          )}
          <section className="card binding-card">
            <div className="card-heading">
              <h3>
                <FlaskConical size={19} />{" "}
                {fixedBatchId ? "Сохранение в эту смену" : "Привязка к партии"}
              </h3>
            </div>
            {!fixedBatchId && (
              <Field label="Активная партия">
                <select
                  aria-label="Активная партия"
                  value={batchId}
                  onChange={(e) => {
                    setBatchId(e.target.value);
                    setSaved(false);
                  }}
                >
                  <option value="">Выберите партию для сохранения</option>
                  {batches
                    .filter((b) => b.status === "ACTIVE")
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} · {b.pantone || "без Pantone"}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="Комментарий к пробе">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Что изменилось при печати…"
              />
            </Field>
            <button
              className="wide"
              disabled={!batch || !diff || saving || saved}
              onClick={() => void save()}
            >
              <Save size={18} />
              {saved ? "Проба сохранена" : "Сохранить пробу"}
            </button>
            {!batches.length && (
              <p className="hint">
                Создайте партию в разделе «История замесов».
              </p>
            )}
          </section>
        </div>
        <aside className="stack results-stack">
          <section className="card result-card">
            <div className="card-heading">
              <h3>Результат сравнения</h3>
              <span className="tag">ΔE 2000</span>
            </div>
            {target && <MeasurementCard title="Эталон" measurement={target} />}
            {current && (
              <MeasurementCard title="Оттиск" measurement={current} />
            )}
            {target && current && !compatible && (
              <Notice>
                Условия или типы измерений различаются. Сравнение заблокировано;
                используйте одинаковые источники и условия.
              </Notice>
            )}
            {diff ? (
              <>
                <div className="delta">
                  <span>
                    ΔE00
                    {target?.source.startsWith("PHOTO") ? " · фотооценка" : ""}
                  </span>
                  <strong>{diff.de00.toFixed(2)}</strong>
                </div>
                <div className="delta-grid">
                  {[
                    ["ΔL*", diff.l],
                    ["Δa*", diff.a],
                    ["Δb*", diff.b],
                    ["ΔC*", diff.c],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <b>
                        {Number(v) >= 0 ? "+" : ""}
                        {Number(v).toFixed(2)}
                      </b>
                    </div>
                  ))}
                </div>
                <p className="direction">
                  Оттиск {diff.direction} относительно эталона.
                </p>
                {settings.tolerance !== null && (
                  <Notice>
                    Ваш порог ΔE00: {settings.tolerance}.{" "}
                    {diff.de00 <= settings.tolerance
                      ? "В пределах заданного порога."
                      : "Выше заданного порога."}{" "}
                    Фотооценка не подтверждает производственную пригодность.
                  </Notice>
                )}
              </>
            ) : (
              !target &&
              !current && (
                <div className="empty-result">
                  <div className="color-rings">
                    <i />
                    <i />
                    <i />
                  </div>
                  <strong>Здесь появится разница</strong>
                  <p>Загрузите фото и выделите области эталона и оттиска.</p>
                </div>
              )
            )}
          </section>
          <section className="card muted-card">
            <div className="eyebrow">КОРРЕКТИРОВКА СМЕСИ</div>
            <h3>Рекомендация требует данных</h3>
            <p>
              {engine?.reasons[0] ||
                "Для расчёта добавок необходимо накопить данные о смешивании красок"}
            </p>
            <div className="status-code">INSUFFICIENT_CALIBRATION_DATA</div>
            <p className="hint">
              Ручные добавки доступны в истории партии. Каждая новая проба
              помогает накопить экспериментальные данные.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
export function SpectroInput({
  title,
  conditions,
  onMeasurement,
  onError,
}: {
  title: string;
  conditions: Conditions;
  onMeasurement: (m: Measurement) => void;
  onError: (s: string) => void;
}) {
  const [values, setValues] = useState(["", "", ""]);
  return (
    <div className="spectro-input">
      <h4>{title}</h4>
      <div className="form-grid three">
        {["L*", "a*", "b*"].map((s, i) => (
          <Field label={s} key={s}>
            <input
              aria-label={`${title} ${s}`}
              inputMode="decimal"
              value={values[i]}
              onChange={(e) =>
                setValues(values.map((v, j) => (i === j ? e.target.value : v)))
              }
            />
          </Field>
        ))}
      </div>
      <div className="actions">
        <button
          className="secondary"
          onClick={() => {
            try {
              if (values.some((v) => !v.trim()))
                throw Error("Заполните все координаты Lab");
              const [l, a, b] = values.map((v) => Number(v.replace(",", ".")));
              onMeasurement({
                id: id(),
                createdAt: now(),
                source: "SPECTRO_LAB",
                lab: labSchema.parse({ l, a, b }),
                conditions: { ...conditions },
              });
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Принять Lab
        </button>
        <label className="button secondary">
          Импорт CSV
          <input
            hidden
            type="file"
            accept=".csv,text/csv"
            aria-label={`CSV ${title}`}
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (!f) return;
                const measurements = parseMeasurements(
                  await f.text(),
                  conditions,
                );
                if (measurements.length !== 1)
                  throw Error(
                    "Для одной пробы CSV должен содержать ровно одну строку измерения",
                  );
                onMeasurement(measurements[0]);
              } catch (e) {
                onError((e as Error).message);
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
