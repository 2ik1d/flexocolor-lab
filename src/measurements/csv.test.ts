import { it, expect } from "vitest";
import { parseMeasurements } from "./csv";
it("импортирует Lab и спектр", () => {
  const [m] = parseMeasurements("L;a;b;R400;R410\n50;1,2;-3;0,4;0,5");
  expect(m.lab.a).toBe(1.2);
  expect(m.source).toBe("SPECTRO_SPECTRAL");
  expect(m.spectral).toHaveLength(2);
});
it.each(["L,a,b\n101,0,0", "L,a,b\n,0,0", "L,a,b,R400\n50,0,0,4", "name\nfoo"])(
  "отклоняет плохой CSV",
  (s) => expect(() => parseMeasurements(s)).toThrow(),
);
