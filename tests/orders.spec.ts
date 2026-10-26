import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.E2E_BASE_PATH || "/";
async function create(page: Page, colors = ["185 C"], known = false) {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page.getByLabel("Номер заказа", { exact: true }).fill("24018");
  await page
    .getByLabel("Название заказа", { exact: true })
    .fill("Этикетка оператора");
  await page
    .getByLabel("Информация о заказе", { exact: true })
    .fill("Плёнка, анилокс 160");
  await page.getByLabel("Допуск ΔE00", { exact: true }).fill("3");
  await page
    .getByLabel("Количество Pantone", { exact: true })
    .fill(String(colors.length));
  for (let i = 0; i < colors.length; i++)
    await page.getByLabel(`Pantone ${i + 1}`, { exact: true }).fill(colors[i]);
  if (known) {
    const initial = page
      .locator(".order-color-editor")
      .first()
      .locator("details")
      .last();
    await initial.locator("summary").click();
    await initial
      .getByRole("button", { name: "Добавить компонент", exact: true })
      .click();
    await initial.getByLabel("Масса 1", { exact: true }).fill("1000");
  }
  await page
    .getByRole("button", {
      name: "Создать заказ и перейти к эталонам",
      exact: true,
    })
    .click();
  await expect(page.locator(".operator-heading")).toContainText("24018");
}
async function reference(page: Page, l = "50") {
  await page.getByRole("button", { name: "Lab / CSV", exact: true }).click();
  for (const [axis, value] of [
    ["L*", l],
    ["a*", "10"],
    ["b*", "5"],
  ])
    await page.getByLabel(`Эталон заказа ${axis}`, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить эталон заказа", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Выкатка", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}
async function rollout(page: Page, l: string) {
  await page
    .getByRole("button", { name: "Lab / CSV прибора", exact: true })
    .click();
  for (const [axis, value] of [
    ["L*", l],
    ["a*", "10"],
    ["b*", "5"],
  ])
    await page.getByLabel(`Выкатка ${axis}`, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Анализ", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Сохранить выкатку", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Выкатка сохранена", exact: true }),
  ).toBeVisible();
}
test("новый заказ: номер, информация, количество, готовый Coated и независимые эталоны", async ({
  page,
}) => {
  await create(page, ["185 C", "6225 C"]);
  await expect(
    page
      .getByRole("navigation", { name: "Pantone заказа" })
      .getByRole("button"),
  ).toHaveCount(2);
  await expect(page.locator(".operator-history")).toContainText(
    "Плёнка, анилокс 160",
  );
  await reference(page);
  await rollout(page, "40");
  await page
    .getByLabel("Что получилось / заметка", { exact: true })
    .fill("Черновик до сохранения");
  await page.getByRole("link", { name: "← Заказы", exact: true }).click();
  await page
    .locator(".operator-order-record")
    .getByRole("link", { name: "Открыть и посмотреть историю", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Анализ", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Что получилось / заметка", { exact: true }),
  ).toHaveValue("Черновик до сохранения");
  await page.reload();
  await expect(
    page.getByLabel("Что получилось / заметка", { exact: true }),
  ).toHaveValue("Черновик до сохранения");
  await save(page);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Анализ", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Выкатка сохранена", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Pantone заказа" })
    .getByRole("button", { name: /^6225 C/ })
    .click();
  await expect(
    page.getByRole("tab", { name: "Эталон", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await reference(page, "60");
  await rollout(page, "57");
  await save(page);
  await page
    .getByRole("navigation", { name: "Pantone заказа" })
    .getByRole("button", { name: /^185 C/ })
    .click();
  await expect(page.locator(".comparison-report")).toContainText(
    "Оттиск темнее",
  );
  await expect(page.locator(".operator-history .history-event")).toHaveCount(2);
});
test("полный цикл: добавки, прошлая выкатка, дельты, подтверждение, поиск и чистый повтор", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page, ["185 C"], true);
  await reference(page);
  await rollout(page, "40");
  await page
    .getByLabel("Что получилось / заметка", { exact: true })
    .fill("Первая выкатка темнее");
  await page
    .getByRole("button", { name: "Продолжить: добавить краску", exact: true })
    .click();
  const row = page.locator(".addition-color-row").first();
  await row.getByLabel("Масса 1", { exact: true }).fill("10");
  await row
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await row.getByLabel("Краска 2", { exact: true }).selectOption("double-v-1");
  await row.getByLabel("Масса 2", { exact: true }).fill("5");
  await row
    .getByLabel("Примечание к добавкам 1", { exact: true })
    .fill("Внесли вместе");
  await page
    .getByRole("button", {
      name: "Записать добавки и перейти к выкатке",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Добавки записаны");
  await expect(page.locator(".previous-rollout")).toContainText(
    "Прошлая выкатка — автоматически",
  );
  await rollout(page, "48");
  await expect(page.locator(".trend-card")).toContainText("Ближе к эталону");
  await expect(
    page.getByLabel("Прогресс доводки", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".delta-metrics").first()).toContainText("ΔE76");
  await expect(page.locator(".delta-metrics").first()).toContainText("ΔL*");
  await expect(page.locator(".comparison-report")).toContainText(
    "В пределах допуска",
  );
  await page
    .getByLabel("Что получилось / заметка", { exact: true })
    .fill("Результат устраивает");
  await save(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("operator-analysis-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: info.outputPath("operator-analysis-desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Цвет устроил — подтвердить", exact: true })
    .click();
  await expect(page.locator(".accepted-label")).toContainText([
    "В пределах",
    "подтверждён",
  ]);
  await page.getByRole("tab", { name: "Новая выкатка", exact: true }).click();
  await rollout(page, "49");
  await expect(
    page.getByRole("button", {
      name: "Подтвердить и завершить заказ",
      exact: true,
    }),
  ).toBeDisabled();
  await save(page);
  await page
    .getByRole("button", { name: "Цвет устроил — подтвердить", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить и завершить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Заказы", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Найти заказ", { exact: true }).fill("24018");
  await expect(page.locator(".operator-order-record")).toContainText(
    "Подтверждён и завершён",
  );
  await page
    .locator(".operator-order-record")
    .getByRole("button", { name: "Повтор", exact: true })
    .click();
  await expect(page.locator(".operator-heading")).toContainText("24018");
  await expect(page.locator(".operator-heading")).toContainText(
    "исходные краски без добавок",
  );
  await expect(page.locator(".operator-history .history-event")).toHaveCount(0);
  await expect(
    page.getByText("Что в исходной краске · 1000 г", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Эталон", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Дальше: загрузить выкатку",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole("link", { name: "← Заказы", exact: true }).click();
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page.getByLabel("Номер заказа", { exact: true }).fill("24019");
  await page.getByLabel("Pantone 1", { exact: true }).fill("185 C");
  await expect(
    page.locator(".order-color-editor").getByLabel("Масса 1", { exact: true }),
  ).toHaveValue("1000");
  await page
    .getByRole("button", { name: "Посмотреть цвет и состав", exact: true })
    .click();
  await expect(page.locator(".color-knowledge")).toContainText(
    "исходная краска",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("operator-order-form.png"),
    fullPage: true,
  });
});
test("одна операция доводит несколько Pantone, подтверждение сбрасывается после добавок", async ({
  page,
}) => {
  await create(page, ["185 C", "300 C"]);
  await reference(page);
  await rollout(page, "40");
  await save(page);
  await page
    .getByRole("navigation", { name: "Pantone заказа" })
    .getByRole("button", { name: /^300 C/ })
    .click();
  await reference(page);
  await rollout(page, "42");
  await save(page);
  await page
    .getByRole("button", { name: "Цвет устроил — подтвердить", exact: true })
    .click();
  await page.getByRole("button", { name: /Добавки и доводка/ }).click();
  const rows = page.locator(".addition-color-row");
  await rows
    .first()
    .getByLabel("Куда добавили 1", { exact: true })
    .selectOption({ label: "185 C" });
  await rows.first().getByLabel("Масса 1", { exact: true }).fill("5");
  await page
    .getByRole("button", { name: "Ещё цвет для доводки", exact: true })
    .click();
  await rows
    .nth(1)
    .getByLabel("Куда добавили 2", { exact: true })
    .selectOption({ label: "300 C" });
  await rows.nth(1).getByLabel("Масса 1", { exact: true }).fill("8");
  await page
    .getByRole("button", {
      name: "Записать добавки и перейти к выкатке",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Добавки записаны");
  await expect(
    page.getByRole("navigation", { name: "Pantone заказа" }),
  ).not.toContainText("Подтверждён");
  await expect(page.locator(".operator-history .history-event")).toHaveCount(4);
  await expect(
    page.getByRole("button", {
      name: "Подтвердить и завершить заказ",
      exact: true,
    }),
  ).toBeDisabled();
});
test("готовый офлайн-веер с новинками 2026, карточкой, составом из истории и ручным пополнением", async ({
  page,
}, info) => {
  await page.goto(BASE + "#pantones");
  await expect(
    page.getByRole("heading", { name: "Веер Pantone · Coated", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Новинки 2026 · 224", exact: true })
    .click();
  await page.getByLabel("Найти Pantone", { exact: true }).fill("6225 C");
  await page.locator(".fan-grid").getByRole("button").click();
  await expect(page.locator(".fan-selected")).toContainText("2026");
  await expect(page.locator(".fan-selected")).toContainText("#EFD400");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.context().setOffline(true);
  await page.reload();
  await page.getByLabel("Найти Pantone", { exact: true }).fill("6225 C");
  await page.locator(".fan-grid").getByRole("button").click();
  await expect(page.locator(".fan-selected")).toContainText("#EFD400");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("coated-fan-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Добавить Pantone", exact: true })
    .click();
  await page
    .getByLabel("Номер Pantone", { exact: true })
    .fill("Цвет клиента 12");
  await page
    .getByLabel("Примечание к Pantone", { exact: true })
    .fill("Новый собственный образец");
  await page
    .getByRole("button", { name: "Сохранить Pantone", exact: true })
    .click();
  await expect(
    page.getByLabel("Карточка Pantone Цвет клиента 12", { exact: true }),
  ).toContainText("Новый собственный образец");
});
test("фото: эталон, выкатка, сравнение, заметки и восстановление JSON", async ({
  page,
}) => {
  await create(page);
  const image = async (color: string) =>
    sharp({
      create: { width: 220, height: 160, channels: 3, background: color },
    })
      .png()
      .toBuffer();
  await page
    .getByLabel("Загрузить Эталон заказа", { exact: true })
    .setInputFiles({
      name: "target.png",
      mimeType: "image/png",
      buffer: await image("#96643c"),
    });
  await page
    .getByRole("button", { name: "+ Область в центре", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Анализировать области", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить эталон заказа", exact: true })
    .click();
  await page.getByLabel("Загрузить Выкатка", { exact: true }).setInputFiles({
    name: "rollout.png",
    mimeType: "image/png",
    buffer: await image("#8c5f3a"),
  });
  await page
    .getByRole("button", { name: "+ Область в центре", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Анализировать области", exact: true })
    .click();
  const draftUrl = page.url();
  await page.goto(BASE + "#orders");
  await page.goto(draftUrl);
  await expect(
    page.getByRole("tab", { name: "Анализ", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await save(page);
  await page
    .getByRole("button", { name: "Весь журнал и примечания", exact: true })
    .click();
  await page
    .getByLabel("Примечание к заказу", { exact: true })
    .fill("Проверить на машине");
  await page
    .getByRole("button", { name: "Сохранить примечание", exact: true })
    .click();
  await expect(page.locator(".order-history")).toContainText(
    "Проверить на машине",
  );
  const url = page.url();
  await page.goto(BASE + "#settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  await page
    .getByLabel("Импорт резервной копии")
    .setInputFiles((await (await download).path())!);
  await page
    .getByRole("checkbox", {
      name: "Я сохранил нужные данные и подтверждаю замену",
    })
    .check();
  await page
    .getByRole("button", { name: "Восстановить базу", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("восстановлена");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Весь журнал и примечания", exact: true })
    .click();
  await expect(page.locator(".order-history")).toContainText(
    "Проверить на машине",
  );
});
