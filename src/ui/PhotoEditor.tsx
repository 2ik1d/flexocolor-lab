import { useRef, useState, useEffect } from "react";
import {
  Camera,
  Upload,
  ZoomIn,
  ZoomOut,
  Trash2,
  Move,
  Scan,
} from "lucide-react";
import {
  decodeImage,
  sampleRegions,
  requestCamera,
  defaultFilters,
  type Rect,
  type Filters,
} from "../images/analyze";
import {
  id,
  type Photo,
  type Measurement,
  now,
  defaultConditions,
} from "../domain/types";
import { rgbToLab } from "../color/color";
import { Field, Notice } from "./common";
export interface PhotoSelection {
  photo: Photo;
  measurement: Measurement;
}
export function PhotoEditor({
  label,
  twoRegions = false,
  onAnalyze,
  onControl,
  onError,
  onInvalidate,
}: {
  label: string;
  twoRegions?: boolean;
  onAnalyze: (a: PhotoSelection, b?: PhotoSelection) => void;
  onControl?: (a: Measurement) => void;
  onError: (s: string) => void;
  onInvalidate?: () => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement>(),
    [photo, setPhoto] = useState<Photo>(),
    [rects, setRects] = useState<(Rect & { role: "target" | "current" })[]>([]),
    [role, setRole] = useState<"target" | "current">("target"),
    [zoom, setZoom] = useState(1),
    [tool, setTool] = useState<"select" | "pan">("select"),
    [filters, setFilters] = useState<Filters>(defaultFilters),
    [stream, setStream] = useState<MediaStream>(),
    [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    surface = useRef<HTMLDivElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<
      | { x: number; y: number; left: number; top: number; index?: number }
      | undefined
    >(undefined);
  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);
  useEffect(() => {
    onInvalidate?.();
  }, [photo, rects, filters]);
  async function load(file: Blob, name: string) {
    setBusy(true);
    try {
      const c = await decodeImage(file);
      setCanvas(c);
      setPhoto({
        id: id(),
        name,
        dataUrl: c.toDataURL("image/png"),
        width: c.width,
        height: c.height,
      });
      setRects([]);
      setZoom(1);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const coords = (e: React.PointerEvent) => {
    const r = surface.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  function down(e: React.PointerEvent) {
    if (!canvas) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = coords(e);
    if (tool === "pan") {
      gesture.current = {
        x: e.clientX,
        y: e.clientY,
        left: viewport.current!.scrollLeft,
        top: viewport.current!.scrollTop,
      };
    } else {
      const index = rects.length;
      gesture.current = { ...p, left: 0, top: 0, index };
      setRects([...rects, { ...p, width: 0, height: 0, role }]);
    }
  }
  function move(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g) return;
    if (tool === "pan") {
      viewport.current!.scrollLeft = g.left - (e.clientX - g.x);
      viewport.current!.scrollTop = g.top - (e.clientY - g.y);
      return;
    }
    const p = coords(e);
    setRects((rs) =>
      rs.map((r, i) =>
        i === g.index
          ? {
              ...r,
              x: Math.min(p.x, g.x),
              y: Math.min(p.y, g.y),
              width: Math.abs(p.x - g.x),
              height: Math.abs(p.y - g.y),
            }
          : r,
      ),
    );
  }
  function analyze() {
    try {
      if (!canvas || !photo) throw Error("Загрузите фотографию");
      const measurement = (rs: Rect[]): Measurement => {
        const stats = sampleRegions(canvas, rs, filters);
        return {
          id: id(),
          createdAt: now(),
          source: "PHOTO_UNCALIBRATED",
          conditions: { ...defaultConditions },
          captureId: photo.id,
          regions: rs,
          filters: { ...filters },
          lab: rgbToLab(stats.median),
          stats,
        };
      };
      const target = measurement(rects.filter((r) => r.role === "target"));
      if (onControl) {
        onControl(target);
        return;
      }
      onAnalyze(
        { photo, measurement: target },
        twoRegions
          ? {
              photo,
              measurement: measurement(
                rects.filter((r) => r.role === "current"),
              ),
            }
          : undefined,
      );
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <section className="card photo-editor">
      <div className="card-heading">
        <h3>{label}</h3>
        <span className="tag">sRGB → Lab D50 / 2°</span>
      </div>
      <div className="actions">
        <label className="button secondary">
          <Upload size={17} />
          Загрузить
          <input
            aria-label={`Загрузить ${label}`}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f, f.name);
              e.target.value = "";
            }}
          />
        </label>
        <label className="button secondary">
          <Camera size={17} />
          Снять
          <input
            aria-label={`Снять ${label}`}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f, f.name);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="subtle"
          onClick={async () => {
            try {
              setStream(await requestCamera());
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Камера в браузере
        </button>
      </div>
      {stream && (
        <div>
          <video ref={video} autoPlay muted playsInline />
          <div className="actions">
            <button
              onClick={() => {
                if (!video.current) return;
                const v = video.current;
                if (!v.videoWidth) return;
                const c = document.createElement("canvas");
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                c.getContext("2d")!.drawImage(v, 0, 0);
                c.toBlob((b) => {
                  if (b) void load(b, "Снимок камеры");
                });
                stream.getTracks().forEach((t) => t.stop());
                setStream(undefined);
              }}
            >
              Сохранить кадр
            </button>
            <button
              className="secondary"
              onClick={() => {
                stream.getTracks().forEach((t) => t.stop());
                setStream(undefined);
              }}
            >
              Закрыть камеру
            </button>
          </div>
        </div>
      )}
      {busy && <p>Декодирование изображения…</p>}
      {photo ? (
        <>
          <div className="photo-toolbar">
            <button
              className="icon-button"
              aria-label="Уменьшить"
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            >
              <ZoomOut size={20} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              className="icon-button"
              aria-label="Увеличить"
              onClick={() => setZoom(Math.min(5, zoom + 0.5))}
            >
              <ZoomIn size={20} />
            </button>
            <button
              className={tool === "select" ? "selected secondary" : "secondary"}
              onClick={() => setTool("select")}
            >
              <Scan size={17} />
              Выделить
            </button>
            <button
              className={tool === "pan" ? "selected secondary" : "secondary"}
              onClick={() => setTool("pan")}
            >
              <Move size={17} />
              Сдвиг
            </button>
          </div>
          {twoRegions && (
            <div className="segmented">
              <button
                className={role === "target" ? "active" : ""}
                onClick={() => setRole("target")}
              >
                Эталон
              </button>
              <button
                className={role === "current" ? "active" : ""}
                onClick={() => setRole("current")}
              >
                Оттиск
              </button>
            </div>
          )}
          <p className="hint">
            Проведите по фото для выбора области. Можно добавить несколько;
            наложения считаются один раз.
          </p>
          <div className="photo-viewport" ref={viewport}>
            <div
              className="photo-surface"
              ref={surface}
              style={{ width: `${zoom * 100}%` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => {
                gesture.current = undefined;
              }}
              onPointerCancel={() => {
                gesture.current = undefined;
              }}
            >
              <img src={photo.dataUrl} draggable={false} alt={label} />
              {rects.map((r, i) => (
                <div
                  key={i}
                  className={`roi ${r.role}`}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                  }}
                >
                  <span>
                    {r.role === "target" ? "Э" : "О"}
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {rects.map((r, i) => (
            <div className="roi-row" key={i}>
              <span>
                {r.role === "target" ? "Эталон" : "Оттиск"} {i + 1}
              </span>
              {(["x", "y", "width", "height"] as const).map((key, j) => (
                <label key={key}>
                  {["X", "Y", "Ш", "В"][j]} %
                  <input
                    aria-label={`${key} области ${i + 1}`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={+(r[key] * 100).toFixed(1)}
                    onChange={(e) =>
                      setRects((rs) =>
                        rs.map((v, k) =>
                          k === i
                            ? {
                                ...v,
                                [key]: Math.max(
                                  0,
                                  Math.min(1, Number(e.target.value) / 100),
                                ),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              <button
                className="icon-button"
                aria-label="Удалить область"
                onClick={() => setRects(rects.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            className="subtle"
            onClick={() =>
              setRects([
                ...rects,
                { x: 0.25, y: 0.25, width: 0.2, height: 0.2, role },
              ])
            }
          >
            + Область в центре
          </button>
        </>
      ) : (
        <div className="photo-empty">
          <Scan size={40} />
          <strong>Эталон и оттиск рядом</strong>
          <span>Ровное освещение · без бликов · одна плоскость</span>
        </div>
      )}
      <details>
        <summary>Фильтры пикселей</summary>
        <div className="form-grid">
          {(["dark", "glare", "outlier", "heterogeneity"] as const).map(
            (key, i) => (
              <Field
                key={key}
                label={
                  [
                    "Исключать тёмные ≤ (RGB)",
                    "Блики: все каналы ≥ (RGB)",
                    "Отклонение от медианы (RGB)",
                    "Порог неоднородности (RGB)",
                  ][i]
                }
              >
                <input
                  type="number"
                  min="0"
                  max="442"
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters({ ...filters, [key]: Number(e.target.value) })
                  }
                />
              </Field>
            ),
          )}
        </div>
        <p className="hint">
          Яркий одиночный канал может быть насыщенным цветом и не исключается
          как блик. Фильтры эвристические.
        </p>
      </details>
      <button className="wide" disabled={!photo || busy} onClick={analyze}>
        {onControl ? "Записать контрольную область" : "Анализировать области"}
      </button>
      <Notice>
        Оценка по фотографии не заменяет спектрофотометр. Используйте ровный
        свет, одинаковую подложку и участки без бликов.
      </Notice>
      <details>
        <summary>О точности фотоанализа</summary>
        <p className="hint">
          Браузер учитывает ориентацию и цветовой профиль, насколько это
          поддерживается на устройстве. Изображение приводится к sRGB;
          неизвестный или неподдерживаемый профиль может исказить оценку.
          Максимальный размер — 2400 px. Для больших областей используется
          равномерная выборка до 150 000 пикселей. Число пикселей и доля
          исключений относятся к этой выборке.
        </p>
      </details>
    </section>
  );
}
