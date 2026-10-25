import { it, expect, vi, afterEach } from "vitest";
import { analyzePixels, requestCamera, decodeImage } from "./analyze";
afterEach(() => vi.unstubAllGlobals());
it("считает статистику и исключения", () => {
  const pixels = new Uint8ClampedArray([
    ...Array(20).fill([100, 80, 50, 255]).flat(),
    255,
    255,
    255,
    255,
    0,
    0,
    0,
    255,
  ]);
  const s = analyzePixels(pixels);
  expect(s.pixels).toBe(20);
  expect(s.median).toEqual([100, 80, 50]);
  expect(s.excluded).toBeCloseTo(2 / 22);
  expect(s.spread).toBe(0);
});
it("отвергает пустое поле", () =>
  expect(() => analyzePixels(new Uint8ClampedArray(80))).toThrow());
it("отсутствующая камера", async () => {
  vi.stubGlobal("navigator", {});
  await expect(requestCamera()).rejects.toThrow("Камера недоступна");
});
it("отказ камеры", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn().mockRejectedValue(new Error("denied")),
    },
  });
  await expect(requestCamera()).rejects.toThrow("отклонён");
});
it("повреждённое изображение", async () => {
  vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error()));
  await expect(
    decodeImage(new Blob(["invalid"], { type: "image/png" })),
  ).rejects.toThrow("Не удалось прочитать");
});
