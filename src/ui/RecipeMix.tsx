import { useState } from "react";
import type { Component, Ink, Recipe } from "../domain/types";
import { scale, total } from "../domain/mixture";
import { Composition, Field } from "./common";
import { ProductionSheet } from "./ProductionSheet";
import { Printer } from "lucide-react";

export function RecipeMix({
  recipe,
  inks,
  onUse,
  action = "Взять исходный состав",
}: {
  recipe: Recipe;
  inks: Ink[];
  onUse?: (components: Component[], grams: string) => void;
  action?: string;
}) {
  const [grams, setGrams] = useState("1000"),
    [printing, setPrinting] = useState(false);
  let components: Component[] = [],
    error = "";
  try {
    components = scale(recipe.components, grams);
    if (components.some((c) => Number(c.grams) === 0)) throw Error("TOO_SMALL");
  } catch (e) {
    error =
      (e as Error).message === "TOO_SMALL"
        ? "Масса слишком мала: один из компонентов меньше 0,001 г. Увеличьте замес."
        : "Введите массу больше нуля, до 3 знаков после запятой.";
  }
  return (
    <div className="recipe-mix">
      <div className="mix-mass">
        <Field label="Масса замеса, г">
          <input
            inputMode="decimal"
            value={grams}
            onChange={(e) => setGrams(e.target.value.replace(",", "."))}
          />
        </Field>
        <div className="mix-presets" aria-label="Быстрый выбор массы">
          {["100", "500", "1000", "5000"].map((n) => (
            <button className="secondary" key={n} onClick={() => setGrams(n)}>
              {Number(n) >= 1000 ? `${Number(n) / 1000} кг` : `${n} г`}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="hint" role="status">
          {error}
        </p>
      ) : (
        <Composition value={components} inks={inks} />
      )}
      <p className="hint">
        Массы пересчитаны из состава на {total(recipe.components)} г. Пропорции
        сохранены.
      </p>
      <div className="actions">
        {onUse && (
          <button disabled={!!error} onClick={() => onUse(components, grams)}>
            {action}
          </button>
        )}
        <button
          className="secondary"
          disabled={!!error}
          onClick={() => setPrinting(true)}
        >
          <Printer size={16} /> Карта замеса
        </button>
      </div>
      {printing && (
        <ProductionSheet
          title={recipe.name}
          subtitle={`${recipe.pantone} · версия ${recipe.version} · ${grams} г`}
          components={components}
          inks={inks}
          note={recipe.sourceNote}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
