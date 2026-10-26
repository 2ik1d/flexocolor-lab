import { test, expect } from "@playwright/test";
const BASE = process.env.E2E_BASE_PATH || "/";
const csv =
  "pantone;name;ink;code;manufacturer;grams;source;sourceNote\nTEST 101 C;Тестовый замес;Синтетическая база A;T-A;DEMO ONLY;80;OWN;Синтетический тест\nTEST 101 C;Тестовый замес;Синтетическая база B;T-B;DEMO ONLY;20;OWN;Синтетический тест\nTEST 102 C;Второй тестовый замес;Синтетическая база A;T-A;DEMO ONLY;100;OWN;Синтетический тест";

test("массовый импорт, поиск, пересчёт, печатная карта и заказ по рецептуре", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE + "#recipes");
  await page.getByLabel("Импорт рецептур CSV", { exact: true }).setInputFiles({
    name: "synthetic-recipes.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByLabel("Предпросмотр рецептур")).toContainText(
    "К загрузке: 2 рецептур",
  );
  await page
    .getByRole("button", { name: "Добавить рецептуры в базу", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Добавлено рецептур: 2; новых красок: 2",
  );
  await page.getByLabel("Найти рецептуру", { exact: true }).fill("TEST 101");
  await expect(page.locator(".recipe-library-card")).toHaveCount(1);
  await page.locator(".recipe-library-card").click();
  const selected = page.getByLabel("Выбранная рецептура", { exact: true });
  await selected.getByLabel("Масса замеса, г", { exact: true }).fill("500");
  await expect(selected).toContainText("400 г");
  await expect(selected).toContainText("100 г");
  await selected
    .getByRole("button", { name: "Карта замеса", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("DEMO ONLY");
  await expect(page.locator(".production-sheet")).toContainText("T-A");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".production-sheet")).toBeVisible();
  await expect(page.locator(".app")).toBeHidden();
  await page.screenshot({
    path: info.outputPath("mix-ticket-print.png"),
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", { name: "Закрыть карту замеса", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("recipe-library-mobile.png"),
    fullPage: true,
  });
  await selected
    .getByRole("button", { name: "Создать заказ по рецептуре", exact: true })
    .click();
  await page.getByLabel("Номер заказа", { exact: true }).fill("34001");
  await expect(page.getByLabel("Pantone 1", { exact: true })).toHaveValue(
    "TEST 101 C",
  );
  await expect(
    page.locator(".order-color-editor").getByLabel("Масса 1", { exact: true }),
  ).toHaveValue("400");
  await expect(
    page.locator(".order-color-editor").getByLabel("Масса 2", { exact: true }),
  ).toHaveValue("100");
  await page
    .getByText("Условия печати — материал, анилокс, УФ", { exact: true })
    .click();
  await page
    .getByLabel("Материал / подложка", { exact: true })
    .fill("Белая тестовая плёнка");
  await page.getByLabel("Анилокс", { exact: true }).fill("160 l/cm · 4 см³/м²");
  await page
    .getByRole("button", {
      name: "Создать заказ и перейти к эталонам",
      exact: true,
    })
    .click();
  await expect(page.locator(".production-context")).toContainText(
    "Белая тестовая плёнка",
  );
  await page
    .getByRole("button", { name: "Карта заказа / печать", exact: true })
    .click();
  await expect(page.locator(".production-sheet")).toContainText(
    "Исходная краска — до добавок",
  );
  await expect(page.locator(".production-sheet")).toContainText("400");
  await page
    .getByRole("button", { name: "Закрыть карту замеса", exact: true })
    .click();
  await page.goto(BASE + "#pantones");
  await page
    .getByLabel("Показывать в веере", { exact: true })
    .selectOption("recipes");
  await page.getByLabel("Найти Pantone", { exact: true }).fill("TEST101C");
  await expect(page.locator(".fan-grid > button")).toHaveCount(1);
  await expect(page.locator(".fan-grid")).toContainText("Рецептур:");
  await page.goto(BASE + "#orders");
  await expect(page.locator(".operator-order-record")).toContainText(
    "TEST 101 C · Нужен эталон",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: info.outputPath("orders-desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("orders-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("черновик нового заказа восстанавливается, а после создания не остаётся", async ({
  page,
}) => {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page.getByLabel("Номер заказа", { exact: true }).fill("DRAFT-5");
  await page.getByLabel("Клиент", { exact: true }).fill("Тестовый клиент");
  await page.getByLabel("Pantone 1", { exact: true }).fill("185 C");
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить черновик", exact: true })
    .click();
  await expect(page.getByLabel("Номер заказа", { exact: true })).toHaveValue(
    "DRAFT-5",
  );
  await expect(page.getByLabel("Клиент", { exact: true })).toHaveValue(
    "Тестовый клиент",
  );
  await expect(page.getByLabel("Pantone 1", { exact: true })).toHaveValue(
    "185 C",
  );
  await page
    .getByRole("button", {
      name: "Создать заказ и перейти к эталонам",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "← Заказы", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Продолжить черновик", exact: true }),
  ).toHaveCount(0);
});

test("неверный CSV не меняет библиотеку и не выдаётся за рецептуры", async ({
  page,
}) => {
  await page.goto(BASE + "#recipes");
  await page.getByLabel("Импорт рецептур CSV", { exact: true }).setInputFiles({
    name: "colors-only.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("pantone;hex\n185 C;#ff0000"),
  });
  await expect(page.getByRole("alert")).toContainText("не содержит рецептур");
  await expect(
    page.getByRole("button", {
      name: "Добавить рецептуры в базу",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".recipe-library-card")).toHaveCount(0);
});
