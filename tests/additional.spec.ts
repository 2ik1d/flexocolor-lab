import { test, expect } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.E2E_BASE_PATH || "/";
test("два фото, ROI, изменение анализа и недоступная камера", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto(BASE + "#quick");
  await page.getByRole("button", { name: "Два снимка", exact: true }).click();
  const buffer = await sharp({
    create: { width: 300, height: 300, channels: 3, background: "#75552e" },
  })
    .png()
    .toBuffer();
  for (const label of ["Эталон", "Оттиск"]) {
    const editor = page
      .locator(".photo-editor")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await editor
      .getByLabel(`Загрузить ${label}`, { exact: true })
      .setInputFiles({ name: "test.png", mimeType: "image/png", buffer });
    await editor
      .getByRole("button", { name: "Увеличить", exact: true })
      .click();
    await expect(editor.getByText("150%", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "+ Область в центре" }).click();
    await editor.getByRole("button", { name: "Анализировать области" }).click();
  }
  await expect(page.locator(".delta strong")).toHaveText("0.00");
  const target = page.locator(".photo-editor").first();
  await target.getByLabel("width области 1", { exact: true }).fill("15");
  await expect(page.locator(".delta strong")).toHaveCount(0);
  await target.getByRole("button", { name: "Камера в браузере" }).click();
  await expect(page.getByRole("alert")).toContainText("Камера недоступна");
});
test("профиль повторяемости и пользовательская краска", async ({ page }) => {
  await page.goto(BASE + "#inks");
  await page
    .getByRole("button", { name: "Добавить краску", exact: true })
    .click();
  await page
    .getByLabel("Название краски", { exact: true })
    .fill("ТЕСТ новая база");
  await page
    .getByRole("button", { name: "Сохранить краску", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ новая база" }),
  ).toBeVisible();
  await page.goto(BASE + "#calibration");
  await page.getByLabel("Название установки").fill("ТЕСТ установка");
  await page.getByLabel("Идентификатор установки / освещения").fill("TEST-1");
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#857969" },
  })
    .png()
    .toBuffer();
  for (let i = 0; i < 3; i++) {
    await page
      .getByLabel("Загрузить Контрольная область", { exact: true })
      .setInputFiles({ name: `test-${i}.png`, mimeType: "image/png", buffer });
    await page.getByRole("button", { name: "+ Область в центре" }).click();
    await page
      .getByRole("button", { name: "Записать контрольную область" })
      .click();
  }
  await expect(
    page.getByRole("button", { name: "Сохранить профиль", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Сохранить профиль", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Использовать профиль", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Активный профиль", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ установка", exact: true }),
  ).toBeVisible();
});
test("отклонение несовместимых условий Lab и защита импорта", async ({
  page,
}) => {
  await page.goto(BASE + "#quick");
  await page.getByRole("button", { name: "Lab / CSV", exact: true }).click();
  for (const label of ["Эталон", "Оттиск"])
    for (const [coord, value] of [
      ["L*", "50"],
      ["a*", "0"],
      ["b*", "0"],
    ])
      await page.getByLabel(`${label} ${coord}`, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Принять Lab", exact: true })
    .nth(0)
    .click();
  await page.getByLabel("Белая точка Lab").selectOption("D65");
  await page
    .getByRole("button", { name: "Принять Lab", exact: true })
    .nth(1)
    .click();
  await expect(
    page.getByText("Условия или типы измерений различаются.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сохранить пробу", exact: true }),
  ).toBeDisabled();
  await page.goto(BASE + "#settings");
  await page.getByLabel("Импорт резервной копии").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"wrong":true}'),
  });
  await expect(page.getByRole("alert")).toContainText("Копия не принята");
  await expect(
    page.getByRole("button", { name: "Восстановить базу" }),
  ).toHaveCount(0);
});
test("визуальная проверка мобильного и настольного экранов", async ({
  page,
}, testInfo) => {
  await page.goto(BASE + "#quick");
  await expect(
    page.getByRole("heading", { name: "Быстрая приладка." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Заказы" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
