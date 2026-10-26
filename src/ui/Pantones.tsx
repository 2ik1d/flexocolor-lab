import { useState } from "react";
import { id, now, type Pantone, type Settings } from "../domain/types";
import { pantoneKey } from "../domain/pantones";
import { savePantone } from "../storage/db";
import { Field, date } from "./common";
import { ReferenceEditor } from "./ReferenceEditor";
import { MeasurementCard } from "./Compare";
import { SamplePhotos } from "./Records";

export function Pantones({
  pantones,
  settings,
  onChange,
  onError,
}: {
  pantones: Pantone[];
  settings: Settings;
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
  const selected = pantones.find((p) => p.id === selectedId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ЭТАЛОНЫ И ПОВТОРЫ</div>
          <h1>База Pantone</h1>
          <p>
            Цвета из заказов появляются здесь автоматически. Эталоны можно
            использовать снова.
          </p>
        </div>
        <button onClick={() => setCreating(!creating)}>Добавить Pantone</button>
      </div>
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
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="record-grid">
        {pantones
          .filter((p) =>
            `${p.pantone} ${p.name} ${p.notes}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .sort((a, b) =>
            a.pantone.localeCompare(b.pantone, "ru", { numeric: true }),
          )
          .map((p) => (
            <button
              key={p.id}
              className={`card record ${p.id === selectedId ? "selected-record" : ""}`}
              onClick={() => {
                setSelectedId(p.id);
                setEditing(false);
              }}
            >
              <span className="tag">
                {p.currentReferenceId ? "Эталон сохранён" : "Нужен эталон"}
              </span>
              <h3>{p.pantone}</h3>
              <p>{p.name || "Цвет из справочника"}</p>
              <small>Эталонов: {p.references.length} · Просмотреть</small>
            </button>
          ))}
      </div>
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
