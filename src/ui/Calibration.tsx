import { useState } from "react";
import { db, repeatability } from "../storage/db";
import {
  id,
  now,
  type Measurement,
  type Profile,
  type Settings,
} from "../domain/types";
import { PhotoEditor } from "./PhotoEditor";
import { ConditionsEditor, Field, Notice, date } from "./common";
export function Calibration({
  profiles,
  settings,
  onChange,
  onError,
}: {
  profiles: Profile[];
  settings: Settings;
  onChange: () => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [conditions, setConditions] = useState(settings.conditions),
    [controls, setControls] = useState<Measurement[]>([]),
    [limit, setLimit] = useState("2"),
    [notes, setNotes] = useState("");
  const max = repeatability(controls);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВОСПРОИЗВОДИМОСТЬ</div>
          <h1>Калибровка установки</h1>
          <p>Контроль освещения и повторяемости съёмки.</p>
        </div>
      </div>
      <Notice>
        Профиль первой версии проверяет повторяемость, но не исправляет цвет
        камеры и не переводит фото в PHOTO_CALIBRATED. Для калиброванной оценки
        нужны мишень, независимая проверка ошибок и утверждённый алгоритм.
      </Notice>
      <div className="work-grid">
        <div className="stack">
          <section className="card">
            <h3>Новый профиль</h3>
            <Field label="Название установки">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="iPhone 13 · пост 1"
              />
            </Field>
            <ConditionsEditor
              value={conditions}
              onChange={(v) => {
                setConditions(v);
                setControls([]);
              }}
            />
            <Field label="Ваш предел повторяемости, ΔE00">
              <input
                inputMode="decimal"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
            <Field label="Условия и примечания">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Свет, расстояние, настройки камеры, контрольная область…"
              />
            </Field>
            <p>
              Контрольных снимков: <b>{controls.length}</b> · максимальная
              попарная ΔE00: <b>{max.toFixed(2)}</b>
            </p>
            {controls.length >= 3 && (
              <Notice>
                {max <= Number(limit.replace(",", "."))
                  ? "Серия укладывается в ваш предел повторяемости."
                  : "Серия превышает ваш предел. Проверьте освещение, геометрию и автоматическую обработку камеры."}{" "}
                Это проверка стабильности, не абсолютной точности.
              </Notice>
            )}
            <div className="actions">
              <button
                disabled={controls.length < 3}
                onClick={async () => {
                  try {
                    const n = Number(limit.replace(",", "."));
                    if (
                      !name.trim() ||
                      !conditions.setup.trim() ||
                      !Number.isFinite(n) ||
                      n <= 0
                    )
                      throw Error(
                        "Укажите название, идентификатор установки и положительный предел",
                      );
                    await db.profiles.add({
                      id: id(),
                      name,
                      conditions,
                      createdAt: now(),
                      controls,
                      maxRepeatDelta: n,
                      notes,
                      kind: "REPEATABILITY_ONLY",
                    });
                    setControls([]);
                    setName("");
                    onChange();
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              >
                Сохранить профиль
              </button>
              <button className="subtle" onClick={() => setControls([])}>
                Сбросить серию
              </button>
            </div>
            <p className="hint">
              Сделайте минимум 3 независимых снимка одной контрольной области,
              повторно устанавливая образец. Для оценки освещения повторите
              серию для нейтрального поля в центре и по краям.
            </p>
          </section>
          <PhotoEditor
            label="Контрольная область"
            onAnalyze={() => {}}
            onControl={(m) =>
              setControls([
                ...controls.filter((c) => c.captureId !== m.captureId),
                {
                  ...m,
                  conditions: {
                    ...conditions,
                    whitePoint: "D50",
                    observer: "2",
                  },
                },
              ])
            }
            onError={onError}
          />
        </div>
        <aside className="stack">
          <section className="card">
            <h3>Сохранённые профили</h3>
            {profiles.length ? (
              profiles.map((p) => (
                <div className="profile" key={p.id}>
                  <h4>{p.name}</h4>
                  <small>
                    {date(p.createdAt)} · {p.conditions.setup}
                  </small>
                  <p>
                    {p.controls.length} снимков · ΔE00 max{" "}
                    {repeatability(p.controls).toFixed(2)} / предел{" "}
                    {p.maxRepeatDelta}
                  </p>
                  <p>{p.notes}</p>
                  <button
                    className="secondary"
                    disabled={settings.profileId === p.id}
                    onClick={async () => {
                      await db.settings.put({
                        ...settings,
                        profileId: p.id,
                        conditions: p.conditions,
                      });
                      onChange();
                    }}
                  >
                    {settings.profileId === p.id
                      ? "Активный профиль"
                      : "Использовать профиль"}
                  </button>
                </div>
              ))
            ) : (
              <p className="hint">Профилей пока нет.</p>
            )}
          </section>
          <section className="card">
            <h3>Методика серии</h3>
            <ol>
              <li>Зафиксируйте свет и положение телефона.</li>
              <li>Избегайте бликов и теней, дайте освещению прогреться.</li>
              <li>Снимайте один и тот же материал и контрольное поле.</li>
              <li>Повторяйте установку образца между снимками.</li>
              <li>При смене света создавайте отдельный профиль.</li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
