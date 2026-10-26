import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.E2E_BASE_PATH || "/";
async function newOrder(page: Page, name: string) {
  await page.goto(BASE);
  await expect(
    page.getByRole("heading", { name: "Заказы", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page.getByLabel("Название заказа", { exact: true }).fill(name);
  await page.getByLabel("Номер заказа", { exact: true }).fill("З-100");
  await page.getByLabel("Pantone заказа", { exact: true }).fill("185 C");
  await page
    .getByRole("button", { name: "Сохранить заказ", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function labReference(page: Page, l: string) {
  await page.getByRole("button", { name: "Lab / CSV", exact: true }).click();
  for (const [c, v] of [
    ["L*", l],
    ["a*", "10"],
    ["b*", "5"],
  ])
    await page.getByLabel(`Эталон заказа ${c}`, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить эталон заказа", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Новый запуск", exact: true }),
  ).toBeEnabled();
}
async function startRun(
  page: Page,
  date: string,
  shift: string,
  grams: string,
) {
  await page.getByRole("button", { name: "Новый запуск", exact: true }).click();
  await page.getByLabel("Дата запуска", { exact: true }).fill(date);
  await page.getByLabel("Смена", { exact: true }).fill(shift);
  await expect(page.getByLabel("Масса 1", { exact: true })).toHaveValue("");
  await page.getByLabel("Масса 1", { exact: true }).fill(grams);
  await page
    .getByRole("button", { name: "Начать запуск", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Новая проба", exact: true }),
  ).toBeVisible();
}
test("повторный заказ: эталон, отдельные смены, изменённая краска и единая история", async ({
  page,
}) => {
  await newOrder(page, "ТЕСТ Этикетка молока");
  const orderUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Новый запуск", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Добавить эталон заказа", exact: true })
    .click();
  await labReference(page, "50");
  await startRun(page, "2026-10-26", "Дневная", "1000");
  const firstRunUrl = page.url();
  await expect(page.getByText("Эталон v1", { exact: true })).toBeVisible();
  for (const [c, v] of [
    ["L*", "52"],
    ["a*", "11"],
    ["b*", "6"],
  ])
    await page.getByLabel(`Оттиск ${c}`, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
  await expect(page.getByLabel("Активная партия")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Сохранить пробу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Проба сохранена", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Состав и история смены", exact: true })
    .click();
  await page.getByLabel("Масса добавки, г").fill("100");
  await page
    .getByRole("button", { name: "Зафиксировать добавку", exact: true })
    .click();
  await expect(page.locator(".run-context")).toContainText("1100 г");
  await page.getByRole("link", { name: "Заказ и вся история" }).click();
  await expect(page.locator(".run-record")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Новая версия эталона", exact: true })
    .click();
  await labReference(page, "60");
  await startRun(page, "2026-11-02", "Ночная", "700");
  await expect(page.getByText("Эталон v2", { exact: true })).toBeVisible();
  await expect(page.locator(".run-context")).toContainText("700 г");
  await expect(page.locator(".run-context")).toContainText("0 проб");
  await expect(page.locator(".run-context")).toContainText("0 добавок");
  await page.goto(firstRunUrl);
  await expect(page.getByText("Эталон v1", { exact: true })).toBeVisible();
  await expect(page.locator(".run-context")).toContainText("1100 г");
  await expect(page.locator(".measurement").first()).toContainText("50.00");
  await page.goto(orderUrl);
  await expect(page.locator(".run-record")).toHaveCount(2);
  await page
    .locator(".run-record")
    .filter({ hasText: "Дневная" })
    .getByText("Все пробы, добавки и состав этого запуска")
    .click();
  await expect(
    page.getByRole("heading", { name: "Проба · ΔE00", exact: false }),
  ).toBeVisible();
  await newOrder(page, "ТЕСТ Другой заказ с тем же Pantone");
  await expect(
    page.getByRole("button", { name: "Новый запуск", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Запусков ещё не было")).toHaveCount(0);
  await expect(page.locator(".run-record")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Добавить эталон заказа", exact: true }),
  ).toBeVisible();
});
test("сохранённое фото эталона: новая проба без повторной загрузки и резервная копия заказа", async ({
  page,
}, info) => {
  await newOrder(page, "ТЕСТ Заказ с фото");
  await page
    .getByRole("button", { name: "Добавить эталон заказа", exact: true })
    .click();
  const buffer = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#99593a" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Загрузить Эталон заказа", { exact: true })
    .setInputFiles({ name: "reference.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "+ Область в центре" }).click();
  await page.getByRole("button", { name: "Анализировать области" }).click();
  await page
    .getByRole("button", { name: "Сохранить эталон заказа", exact: true })
    .click();
  const orderUrl = page.url();
  await startRun(page, "2026-10-26", "1 смена", "500");
  await expect(
    page.getByLabel("Загрузить Эталон", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Загрузить Оттиск", { exact: true })
    .setInputFiles({ name: "print.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "+ Область в центре" }).click();
  await page.getByRole("button", { name: "Анализировать области" }).click();
  await expect(page.locator(".delta strong")).toHaveText("0.00");
  await page
    .getByRole("button", { name: "Сохранить пробу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Проба сохранена", exact: true }),
  ).toBeVisible();
  await page.goto(BASE + "#settings");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  const download = await pending;
  await page
    .getByLabel("Импорт резервной копии")
    .setInputFiles((await download.path())!);
  await page
    .getByRole("checkbox", {
      name: "Я сохранил нужные данные и подтверждаю замену",
    })
    .check();
  await page.getByRole("button", { name: "Восстановить базу" }).click();
  await expect(page.getByRole("alert")).toContainText("восстановлена");
  await page.goto(orderUrl);
  await expect(
    page.getByRole("heading", { name: "ТЕСТ Заказ с фото", exact: true }),
  ).toBeVisible();

  await expect(page.locator(".order-reference img")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("order-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("order-desktop.png"),
    fullPage: true,
  });
});
