import { useState } from "react";
import type {
  Batch,
  Component,
  Ink,
  OrderColor,
  Recipe,
} from "../domain/types";
import { pantoneKey } from "../domain/pantones";
import { scale } from "../domain/mixture";
import { progress } from "../domain/progress";
import { Composition, Field, date } from "./common";

export function RecipeStarter({
  color,
  recipes,
  batches,
  inks,
  onUse,
  onError,
}: {
  color: OrderColor;
  recipes: Recipe[];
  batches: Batch[];
  inks: Ink[];
  onUse: (components: Component[]) => void;
  onError: (s: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [grams, setGrams] = useState("1000");
  const matches = recipes
    .filter((r) => pantoneKey(r.pantone) === pantoneKey(color.pantone))
    .sort(
      (a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt),
    );
  const recipe = matches.find((r) => r.id === selected) || matches[0];
  const observations = batches
    .filter((b) => pantoneKey(b.pantone) === pantoneKey(color.pantone))
    .flatMap((batch) =>
      batch.samples.flatMap((sample, index) => {
        const previous = batch.samples[index - 1];
        if (
          !previous ||
          sample.target.id !==
            color.references.find((r) => r.id === color.currentReferenceId)
              ?.measurement.id
        )
          return [];
        const additions = batch.additions.filter(
          (a) =>
            sample.additionIds?.includes(a.id) &&
            !previous.additionIds?.includes(a.id),
        );
        const result = progress(sample.target, sample.current, previous);
        return additions.length &&
          result.toTarget &&
          result.previousError !== undefined
          ? [{ sample, additions, result }]
          : [];
      }),
    )
    .sort((a, b) => b.sample.createdAt.localeCompare(a.sample.createdAt))
    .slice(0, 4);
  return (
    <details className="card recipe-starter">
      <summary>
        База для подбора · рецептур: {matches.length} · результатов добавок:{" "}
        {observations.length}
      </summary>
      <h3>Начать с сохранённой рецептуры</h3>
      {recipe ? (
        <>
          <Field label="Рецептура этого Pantone">
            <select
              value={recipe.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {matches.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · v{r.version}
                </option>
              ))}
            </select>
          </Field>
          <p className="hint">
            Источник:{" "}
            {recipe.source === "OWN"
              ? "Собственная рецептура"
              : recipe.source === "SUPPLIER"
                ? "Поставщик"
                : "Pantone"}
            . {recipe.sourceNote || "Источник не указан"}
          </p>
          <Composition value={recipe.components} inks={inks} />
          <Field label="Масса исходного замеса, г">
            <input
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
            />
          </Field>
          <button
            className="secondary"
            onClick={() => {
              try {
                onUse(scale(recipe.components, grams));
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Подставить состав в форму
          </button>
          <p className="hint">
            Сохраните исходный состав после фактического замеса. Рецептура
            задаёт стартовую смесь; добавки подбираются по выкаткам.
          </p>
        </>
      ) : (
        <p>
          Для {color.pantone} пока нет рецептуры.{" "}
          <a href="#recipes">Добавьте собственную или рецептуру поставщика</a> с
          источником и компонентами.
        </p>
      )}
      <h3>Что получилось после добавок</h3>
      {observations.length ? (
        observations.map(({ sample, additions, result }) => (
          <article key={sample.id} className="observed-result">
            <small>{date(sample.createdAt)}</small>
            <p>
              {additions
                .map(
                  (a) =>
                    `${inks.find((i) => i.id === a.component.inkId)?.name || a.component.inkId} ${a.component.grams} г`,
                )
                .join(" + ")}{" "}
              → ΔE00 {result.previousError!.toFixed(2)} →{" "}
              {result.toTarget!.de00.toFixed(2)} ·{" "}
              {result.trend === "CLOSER"
                ? "ближе"
                : result.trend === "FARTHER"
                  ? "дальше"
                  : "почти без изменения"}
            </p>
            <p className="hint">
              Наблюдение для этой смеси и эталона. Дозу нельзя переносить на
              другую массу автоматически.
            </p>
          </article>
        ))
      ) : (
        <p className="hint">
          После двух сравнимых выкаток с добавкой между ними здесь появится
          фактический результат. Несколько добавок оцениваются вместе.
        </p>
      )}
      <details>
        <summary>Откуда брать исходные данные</summary>
        <p>
          Для Double V начните с рецептур вашей серии у{" "}
          <a
            href="https://doublev.ru/catalog/kraski/uf_kraska/uf-flekso-kraski/"
            target="_blank"
            rel="noreferrer"
          >
            поставщика: УФ-флексокраски и станция смешения Дубль В
          </a>
          . Запросите коды баз, массовые доли, подложку и условия выкатки.
        </p>
        <p>
          <a
            href="https://support.pantone.com/en/what-is-master-standard-digital-data"
            target="_blank"
            rel="noreferrer"
          >
            Цифровые эталоны Pantone
          </a>{" "}
          и{" "}
          <a
            href="https://www.xrite.com/-/media/xrite/files/literature/misc/f/faq_for_pantonelive_users_with_inkformulation_en.pdf"
            target="_blank"
            rel="noreferrer"
          >
            данные поставщика / X-Rite InkFormulation
          </a>{" "}
          — источники эталонов и рецептур для конкретных красок. Lab можно
          внести вручную или импортировать CSV прибора.
        </p>
        <p className="hint">
          RGB/HEX из интернет-палитры не описывает смешивание УФ-красок. Для
          расчёта доз нужны измерения ваших баз, смесей, подложки и условий
          печати.
        </p>
      </details>
    </details>
  );
}
