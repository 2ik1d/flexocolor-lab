import type { Measurement, Sample } from "../domain/types";
import { comparable } from "../domain/progress";
import { deltaE2000 } from "../color/color";

export function TrialTrend({
  samples,
  target,
  current,
  tolerance,
}: {
  samples: Sample[];
  target: Measurement;
  current?: Measurement;
  tolerance?: number;
}) {
  const values = samples
    .filter((s) => s.target.id === target.id && comparable(target, s.current))
    .map((s, i) => ({
      name: `Проба ${i + 1}`,
      delta: deltaE2000(target.lab, s.current.lab),
    }));
  if (
    current &&
    comparable(target, current) &&
    !samples.some((s) => s.current.id === current.id)
  )
    values.push({
      name: "Новая проба",
      delta: deltaE2000(target.lab, current.lab),
    });
  if (values.length < 2) return null;
  const max = Math.max(1, ...values.map((v) => v.delta), tolerance || 0) * 1.15,
    x = (i: number) => 45 + (i / (values.length - 1)) * 485,
    y = (delta: number) => 140 - (delta / max) * 115;
  const best = values.reduce((a, b) => (b.delta < a.delta ? b : a));
  return (
    <section className="card trial-trend" aria-label="Прогресс доводки">
      <div className="card-heading">
        <div>
          <div className="eyebrow">ОТ ПЕРВОЙ ПРОБЫ К РЕЗУЛЬТАТУ</div>
          <h3>Прогресс доводки</h3>
        </div>
        <span className="tag">Лучший ΔE00: {best.delta.toFixed(2)}</span>
      </div>
      <svg
        viewBox="0 0 560 180"
        role="img"
        aria-label={`ΔE00 по пробам: ${values.map((v) => v.delta.toFixed(2)).join(" → ")}. Меньше — ближе к эталону.`}
      >
        {[0, max / 2, max].map((n) => (
          <g key={n}>
            <line x1="45" x2="530" y1={y(n)} y2={y(n)} className="chart-grid" />
            <text x="35" y={y(n) + 4} textAnchor="end">
              {n.toFixed(1)}
            </text>
          </g>
        ))}
        {tolerance !== undefined && (
          <g>
            <line
              x1="45"
              x2="530"
              y1={y(tolerance)}
              y2={y(tolerance)}
              className="chart-tolerance"
            />
            <text x="530" y={y(tolerance) - 6} textAnchor="end">
              Допуск {tolerance}
            </text>
          </g>
        )}
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v.delta)}`).join(" ")}
          className="chart-line"
        />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v.delta)} r="4" className="chart-dot">
            <title>
              {v.name}: ΔE00 {v.delta.toFixed(2)}
            </title>
          </circle>
        ))}
        <text x="45" y="166">
          Первая проба
        </text>
        <text x="530" y="166" textAnchor="end">
          {values.at(-1)!.name}
        </text>
      </svg>
      <details>
        <summary>Все значения ΔE00</summary>
        <ol className="trend-values">
          {values.map((v, i) => (
            <li key={i}>
              {v.name}: <b>{v.delta.toFixed(2)}</b>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
