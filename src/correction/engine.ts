import type {
  Lab,
  Component,
  Ink,
  Experiment,
  Conditions,
} from "../domain/types";
export interface CorrectionInput {
  target: Lab;
  current: Lab;
  composition: Component[];
  mass: string;
  availableInks: Ink[];
  calibration: unknown[];
  history: Experiment[];
  conditions: Conditions;
}
export interface CorrectionResult {
  status: "INSUFFICIENT_CALIBRATION_DATA" | "MODEL_NOT_VALIDATED" | "OK";
  additions: Component[];
  predicted: Lab | null;
  uncertainty: number | null;
  reasons: string[];
  warnings: string[];
}
export interface MixingModel {
  id: string;
  validated: boolean;
  predict(input: CorrectionInput): CorrectionResult;
}
export class ColorCorrectionEngine {
  constructor(private model?: MixingModel) {}
  calculate(input: CorrectionInput): CorrectionResult {
    if (this.model?.validated) return this.model.predict(input);
    return {
      status: this.model
        ? "MODEL_NOT_VALIDATED"
        : "INSUFFICIENT_CALIBRATION_DATA",
      additions: [],
      predicted: null,
      uncertainty: null,
      reasons: [
        "Для расчёта добавок необходимо накопить данные о смешивании красок",
      ],
      warnings: [
        "Автоматические производственные рекомендации отключены до проверки модели.",
      ],
    };
  }
}
