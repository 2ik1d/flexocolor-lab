import { it, expect } from "vitest";
import { ColorCorrectionEngine, type CorrectionInput } from "./engine";
it("не придумывает добавки", () => {
  const result = new ColorCorrectionEngine().calculate({} as CorrectionInput);
  expect(result.status).toBe("INSUFFICIENT_CALIBRATION_DATA");
  expect(result.additions).toEqual([]);
  expect(result.predicted).toBeNull();
  expect(result.uncertainty).toBeNull();
});
