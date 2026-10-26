import type { Measurement, Sample, Batch, Ink } from "../domain/types";
import { progress } from "../domain/progress";
import { MeasurementCard } from "./Compare";
import { Notice } from "./common";
export function ProgressReport({
  target,
  current,
  previous,
  changes,
  inks,
  tolerance,
}: {
  target: Measurement;
  current: Measurement;
  previous?: Sample;
  changes: Batch["additions"];
  inks: Ink[];
  tolerance?: number;
}) {
  const result = progress(target, current, previous),
    photo = current.source.startsWith("PHOTO");
  return (
    <>
      <section className="card comparison-report">
        <div className="card-heading">
          <h3>С эталоном</h3>
          <span className="tag">{photo ? "Фотооценка" : "Прибор"}</span>
        </div>
        {result.toTarget ? (
          <>
            <div className="comparison-number">
              <strong>{result.toTarget.de00.toFixed(2)}</strong>
              <span>ΔE00 · меньше — ближе</span>
            </div>
            <p>Оттиск {result.toTarget.direction}.</p>
            <div className="delta-metrics">
              {[
                ["ΔE76", result.toTarget.de76],
                ["ΔL*", result.toTarget.l],
                ["Δa*", result.toTarget.a],
                ["Δb*", result.toTarget.b],
                ["ΔC*", result.toTarget.c],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{Number(value).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            {tolerance !== undefined && (
              <p
                className={
                  result.toTarget.de00 <= tolerance
                    ? "accepted-label"
                    : "tolerance-failed"
                }
              >
                {result.toTarget.de00 <= tolerance ? "В пределах" : "Выше"}{" "}
                допуска ΔE00 ≤ {tolerance.toFixed(2)}
                {photo ? " · по фотооценке" : ""}
              </p>
            )}
          </>
        ) : (
          <Notice>Условия отличаются. Сравнение с эталоном недоступно.</Notice>
        )}
      </section>
      <section className={`card trend-card ${result.trend.toLowerCase()}`}>
        <h3>С прошлой пробой</h3>
        {result.fromPrevious ? (
          <>
            <strong className="trend-title">
              {result.trend === "CLOSER"
                ? "Ближе к эталону"
                : result.trend === "FARTHER"
                  ? "Дальше от эталона"
                  : result.trend === "UNCHANGED"
                    ? "Почти без изменения"
                    : "Изменение цвета"}
            </strong>
            {result.previousError !== undefined && result.toTarget && (
              <p className="trend-path">
                ΔE00: {result.previousError.toFixed(2)} →{" "}
                {result.toTarget.de00.toFixed(2)}
              </p>
            )}
            <p className="hint">
              Изменение от прошлой пробы: ΔE00{" "}
              {result.fromPrevious.de00.toFixed(2)}. Стало{" "}
              {result.fromPrevious.direction}.
            </p>
            <div className="delta-metrics compact">
              {[
                ["ΔE76", result.fromPrevious.de76],
                ["ΔL*", result.fromPrevious.l],
                ["Δa*", result.fromPrevious.a],
                ["Δb*", result.fromPrevious.b],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{Number(value).toFixed(2)}</strong>
                </div>
              ))}
            </div>
            {changes.length > 0 && (
              <p className="hint">
                Между пробами внесено:{" "}
                {changes
                  .map(
                    (a) =>
                      `${inks.find((i) => i.id === a.component.inkId)?.name || a.component.inkId} ${a.component.grams} г`,
                  )
                  .join(" + ")}
                .
                {changes.length > 1
                  ? " Отдельный вклад каждой добавки неизвестен."
                  : ""}
              </p>
            )}
          </>
        ) : (
          <p>
            {previous
              ? "Условия прошлой пробы отличаются."
              : "Прошлой пробы пока нет. Сохраните текущую как исходную."}
          </p>
        )}
      </section>
      <section className="card advice-card">
        <h3>Что делать дальше</h3>
        {result.advice.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        {photo && (
          <p className="hint">
            Вывод относится к фотооценке. Свет и блики могут изменить результат;
            проверяйте физический эталон.
          </p>
        )}
        <details>
          <summary>Какую краску и сколько граммов добавить?</summary>
          <p>
            Для расчёта добавок необходимо накопить данные о смешивании красок.
            Проверенной модели пока нет — точные компоненты и граммы
            автоматически не рассчитываются.
          </p>
        </details>
      </section>
      <details className="card">
        <summary>Подробные измерения</summary>
        <MeasurementCard title="Эталон" measurement={target} />
        <MeasurementCard title="Текущая проба" measurement={current} />
        {previous && (
          <MeasurementCard
            title="Прошлая проба"
            measurement={previous.current}
          />
        )}
      </details>
    </>
  );
}
