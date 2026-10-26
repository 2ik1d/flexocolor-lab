import { useEffect, useRef, useState } from "react";
import {
  id,
  now,
  type Pantone,
  type Settings,
  type Batch,
  type Ink,
  type Recipe,
} from "../domain/types";
import { ColorKnowledge } from "./ColorKnowledge";
import { pantoneKey } from "../domain/pantones";
import { savePantone } from "../storage/db";
import { Field, date } from "./common";
import { ReferenceEditor } from "./ReferenceEditor";
import { MeasurementCard } from "./Compare";
import { SamplePhotos } from "./Records";

export function Pantones({
  pantones,
  settings,
  recipes,
  batches,
  inks,
  onChange,
  onError,
}: {
  pantones: Pantone[];
  settings: Settings;
  recipes: Recipe[];
  batches: Batch[];
  inks: Ink[];
  onChange: () => void;
  onError: (s: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [creating, setCreating] = useState(false),
    [number, setNumber] = useState(""),
    [notes, setNotes] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(96),
    [edition, setEdition] = useState("all"),
    [content, setContent] = useState("all");
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId) detail.current?.scrollIntoView({ block: "start" });
  }, [selectedId]);
  const recipeCounts = new Map<string, Set<string>>();
  recipes.forEach((r) => {
    const key = pantoneKey(r.pantone);
    const families = recipeCounts.get(key) || new Set<string>();
    families.add(r.familyId);
    recipeCounts.set(key, families);
  });
  const searchKey = search.replace(/\s+/g, "").toLowerCase();
  const filtered = pantones.filter(
    (p) =>
      (edition !== "2026" || p.catalog?.edition === "2026") &&
      (content === "all" ||
        (content === "recipes"
          ? recipeCounts.has(p.id)
          : !!p.currentReferenceId)) &&
      `${p.pantone} ${p.name} ${p.notes}`
        .replace(/\s+/g, "")
        .toLowerCase()
        .includes(searchKey),
  );
  const selected = pantones.find((p) => p.id === selectedId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЭТАЛОНЫ И ПОВТОРЫ</div>
          <h1>Веер Pantone · Coated</h1>
          <p>
            {pantones.length.toLocaleString("ru")} готовых экранных образцов · в
            том числе 224 новых цвета 2026 года. Ваши эталоны и составы
            сохраняются рядом.
          </p>
        </div>
        <button onClick={() => setCreating(!creating)}>Добавить Pantone</button>
      </div>
      <Field label="Показывать в веере">
        <select
          aria-label="Показывать в веере"
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setLimit(96);
          }}
        >
          <option value="all">Все цвета</option>
          <option value="recipes">
            Только с рецептурой · {recipeCounts.size}
          </option>
          <option value="references">Только с моим эталоном</option>
        </select>
      </Field>
      {creating && (
        <section className="card">
          <Field label="Номер Pantone">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="185 C"
            />
          </Field>
          <Field label="Примечание к Pantone">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!pantoneKey(number)) throw Error("Укажите Pantone");
                if (pantones.some((p) => p.id === pantoneKey(number)))
                  throw Error(
                    "Этот Pantone уже есть в базе — откройте его карточку",
                  );
                const entry: Pantone = {
                  id: id(),
                  pantone: number.trim(),
                  name: "",
                  createdAt: now(),
                  notes,
                  references: [],
                  currentReferenceId: "",
                };
                await savePantone(entry);
                setSelectedId(pantoneKey(number));
                setEditing(true);
                setCreating(false);
                setNumber("");
                setNotes("");
                onChange();
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить Pantone
          </button>
        </section>
      )}
      <input
        className="search"
        aria-label="Найти Pantone"
        placeholder="Номер, название или примечание…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(96);
        }}
      />
      <div className="segmented">
        <button
          className={edition === "all" ? "active" : ""}
          onClick={() => {
            setEdition("all");
            setLimit(96);
          }}
        >
          Весь веер
        </button>
        <button
          className={edition === "2026" ? "active" : ""}
          onClick={() => {
            setEdition("2026");
            setLimit(96);
          }}
        >
          Новинки 2026 · 224
        </button>
      </div>
      <p className="hint">
        Найдено: {filtered.length}. Экранные образцы из опубликованных наборов;
        не заменяют физический веер и измерения прибора.
      </p>
      {selected && (
        <section ref={detail} className="card fan-selected">
          <button className="subtle" onClick={() => setSelectedId("")}>
            Закрыть карточку
          </button>
          <ColorKnowledge
            pantone={selected.pantone}
            pantones={pantones}
            recipes={recipes}
            batches={batches}
            inks={inks}
          />
        </section>
      )}
      <div className="fan-grid">
        {filtered
          .sort((a, b) =>
            a.pantone.localeCompare(b.pantone, "ru", { numeric: true }),
          )
          .slice(0, limit)
          .map((p) => (
            <button
              key={p.id}
              className={`card record ${p.id === selectedId ? "selected-record" : ""}`}
              onClick={() => {
                setSelectedId(p.id);
                setEditing(false);
              }}
            >
              <div
                className="fan-chip"
                style={{ background: p.catalog?.hex || "#33404b" }}
              />
              <span className="tag">
                {p.currentReferenceId
                  ? "Ваш эталон"
                  : p.catalog?.edition === "2026"
                    ? "Новинка 2026"
                    : "Coated"}
              </span>
              <h3>{p.pantone}</h3>
              <p>{p.name || "Цвет из справочника"}</p>
              <small>
                Рецептур: {recipeCounts.get(p.id)?.size || 0} · эталонов:{" "}
                {p.references.length}
              </small>
              <small>Просмотреть состав →</small>
            </button>
          ))}
      </div>
      {filtered.length > limit && (
        <button className="secondary wide" onClick={() => setLimit(limit + 96)}>
          Показать ещё 96 цветов
        </button>
      )}
      {!pantones.length && <p>Добавьте цвет здесь или при создании заказа.</p>}
      {selected && (
        <section
          className="card library-detail"
          aria-label={`Карточка Pantone ${selected.pantone}`}
        >
          <div className="card-heading">
            <h2>{selected.pantone}</h2>
            <button className="secondary" onClick={() => setEditing(!editing)}>
              Новый эталон Pantone
            </button>
          </div>
          {selected.notes && <p className="preserve-lines">{selected.notes}</p>}
          <a href={`#orders?pantone=${encodeURIComponent(selected.pantone)}`}>
            Создать заказ с этим Pantone
          </a>
          {editing && (
            <ReferenceEditor
              key={selected.id}
              settings={settings}
              onError={onError}
              onClose={() => setEditing(false)}
              onSave={async (reference, photos) => {
                await savePantone(
                  {
                    ...selected,
                    references: [...selected.references, reference],
                    currentReferenceId: reference.id,
                  },
                  photos,
                );
                setEditing(false);
                onChange();
              }}
            />
          )}
          {!selected.references.length && (
            <p>Пока нет измерения. Добавьте фото или Lab эталона.</p>
          )}
          {[...selected.references].reverse().map((r) => (
            <details key={r.id} open={r.id === selected.currentReferenceId}>
              <summary>
                {r.name} · {date(r.createdAt)}
                {r.id === selected.currentReferenceId
                  ? " · Текущий эталон"
                  : ""}
              </summary>
              <MeasurementCard
                title="Эталон Pantone"
                measurement={r.measurement}
              />
              <SamplePhotos ids={r.photoIds} autoLoad />
            </details>
          ))}
        </section>
      )}
    </>
  );
}
