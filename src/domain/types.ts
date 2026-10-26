import { z } from "zod";
export const massSchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/)
  .refine((v) => Number(v) <= 1e9, "Слишком большая масса");
export const componentSchema = z.object({
  inkId: z.string().min(1),
  grams: massSchema,
});
export const labSchema = z.object({
  l: z.number().min(0).max(100),
  a: z.number().min(-200).max(200),
  b: z.number().min(-200).max(200),
});
export type Lab = z.infer<typeof labSchema>;
export type RGB = [number, number, number];
export const conditionsSchema = z.object({
  illuminant: z.string().min(1),
  observer: z.enum(["2", "10"]),
  geometry: z.string(),
  mode: z.enum(["unknown", "M0", "M1", "M2", "M3"]),
  setup: z.string(),
  whitePoint: z.enum(["D50", "D65"]),
});
export const statsSchema = z.object({
  mean: z.tuple([z.number(), z.number(), z.number()]),
  median: z.tuple([z.number(), z.number(), z.number()]),
  spread: z.number(),
  pixels: z.number().int().nonnegative(),
  excluded: z.number().min(0).max(1),
  heterogeneous: z.boolean(),
});
export const measurementSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: z.enum([
    "PHOTO_UNCALIBRATED",
    "PHOTO_CALIBRATED",
    "SPECTRO_LAB",
    "SPECTRO_SPECTRAL",
  ]),
  lab: labSchema,
  conditions: conditionsSchema,
  captureId: z.string().optional(),
  regions: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      }),
    )
    .optional(),
  filters: z
    .object({
      dark: z.number(),
      glare: z.number(),
      outlier: z.number(),
      heterogeneity: z.number(),
    })
    .optional(),
  profileId: z.string().optional(),
  calibrationId: z.string().optional(),
  stats: statsSchema.optional(),
  spectral: z
    .array(
      z.object({
        nm: z.number().min(300).max(900),
        value: z.number().min(0).max(1),
      }),
    )
    .optional(),
});
export type Measurement = z.infer<typeof measurementSchema>;
export type Conditions = z.infer<typeof conditionsSchema>;
export const inkSchema = z.object({
  id: z.string(),
  manufacturer: z.string().min(1),
  name: z.string().min(1),
  code: z.string(),
  type: z.string(),
  group: z.string(),
  lot: z.string(),
  createdAt: z.string(),
  notes: z.string(),
  calibration: z.array(z.string()),
});
export const recipeSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  version: z.number().int().positive(),
  name: z.string().min(1),
  pantone: z.string(),
  source: z.enum(["OWN", "SUPPLIER", "PANTONE"]),
  sourceNote: z.string(),
  components: z.array(componentSchema).min(1),
  createdAt: z.string(),
});
export const sampleSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  target: measurementSchema,
  current: measurementSchema,
  photoIds: z.array(z.string()),
  additionIds: z.array(z.string()).optional(),
  referenceId: z.string().optional(),
  components: z.array(componentSchema),
  comment: z.string(),
});
export const additionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  component: componentSchema,
  comment: z.string(),
});
export const batchSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  pantone: z.string(),
  createdAt: z.string(),
  initial: z.array(componentSchema).min(1),
  additions: z.array(additionSchema),
  samples: z.array(sampleSchema),
  comment: z.string(),
  status: z.enum(["ACTIVE", "DONE"]),
  orderId: z.string().optional(),
  referenceId: z.string().optional(),
  runDate: z.string().optional(),
  shift: z.string().optional(),
  production: z
    .object({
      material: z.string().optional(),
      anilox: z.string().optional(),
      uv: z.string().optional(),
      speed: z.number().optional(),
    })
    .optional(),
});
export const profileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.string(),
  conditions: conditionsSchema,
  controls: z.array(measurementSchema),
  maxRepeatDelta: z.number().nonnegative(),
  notes: z.string(),
  kind: z.literal("REPEATABILITY_ONLY"),
});
export const experimentSchema = z.object({
  id: z.string(),
  batchId: z.string(),
  before: z.array(componentSchema),
  after: z.array(componentSchema),
  beforeMeasurement: measurementSchema,
  afterMeasurement: measurementSchema,
  additions: z.array(additionSchema),
  excluded: z.boolean(),
  qualityWarnings: z.array(z.string()),
});
export const photoSchema = z.object({
  id: z.string(),
  name: z.string(),
  dataUrl: z.string().startsWith("data:image/"),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const settingsSchema = z.object({
  id: z.literal("settings"),
  tolerance: z.number().positive().nullable(),
  profileId: z.string(),
  conditions: conditionsSchema,
});
export const orderReferenceSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  name: z.string().min(1),
  measurement: measurementSchema,
  photoIds: z.array(z.string()),
});
export const orderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string(),
  customer: z.string(),
  pantone: z.string(),
  createdAt: z.string(),
  notes: z.string(),
  references: z.array(orderReferenceSchema),
  currentReferenceId: z.string(),
});
export const backupSchema = z.object({
  format: z.literal("FlexoColorLab"),
  version: z.literal(3),
  exportedAt: z.string(),
  inks: z.array(inkSchema),
  recipes: z.array(recipeSchema),
  batches: z.array(batchSchema),
  profiles: z.array(profileSchema),
  experiments: z.array(experimentSchema),
  photos: z.array(photoSchema),
  settings: z.array(settingsSchema),
  orders: z.array(orderSchema),
});
export type Order = z.infer<typeof orderSchema>;
export type OrderReference = z.infer<typeof orderReferenceSchema>;
export type Component = z.infer<typeof componentSchema>;
export type Ink = z.infer<typeof inkSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type Sample = z.infer<typeof sampleSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Experiment = z.infer<typeof experimentSchema>;
export type Photo = z.infer<typeof photoSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export const defaultConditions: Conditions = {
  illuminant: "D50",
  observer: "2",
  geometry: "неизвестна",
  mode: "unknown",
  setup: "",
  whitePoint: "D50",
};
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
