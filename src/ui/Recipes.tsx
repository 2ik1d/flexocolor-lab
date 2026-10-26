import { useState } from "react";
import { Plus, ArrowLeft, Upload, Search, BookOpen, Copy } from "lucide-react";
import { db, savePantone } from "../storage/db";
import {
  id,
  now,
  recipeSchema,
  type Recipe,
  type Ink,
  type Pantone,
  type Component,
} from "../domain/types";
import { normalize, scale, total } from "../domain/mixture";
import { pantoneKey } from "../domain/pantones";
import { Field, ComponentsEditor, Composition, date } from "./common";
import { RecipeTransfer } from "./RecipeTransfer";
import { RecipeMix } from "./RecipeMix";

const sourceNames = {
  OWN: "Свой состав",
  SUPPLIER: "Поставщик",
  PANTONE: "Pantone",
};
export function Recipes({
  recipes,
  pantones,
  inks,
  onChange,
  onError,
}: {
  recipes: Recipe[];
  pantones: Pantone[];
  inks: Ink[];
  onChange: () => void;
  onError: (s: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [sourceFilter, setSourceFilter] = useState("ALL"),
    [allVersions, setAllVersions] = useState(false),
    [transfer, setTransfer] = useState(!recipes.length),
    [selectedId, setSelectedId] = useState(""),
    [editing, setEditing] = useState<Recipe | null>(),
    [name, setName] = useState(""),
    [pantone, setPantone] = useState(""),
    [source, setSource] = useState<Recipe["source"]>("OWN"),
    [sourceNote, setSourceNote] = useState(""),
    [components, setComponents] = useState<Component[]>([]),
    [target, setTarget] = useState("1000"),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(36);
  const latest = new Map<string, number>();
  recipes.forEach((r) =>
    latest.set(r.familyId, Math.max(latest.get(r.familyId) || 0, r.version)),
  );
  const filtered = recipes
    .filter(
      (r) =>
        (allVersions || r.version === latest.get(r.familyId)) &&
        (sourceFilter === "ALL" || r.source === sourceFilter) &&
        `${r.pantone} ${r.name} ${r.sourceNote} ${r.components.map((c) => inks.find((i) => i.id === c.inkId)?.name || "").join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = recipes.find((r) => r.id === selectedId);
  function open(recipe: Recipe | null) {
    setEditing(recipe);
    setName(recipe?.name || "");
    setPantone(recipe?.pantone || "");
    setSource(recipe?.source || "OWN");
    setSourceNote(recipe?.sourceNote || "");
    setComponents(
      structuredClone(
        recipe?.components || [{ inkId: inks[0]?.id || "", grams: "1000" }],
      ),
    );
  }
  async function save(newVersion: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const cs = normalize(components);
      if (Number(total(cs)) <= 0)
        throw Error("Введите положительные массы компонентов");
      if (source !== "OWN" && !sourceNote.trim())
        throw Error("Укажите проверяемый источник рецептуры");
      const saved = await db.transaction(
        "rw",
        db.recipes,
        db.inks,
        db.pantones,
        db.photos,
        async () => {
          if ((await db.inks.bulkGet(cs.map((c) => c.inkId))).some((i) => !i))
            throw Error("В составе есть неизвестная краска");
          const familyId = editing?.familyId || id();
          const family = await db.recipes
            .where("familyId")
            .equals(familyId)
            .toArray();
          const recipe = recipeSchema.parse({
            id: editing && !newVersion ? editing.id : id(),
            familyId,
            version: editing
              ? newVersion
                ? Math.max(...family.map((r) => r.version)) + 1
                : editing.version
              : 1,
            name: name.trim(),
            pantone: pantoneKey(pantone),
            source,
            sourceNote: sourceNote.trim(),
            components: cs,
            createdAt: now(),
          });
          await db.recipes.put(recipe);
          if (recipe.pantone && !(await db.pantones.get(recipe.pantone)))
            await savePantone({
              id: recipe.pantone,
              pantone: recipe.pantone,
              name: "",
              notes: "",
              createdAt: now(),
              references: [],
              currentReferenceId: "",
            });
          return recipe;
        },
      );
      setEditing(undefined);
      setSelectedId(saved.id);
      onChange();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (editing !== undefined)
    return (
      <>
        <button className="subtle" onClick={() => setEditing(undefined)}>
          <ArrowLeft size={17} /> К библиотеке
        </button>
        <div className="page-heading">
          <div>
            <div className="eyebrow">СОСТАВ И ИСТОЧНИК</div>
            <h1>{editing ? "Редактирование рецептуры" : "Новая рецептура"}</h1>
            <p>Запишите состав один раз — используйте в следующих заказах.</p>
          </div>
        </div>
        <section className="card">
          <div className="form-grid">
            <Field label="Название рецептуры">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Pantone">
              <input
                list="recipe-pantones"
                value={pantone}
                onChange={(e) => setPantone(e.target.value)}
                placeholder="185 C"
              />
              <datalist id="recipe-pantones">
                {pantones.map((p) => (
                  <option key={p.id} value={p.pantone} />
                ))}
              </datalist>
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
                placeholder="Документ, редакция или условия печати"
              />
            </Field>
          </div>
          <ComponentsEditor
            value={components}
            onChange={setComponents}
            inks={inks}
          />
          <SafeComposition components={components} inks={inks} />
          <div className="actions">
            <Field label="Масштабировать до, г">
              <input
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value.replace(",", "."))}
              />
            </Field>
            <button
              className="secondary"
              onClick={() => {
                try {
                  setComponents(scale(components, target));
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            >
              Пересчитать
            </button>
          </div>
          <div className="actions">
            <button disabled={busy} onClick={() => void save(false)}>
              Сохранить рецептуру
            </button>
            {editing && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void save(true)}
              >
                <Copy size={17} /> Сохранить новой версией
              </button>
            )}
            <button className="subtle" onClick={() => setEditing(undefined)}>
              Закрыть
            </button>
          </div>
        </section>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">РЕЦЕПТУРЫ ДЛЯ СЛЕДУЮЩЕГО ЗАМЕСА</div>
          <h1>Рецептуры</h1>
          <p>
            {latest.size} составов · поиск по Pantone, базовой краске и
            источнику.
          </p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setTransfer(!transfer)}>
            <Upload size={17} /> Загрузить базу
          </button>
          <button onClick={() => open(null)}>
            <Plus size={18} /> Новая рецептура
          </button>
        </div>
      </div>
      {(transfer || !recipes.length) && (
        <RecipeTransfer
          recipes={recipes}
          inks={inks}
          onChange={onChange}
          onError={onError}
        />
      )}
      <div className="library-toolbar">
        <div className="order-search">
          <Search size={19} />
          <input
            aria-label="Найти рецептуру"
            placeholder="Pantone, название, база или документ"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(36);
            }}
          />
        </div>
        <Field label="Источник рецептуры">
          <select
            aria-label="Источник рецептуры"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setLimit(36);
            }}
          >
            <option value="ALL">Все источники</option>
            {Object.entries(sourceNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="library-count">
        <span>Найдено: {filtered.length}</span>
        <label>
          <input
            type="checkbox"
            checked={allVersions}
            onChange={(e) => setAllVersions(e.target.checked)}
          />{" "}
          Показывать все версии
        </label>
      </div>
      {selected && (
        <section
          className="card recipe-selected"
          aria-label="Выбранная рецептура"
        >
          <div className="card-heading">
            <div>
              <span className="tag">
                {sourceNames[selected.source]} · v{selected.version}
              </span>
              <h2>{selected.name}</h2>
              <p>
                {selected.pantone} · {date(selected.createdAt)}
              </p>
            </div>
            <button className="subtle" onClick={() => setSelectedId("")}>
              Закрыть состав
            </button>
          </div>
          <p className="hint preserve-lines">
            {selected.sourceNote || "Собственная производственная рецептура"}
          </p>
          <RecipeMix
            key={selected.id}
            recipe={selected}
            inks={inks}
            action="Создать заказ по рецептуре"
            onUse={(_, grams) => {
              location.hash = `orders?recipe=${encodeURIComponent(selected.id)}&mass=${encodeURIComponent(grams)}`;
            }}
          />
          <button className="subtle" onClick={() => open(selected)}>
            Редактировать / создать версию
          </button>
        </section>
      )}
      <div className="recipe-library-grid">
        {filtered.slice(0, limit).map((r) => (
          <button
            className={`card recipe-library-card ${selectedId === r.id ? "selected-record" : ""}`}
            key={r.id}
            onClick={() => setSelectedId(r.id)}
          >
            <div className="card-heading">
              <span className="tag">{sourceNames[r.source]}</span>
              <small>v{r.version}</small>
            </div>
            <h2>{r.pantone || "Собственный цвет"}</h2>
            <p>{r.name}</p>
            <div className="recipe-ingredients">
              {r.components.slice(0, 3).map((c) => (
                <span key={c.inkId}>
                  {inks.find((i) => i.id === c.inkId)?.name || c.inkId}
                </span>
              ))}
              {r.components.length > 3 && (
                <span>+{r.components.length - 3}</span>
              )}
            </div>
            <div className="recipe-card-bottom">
              <small>
                {r.components.length} баз · {total(r.components)} г
              </small>
              <span>Открыть состав →</span>
            </div>
          </button>
        ))}
      </div>
      {filtered.length > limit && (
        <button className="secondary wide" onClick={() => setLimit(limit + 36)}>
          Показать ещё 36 рецептур
        </button>
      )}
      {!filtered.length && (
        <section className="card empty-state">
          <BookOpen size={30} />
          <h2>
            {search || sourceFilter !== "ALL"
              ? "Нет подходящих рецептур"
              : "Библиотека начинается с ваших составов"}
          </h2>
          <p>
            {search || sourceFilter !== "ALL"
              ? "Измените запрос или выберите другой источник."
              : "Загрузите таблицу или сохраните удачный замес из заказа."}
          </p>
        </section>
      )}
    </>
  );
}
function SafeComposition({
  components,
  inks,
}: {
  components: Component[];
  inks: Ink[];
}) {
  try {
    return <Composition value={normalize(components)} inks={inks} />;
  } catch {
    return <p className="hint">Введите массы до 3 знаков после запятой.</p>;
  }
}
