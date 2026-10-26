import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.E2E_BASE_PATH || "/";
async function create(page: Page, pantones = ["185 C", "300 C"]) {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page
    .getByLabel("Название заказа", { exact: true })
    .fill("ТЕСТ Этикетка");
  for (let i = 0; i < pantones.length; i++) {
    if (i)
      await page
        .getByRole("button", { name: "Ещё Pantone", exact: true })
        .click();
    await page
      .getByLabel(`Pantone ${i + 1}`, { exact: true })
      .fill(pantones[i]);
  }
  await page
    .getByRole("button", { name: "Сохранить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ Этикетка", exact: true }),
  ).toBeVisible();
}
async function referenceLab(page: Page, l = "50") {
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
    page.getByRole("button", { name: "Заменить эталон", exact: true }),
  ).toBeVisible();
}
async function currentLab(page: Page, l: string) {
  for (const [c, v] of [
    ["L*", l],
    ["a*", "10"],
    ["b*", "5"],
  ])
    await page.getByLabel(`Новая проба ${c}`, { exact: true }).fill(v);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Сохранить пробу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Проба сохранена", exact: true }),
  ).toBeVisible();
}
test("что есть → несколько добавок → новая проба → ближе/дальше, отдельно для каждого Pantone", async ({
  page,
}) => {
  await create(page);
  const tabs = page.getByRole("navigation", { name: "Pantone заказа" });
  await expect(tabs.getByRole("link")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Новый запуск", exact: true }),
  ).toHaveCount(0);
  await referenceLab(page);
  const mixture = page.locator(".mixture-panel");
  await mixture
    .getByText("Указать исходный состав (если известен)", { exact: true })
    .click();
  await mixture.getByLabel("Масса 1", { exact: true }).fill("1000");
  await mixture
    .getByRole("button", { name: "Сохранить исходный состав" })
    .click();
  await expect(mixture.locator(".mass-badge")).toHaveText("1000 г");
  await page
    .getByRole("button", { name: "Ввести Lab / CSV", exact: true })
    .click();
  await currentLab(page, "40");
  await expect(
    page.getByText("Прошлой пробы пока нет.", { exact: false }),
  ).toBeVisible();
  await save(page);
  const additions = page.locator(".addition-panel");
  await additions.getByLabel("Масса 1", { exact: true }).fill("10");
  await additions
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await additions.getByLabel("Краска 2").selectOption("double-v-1");
  await additions.getByLabel("Масса 2").fill("15");
  await additions
    .getByRole("button", { name: "Записать добавки", exact: true })
    .click();
  await expect(mixture.locator(".mass-badge")).toHaveText("1025 г");
  await currentLab(page, "48");
  await expect(
    page.getByText("Ближе к эталону", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".trend-card")).toContainText(
    "Yellow 10 г + Warm Red 15 г",
  );
  await save(page);
  await currentLab(page, "30");
  await expect(
    page.getByText("Дальше от эталона", { exact: true }),
  ).toBeVisible();
  await save(page);
  await tabs.getByRole("link", { name: "300 C", exact: true }).click();
  await expect(page.locator(".mass-badge")).toHaveText("Масса неизвестна");
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 0",
  );
  await referenceLab(page, "60");
  await tabs.getByRole("link", { name: "185 C", exact: true }).click();
  await expect(page.locator(".mass-badge")).toHaveText("1025 г");
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 3",
  );
  await page.reload();
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 3",
  );
});
test("фото без известного состава: две пробы, несколько добавок, экспорт и импорт", async ({
  page,
}, info) => {
  await create(page, ["185 C"]);
  const image = async (color: string) =>
    sharp({
      create: { width: 240, height: 160, channels: 3, background: color },
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
  await page.getByRole("button", { name: "+ Область в центре" }).click();
  await page.getByRole("button", { name: "Анализировать области" }).click();
  await page
    .getByRole("button", { name: "Сохранить эталон заказа", exact: true })
    .click();
  const analyze = async (color: string) => {
    await page
      .getByLabel("Загрузить Новая проба", { exact: true })
      .setInputFiles({
        name: "sample.png",
        mimeType: "image/png",
        buffer: await image(color),
      });
    await page.getByRole("button", { name: "+ Область в центре" }).click();
    await page.getByRole("button", { name: "Анализировать области" }).click();
  };
  await analyze("#5a4632");
  await save(page);
  const additions = page.locator(".addition-panel");
  await additions.getByLabel("Масса 1", { exact: true }).fill("30");
  await additions
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await additions.getByLabel("Краска 2").selectOption("double-v-1");
  await additions.getByLabel("Масса 2").fill("5");
  await additions
    .getByRole("button", { name: "Записать добавки", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Добавки записаны");
  await analyze("#8c5f3a");
  await expect(
    page.getByText("Ближе к эталону", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".mass-badge")).toHaveText("Масса неизвестна");
  await save(page);
  const url = page.url();
  await page.goto(BASE + "#settings");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  await page
    .getByLabel("Импорт резервной копии")
    .setInputFiles((await (await pending).path())!);
  await page
    .getByRole("checkbox", {
      name: "Я сохранил нужные данные и подтверждаю замену",
    })
    .check();
  await page.getByRole("button", { name: "Восстановить базу" }).click();
  await expect(page.getByRole("alert")).toContainText("восстановлена");
  await page.goto(url);
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 2",
  );
  await expect(
    page.getByText("Ближе к эталону", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("workbench-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("workbench-desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("Pantone добавляются и изменяются в существующем заказе, старая история сохраняется", async ({
  page,
}) => {
  await create(page, ["185 C"]);
  await referenceLab(page);
  await page
    .getByRole("button", { name: "Ввести Lab / CSV", exact: true })
    .click();
  await currentLab(page, "40");
  await save(page);
  await page
    .getByRole("button", { name: "Изменить / добавить Pantone", exact: true })
    .click();
  await page.getByLabel("Pantone 1", { exact: true }).fill("186 C");
  await page.getByRole("button", { name: "Ещё Pantone", exact: true }).click();
  await page.getByLabel("Pantone 2", { exact: true }).fill("300 C");
  await page.getByRole("button", { name: "Ещё Pantone", exact: true }).click();
  await page.getByLabel("Pantone 3", { exact: true }).fill("Yellow");
  await page
    .getByRole("button", { name: "Сохранить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Pantone заказа" }).getByRole("link"),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Добавить эталон", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 1",
  );
  await page
    .getByRole("button", { name: "Изменить / добавить Pantone", exact: true })
    .click();
  await expect(
    page.getByLabel("Эталон Pantone 1", { exact: true }).locator("option"),
  ).toHaveCount(1);
});

test("примечания отдельным пунктом, результат добавки, закрытие и повтор с эталоном", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await create(page, ["185 C"]);
  const sourceUrl = page.url();
  await referenceLab(page);
  await page
    .getByRole("button", { name: "Ввести Lab / CSV", exact: true })
    .click();
  await currentLab(page, "40");
  await page
    .getByLabel("Что вышло / примечание к выкатке", { exact: true })
    .fill("Темнее эталона, первая выкатка");
  await save(page);
  const additions = page.locator(".addition-panel");
  await additions.getByLabel("Масса 1", { exact: true }).fill("10");
  await additions.getByLabel("Заметка к добавке").fill("Пробуем осветлить");
  await additions
    .getByRole("button", { name: "Записать добавки", exact: true })
    .click();
  await currentLab(page, "48");
  await page
    .getByLabel("Что вышло / примечание к выкатке", { exact: true })
    .fill("Стало ближе, согласовать");
  await save(page);
  await page
    .getByRole("button", { name: "История заказа", exact: true })
    .click();
  const history = page.locator(".order-history");
  await history
    .getByLabel("Примечание к заказу", { exact: true })
    .fill("Печатаем после согласования");
  await history
    .getByLabel("К какому цвету относится")
    .selectOption({ label: "185 C" });
  await history
    .getByRole("button", { name: "Сохранить примечание", exact: true })
    .click();
  await expect(history.locator('[data-event="addition"]')).toHaveCount(1);
  await expect(history.locator('[data-event="sample"]')).toHaveCount(2);
  await expect(history.locator('[data-event="addition"]')).toContainText(
    "Результат записан",
  );
  await history
    .getByRole("button", { name: "Примечания (4)", exact: true })
    .click();
  await expect(history.locator(".timeline article")).toHaveCount(4);
  await expect(history).toContainText("Стало ближе, согласовать");
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("order-notes-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Закрыть заказ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Эталон и выкатки", exact: true })
    .click();
  await expect(page.locator(".addition-panel")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Заменить эталон", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Возобновить заказ", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Повторить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ Этикетка · повтор", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Заменить эталон", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 0",
  );
  await expect(page.locator(".mass-badge")).toHaveText("Масса неизвестна");
  await page.goto(sourceUrl);
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 2",
  );
  await expect(
    page.getByRole("button", { name: "Возобновить заказ", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Pantone из заказа появляется в базе и списках нового заказа; сохранённый эталон доступен для выбора", async ({
  page,
}, info) => {
  await create(page, ["185 C"]);
  await referenceLab(page);
  await page.goto(BASE + "#pantones");
  await page.getByRole("button", { name: /185 C.*Просмотреть/ }).click();
  await expect(page.getByLabel("Карточка Pantone 185 C")).toContainText(
    "Текущий эталон",
  );
  await page
    .getByRole("link", { name: "Создать заказ с этим Pantone", exact: true })
    .click();
  await expect(page.getByLabel("Pantone 1", { exact: true })).toHaveValue(
    "185 C",
  );
  await expect(page.locator("#order-pantones option")).toHaveAttribute(
    "value",
    "185 C",
  );
  await page
    .getByLabel("Название заказа", { exact: true })
    .fill("Другой заказ с эталоном");
  const referenceSelect = page.getByLabel("Эталон Pantone 1", { exact: true });
  await referenceSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("order-reference-picker.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Сохранить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Другой заказ с эталоном", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Заменить эталон", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reference-editor")).toHaveCount(0);
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 0",
  );
});

test("дубликаты Pantone отклоняются, базу можно пополнять вручную", async ({
  page,
}) => {
  await page.goto(BASE + "#pantones");
  await page
    .getByRole("button", { name: "Добавить Pantone", exact: true })
    .click();
  await page.getByLabel("Номер Pantone", { exact: true }).fill("300 C");
  await page.getByLabel("Примечание к Pantone").fill("Синий клиента");
  await page
    .getByRole("button", { name: "Сохранить Pantone", exact: true })
    .click();
  await expect(page.getByLabel("Карточка Pantone 300 C")).toContainText(
    "Синий клиента",
  );
  await page.goto(BASE + "#orders");
  await page.getByRole("button", { name: "Новый заказ", exact: true }).click();
  await page.getByLabel("Название заказа", { exact: true }).fill("Дубликаты");
  await page.getByLabel("Pantone 1", { exact: true }).fill("300 C");
  await page.getByRole("button", { name: "Ещё Pantone", exact: true }).click();
  await page.getByLabel("Pantone 2", { exact: true }).fill(" PANTONE 300   c ");
  await page
    .getByRole("button", { name: "Сохранить заказ", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("уже есть в заказе");
  await expect(page.locator(".order-form")).toBeVisible();
});

test("состав выкатки становится рецептурой для повтора, замена эталона сохраняет массу, правка Lab сбрасывает результат", async ({
  page,
}) => {
  await create(page, ["185 C"]);
  await referenceLab(page);
  const mixture = page.locator(".mixture-panel");
  await mixture
    .getByText("Указать исходный состав (если известен)", { exact: true })
    .click();
  await mixture.getByLabel("Масса 1", { exact: true }).fill("1000");
  await mixture
    .getByRole("button", { name: "Сохранить исходный состав", exact: true })
    .click();
  await expect(mixture.locator(".mass-badge")).toHaveText("1000 г");
  await page
    .getByRole("button", { name: "Ввести Lab / CSV", exact: true })
    .click();
  await currentLab(page, "48");
  await page.getByLabel("Новая проба L*", { exact: true }).fill("49");
  await expect(
    page.getByRole("button", { name: "Сохранить пробу", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Принять Lab", exact: true }).click();
  await save(page);
  await page
    .getByRole("button", {
      name: "Сохранить состав выкатки в рецептуры",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Состав выкатки уже в рецептурах",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Повторить заказ", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ Этикетка · повтор", exact: true }),
  ).toBeVisible();
  const starter = page.locator(".recipe-starter");
  await starter.locator("summary").first().click();
  await expect(starter).toContainText("Собственная рецептура");
  await starter.getByLabel("Масса исходного замеса, г").fill("500");
  await starter
    .getByRole("button", { name: "Подставить состав в форму", exact: true })
    .click();
  await expect(mixture.getByLabel("Масса 1", { exact: true })).toHaveValue(
    "500",
  );
  await mixture
    .getByRole("button", { name: "Сохранить исходный состав", exact: true })
    .click();
  await expect(mixture.locator(".mass-badge")).toHaveText("500 г");
  await page
    .getByRole("button", { name: "Заменить эталон", exact: true })
    .click();
  await referenceLab(page, "60");
  await expect(mixture.locator(".mass-badge")).toHaveText("500 г");
  await expect(page.locator(".color-history summary").first()).toContainText(
    "проб: 0",
  );
});
