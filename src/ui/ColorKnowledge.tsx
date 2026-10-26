import type { Batch, Component, Ink, Pantone, Recipe } from "../domain/types";
import { fanMap } from "../domain/fan";
import { pantoneKey } from "../domain/pantones";
import { Composition, date } from "./common";
import { MeasurementCard } from "./Compare";
import { SamplePhotos } from "./Records";
import { RecipeMix } from "./RecipeMix";
export function ColorKnowledge({
  pantone,
  pantones,
  recipes,
  batches,
  inks,
  onUse,
}: {
  pantone: string;
  pantones: Pantone[];
  recipes: Recipe[];
  batches: Batch[];
  inks: Ink[];
  onUse?: (components: Component[]) => void;
}) {
  const key = pantoneKey(pantone),
    entry = pantones.find((p) => p.id === key),
    catalog = entry?.catalog || fanMap.get(key)?.catalog;
  const known = recipes
    .filter((r) => pantoneKey(r.pantone) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = batches
    .filter((b) => pantoneKey(b.pantone) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="color-knowledge">
      <div
        className="knowledge-swatch"
        style={{ background: catalog?.hex || "#303c46" }}
      >
        <strong>{pantone || "Новый цвет"}</strong>
      </div>
      {catalog && (
        <>
          <p>
            Solid Coated · {catalog.edition} · {catalog.hex.toUpperCase()}
          </p>
          <p className="hint">
            Справочные Lab: {catalog.lab.l.toFixed(1)} /{" "}
            {catalog.lab.a.toFixed(1)} / {catalog.lab.b.toFixed(1)}. Экранный
            образец; для подбора загрузите физический эталон.
          </p>
          <a
            className="hint"
            href={catalog.source}
            target="_blank"
            rel="noreferrer"
          >
            Источник данных
          </a>
        </>
      )}
      <h4>Из чего состоит</h4>
      {known.length ? (
        known.slice(0, 4).map((r) => (
          <details key={r.id} open={known[0].id === r.id}>
            <summary>
              {r.name} · версия {r.version}
            </summary>
            <p className="hint">{r.sourceNote || "Собственный состав"}</p>
            <RecipeMix recipe={r} inks={inks} onUse={onUse} />
          </details>
        ))
      ) : entry?.startingComponents?.length ? (
        <>
          <Composition value={entry.startingComponents} inks={inks} />
          {onUse && (
            <button
              className="secondary"
              onClick={() => onUse(entry.startingComponents!)}
            >
              Взять исходный состав
            </button>
          )}
        </>
      ) : (
        <p className="hint">
          Состав для этих УФ-красок ещё не записан. Внесите его в заказе — он
          сохранится для следующих подборов.
        </p>
      )}
      {history.slice(0, 3).map((b) => (
        <details key={b.id}>
          <summary>
            История · {b.name} · {date(b.createdAt)}
          </summary>
          {b.initial.length ? (
            <Composition
              value={b.initial}
              inks={inks}
              showPercent={b.compositionKnown !== false}
            />
          ) : (
            <p>Исходный состав неизвестен</p>
          )}
          <p>
            {b.samples.length} выкаток · {b.additions.length} добавок
          </p>
          {onUse && b.compositionKnown !== false && b.initial.length > 0 && (
            <button className="secondary" onClick={() => onUse(b.initial)}>
              Взять чистый исходный состав
            </button>
          )}
        </details>
      ))}
      {(entry?.references || []).slice(-2).map((r) => (
        <details key={r.id}>
          <summary>
            Эталон · {r.name} · {date(r.createdAt)}
          </summary>
          <MeasurementCard
            title="Сохранённый эталон"
            measurement={r.measurement}
          />
          <SamplePhotos ids={r.photoIds} />
        </details>
      ))}
    </div>
  );
}
