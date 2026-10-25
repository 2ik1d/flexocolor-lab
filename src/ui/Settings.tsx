import { useState } from "react";
import { Download, Upload, ShieldCheck } from "lucide-react";
import { db, exportData, importData, validateBackup } from "../storage/db";
import type { Settings as SettingsType } from "../domain/types";
import { Field, Notice, ConditionsEditor } from "./common";
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Settings({
  settings,
  onChange,
  onError,
  onSuccess,
}: {
  settings: SettingsType;
  onChange: () => void;
  onError: (s: string) => void;
  onSuccess: (s: string) => void;
}) {
  const [tolerance, setTolerance] = useState(
      settings.tolerance?.toString() || "",
    ),
    [pending, setPending] = useState<ReturnType<typeof validateBackup>>(),
    [confirmed, setConfirmed] = useState(false),
    [conditions, setConditions] = useState(settings.conditions),
    [storage, setStorage] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЛОКАЛЬНАЯ ЛАБОРАТОРИЯ</div>
          <h1>Настройки и данные</h1>
          <p>Без аккаунта, обязательного сервера и передачи фотографий.</p>
        </div>
        <ShieldCheck size={34} />
      </div>
      <div className="work-grid">
        <div className="stack">
          <section className="card">
            <h3>Резервная копия</h3>
            <Notice>
              Очистка данных Safari, удаление веб-приложения или освобождение
              хранилища системой могут привести к потере базы. Регулярно
              сохраняйте JSON вне браузера. Копия содержит фотографии.
            </Notice>
            <div className="actions">
              <button
                onClick={async () => {
                  try {
                    download(
                      JSON.stringify(await exportData(), null, 2),
                      `FlexoColorLab-${new Date().toISOString().slice(0, 10)}.json`,
                    );
                    onSuccess("Резервная копия подготовлена к загрузке");
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              >
                <Download size={18} />
                Экспорт JSON
              </button>
              <label className="button secondary">
                <Upload size={18} />
                Импорт JSON
                <input
                  aria-label="Импорт резервной копии"
                  hidden
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 200 * 1024 * 1024)
                        throw Error("Копия больше 200 МБ");
                      setPending(validateBackup(JSON.parse(await f.text())));
                      setConfirmed(false);
                    } catch (e) {
                      onError(`Копия не принята: ${(e as Error).message}`);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {pending && (
              <div className="import-confirm">
                <h4>Проверка пройдена</h4>
                <p>
                  {pending.inks.length} красок · {pending.recipes.length}{" "}
                  рецептур · {pending.batches.length} партий ·{" "}
                  {pending.photos.length} фотографий
                </p>
                <Notice>
                  Восстановление полностью заменит текущую базу. Сначала
                  экспортируйте её, если она нужна.
                </Notice>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />{" "}
                  Я сохранил нужные данные и подтверждаю замену
                </label>
                <div className="actions">
                  <button
                    disabled={!confirmed}
                    onClick={async () => {
                      try {
                        await importData(pending);
                        setPending(undefined);
                        onChange();
                        onSuccess("Резервная копия восстановлена");
                      } catch (e) {
                        onError((e as Error).message);
                      }
                    }}
                  >
                    Восстановить базу
                  </button>
                  <button
                    className="subtle"
                    onClick={() => setPending(undefined)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="card">
            <h3>Критерий сравнения</h3>
            <Field label="Ваш порог ΔE00 (пусто — не применять)">
              <input
                aria-label="Порог ΔE00"
                inputMode="decimal"
                value={tolerance}
                onChange={(e) => setTolerance(e.target.value)}
              />
            </Field>
            <ConditionsEditor value={conditions} onChange={setConditions} />
            <button
              onClick={async () => {
                try {
                  const v = tolerance.trim()
                    ? Number(tolerance.replace(",", "."))
                    : null;
                  if (v !== null && (!Number.isFinite(v) || v <= 0))
                    throw Error("Порог должен быть положительным");
                  await db.settings.put({
                    ...settings,
                    tolerance: v,
                    conditions,
                  });
                  onChange();
                  onSuccess("Настройки сохранены");
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            >
              Сохранить настройки
            </button>
            <p className="hint">
              Для фотографий используются Lab D50 / 2° после адаптации sRGB D65.
              Спектрофотометрические условия указываются в форме Lab / CSV.
            </p>
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <h3>Установка на iPhone</h3>
            <p>
              Откройте сайт в Safari → «Поделиться» → «На экран Домой». После
              первой загрузки дождитесь готовности офлайн-кэша.
            </p>
            <p>
              Камера в браузере доступна через HTTPS или localhost. Загрузка из
              медиатеки остаётся доступной альтернативой.
            </p>
          </section>
          <section className="card">
            <h3>Хранилище</h3>
            <p>
              {storage ||
                "Данные хранятся в IndexedDB этого браузера и адреса сайта."}
            </p>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const persisted = await navigator.storage?.persist?.();
                  const e = await navigator.storage?.estimate?.();
                  setStorage(
                    `Занято ${((e?.usage || 0) / 1024 / 1024).toFixed(1)} МБ. Постоянное хранение: ${persisted ? "разрешено" : "не гарантировано браузером"}.`,
                  );
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            >
              Проверить и защитить хранение
            </button>
          </section>
          <section className="card">
            <h3>О точности</h3>
            <p>
              Стабильная фотооценка помогает отслеживать изменения, но не
              заменяет измерения прибором. Непроверенная модель не выдаёт
              производственные добавки.
            </p>
            <small>FlexoColor Lab 1.0 · схема данных 2</small>
          </section>
        </aside>
      </div>
    </>
  );
}
