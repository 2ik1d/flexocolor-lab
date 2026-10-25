import type { RGB } from "../domain/types";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Filters {
  dark: number;
  glare: number;
  outlier: number;
  heterogeneity: number;
}
export const defaultFilters: Filters = {
  dark: 8,
  glare: 248,
  outlier: 45,
  heterogeneity: 12,
};
const median = (a: number[]) => {
  const s = [...a].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export function analyzePixels(
  data: Uint8ClampedArray,
  filters = defaultFilters,
) {
  const accepted: RGB[] = [];
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const p: RGB = [data[i], data[i + 1], data[i + 2]];
    if (
      data[i + 3] < 250 ||
      Math.max(...p) <= filters.dark ||
      Math.min(...p) >= filters.glare
    )
      continue;
    accepted.push(p);
  }
  if (!accepted.length)
    throw Error("Нет пригодных пикселей. Измените область или фильтры.");
  const med = [0, 1, 2].map((c) => median(accepted.map((p) => p[c]))) as RGB;
  const clean = accepted.filter(
    (p) => Math.hypot(...p.map((v, i) => v - med[i])) <= filters.outlier,
  );
  if (clean.length < 16)
    throw Error("Для анализа нужно хотя бы 16 пригодных пикселей");
  const mean = [0, 1, 2].map(
    (c) => clean.reduce((s, p) => s + p[c], 0) / clean.length,
  ) as RGB;
  const spread = Math.sqrt(
    clean.reduce(
      (s, p) => s + p.reduce((q, v, i) => q + (v - mean[i]) ** 2, 0),
      0,
    ) / clean.length,
  );
  return {
    mean,
    median: [0, 1, 2].map((c) => median(clean.map((p) => p[c]))) as RGB,
    spread,
    pixels: clean.length,
    excluded: 1 - clean.length / n,
    heterogeneous: spread > filters.heterogeneity,
  };
}
export async function decodeImage(file: Blob) {
  if (file.size > 35 * 1024 * 1024) throw Error("Файл больше 35 МБ");
  if (!file.type.startsWith("image/"))
    throw Error(
      "Выберите изображение JPEG, PNG или другой поддерживаемый браузером формат",
    );
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    if (typeof createImageBitmap === "function")
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
        colorSpaceConversion: "default",
      });
    else
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image(),
          url = URL.createObjectURL(file);
        im.onload = () => {
          URL.revokeObjectURL(url);
          resolve(im);
        };
        im.onerror = () => {
          URL.revokeObjectURL(url);
          reject(Error());
        };
        im.src = url;
      });
  } catch {
    throw Error("Не удалось прочитать изображение. Попробуйте JPEG или PNG.");
  }
  const w =
      bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width,
    h =
      bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
  if (!w || !h) throw Error("Изображение пустое");
  const ratio = Math.min(1, 2400 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * ratio);
  canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  });
  if (!ctx) throw Error("Canvas недоступен");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap) bitmap.close();
  return canvas;
}
export function sampleRegions(
  canvas: HTMLCanvasElement,
  rects: Rect[],
  filters: Filters,
) {
  const ctx = canvas.getContext("2d", {
    colorSpace: "srgb",
    willReadFrequently: true,
  });
  if (!ctx) throw Error("Canvas недоступен");
  const w = canvas.width,
    h = canvas.height,
    mask = new Uint8Array(w * h);
  for (const r of rects) {
    const left = Math.max(0, Math.floor(r.x * w)),
      top = Math.max(0, Math.floor(r.y * h)),
      right = Math.min(w, Math.ceil((r.x + r.width) * w)),
      bottom = Math.min(h, Math.ceil((r.y + r.height) * h));
    if (right <= left || bottom <= top) continue;
    for (let y = top; y < bottom; y++)
      mask.fill(1, y * w + left, y * w + right);
  }
  const count = mask.reduce((s, v) => s + v, 0);
  if (!count) throw Error("Выделите область для анализа");
  const stride = Math.max(1, Math.ceil(count / 150000)),
    pixels = new Uint8ClampedArray(Math.ceil(count / stride) * 4),
    data = ctx.getImageData(0, 0, w, h).data;
  let selected = 0,
    n = 0;
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    if (selected++ % stride !== 0) continue;
    pixels.set(data.subarray(k * 4, k * 4 + 4), n * 4);
    n++;
  }
  return analyzePixels(pixels.subarray(0, n * 4), filters);
}
export async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia)
    throw Error("Камера недоступна. Используйте загрузку фотографии.");
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    throw Error(
      "Доступ к камере отклонён или камера занята. Используйте загрузку фотографии.",
    );
  }
}
