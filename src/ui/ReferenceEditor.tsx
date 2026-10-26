import { useState } from "react";
import {
  id,
  now,
  type Settings,
  type Measurement,
  type OrderReference,
} from "../domain/types";
import { PhotoEditor, type PhotoSelection } from "./PhotoEditor";
import { MeasurementCard, SpectroInput } from "./Compare";
import { Field, ConditionsEditor } from "./common";
export function ReferenceEditor({
  settings,
  onSave,
  onClose,
  onError,
}: {
  settings: Settings;
  onSave: (
    ref: OrderReference,
    photos: PhotoSelection["photo"][],
  ) => Promise<void>;
  onClose: () => void;
  onError: (s: string) => void;
}) {
  const [selection, setSelection] = useState<PhotoSelection>(),
    [measurement, setMeasurement] = useState<Measurement>(),
    [kind, setKind] = useState<"photo" | "lab">("photo"),
    [name, setName] = useState("Исходный эталон"),
    [conditions, setConditions] = useState(settings.conditions),
    [busy, setBusy] = useState(false);
  return (
    <section className="reference-editor">
      <div className="card">
        <div className="card-heading">
          <h3>Сохранить эталон</h3>
          <button className="subtle" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <Field label="Название эталона">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="segmented">
          <button
            className={kind === "photo" ? "active" : ""}
            onClick={() => {
              setKind("photo");
              setMeasurement(undefined);
            }}
          >
            Фотография
          </button>
          <button
            className={kind === "lab" ? "active" : ""}
            onClick={() => {
              setKind("lab");
              setSelection(undefined);
              setMeasurement(undefined);
            }}
          >
            Lab / CSV
          </button>
        </div>
        {kind === "lab" && (
          <>
            <ConditionsEditor value={conditions} onChange={setConditions} />
            <SpectroInput
              title="Эталон заказа"
              conditions={conditions}
              onMeasurement={setMeasurement}
              onError={onError}
            />
          </>
        )}
      </div>
      {kind === "photo" && (
        <PhotoEditor
          compact
          label="Эталон заказа"
          onInvalidate={() => {
            setSelection(undefined);
            setMeasurement(undefined);
          }}
          onAnalyze={(s) => {
            const m = {
              ...s.measurement,
              profileId: settings.profileId || undefined,
              conditions: {
                ...settings.conditions,
                whitePoint: "D50" as const,
                observer: "2" as const,
              },
            };
            setSelection({ ...s, measurement: m });
            setMeasurement(m);
          }}
          onError={onError}
        />
      )}
      {measurement && (
        <section className="card">
          <MeasurementCard title="Выбранный эталон" measurement={measurement} />
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!name.trim()) throw Error("Укажите название эталона");
                await onSave(
                  {
                    id: id(),
                    createdAt: now(),
                    name: name.trim(),
                    measurement,
                    photoIds: selection ? [selection.photo.id] : [],
                  },
                  selection ? [selection.photo] : [],
                );
              } catch (e) {
                onError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить эталон заказа
          </button>
        </section>
      )}
    </section>
  );
}
