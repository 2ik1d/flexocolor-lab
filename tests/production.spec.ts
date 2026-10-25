import { test, expect } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.E2E_BASE_PATH || "/";
test("мобильный цикл: смесь, фото, проба, добавка, повторная проба и восстановление", async ({
  page,
}) => {
  await page.goto(BASE);
  await expect(
    page.getByRole("heading", { name: "Быстрая приладка." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(BASE + "#batches");
  await page.getByRole("button", { name: "Новая партия", exact: true }).click();
  await page
    .getByLabel("Название партии", { exact: true })
    .fill("ТЕСТ · заказ 001");
  await page.getByLabel("Номер Pantone", { exact: true }).fill("ТЕСТ 185 C");
  await page.getByLabel("Масса 1", { exact: true }).fill("750");
  await page
    .getByRole("button", { name: "Добавить компонент", exact: true })
    .click();
  await page.getByLabel("Краска 2").selectOption("double-v-1");
  await page.getByLabel("Масса 2").fill("250");
  await page
    .getByRole("button", { name: "Создать партию", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ · заказ 001", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1000 г", { exact: true }).first()).toBeVisible();
  await page.goto(BASE + "#quick");
  const image = await sharp({
    create: { width: 400, height: 200, channels: 3, background: "#a05a4b" },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 200,
            height: 200,
            channels: 3,
            background: "#98594a",
          },
        })
          .png()
          .toBuffer(),
        left: 200,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
  await page
    .getByLabel("Загрузить Общий снимок", { exact: true })
    .setInputFiles({
      name: "test-colors.png",
      mimeType: "image/png",
      buffer: image,
    });
  await page.getByRole("button", { name: "+ Область в центре" }).click();
  await page.getByLabel("x области 1", { exact: true }).fill("10");
  await page.getByLabel("y области 1", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Оттиск", exact: true }).click();
  await page.getByRole("button", { name: "+ Область в центре" }).click();
  await page.getByLabel("x области 2", { exact: true }).fill("60");
  await page.getByRole("button", { name: "Анализировать области" }).click();
  await expect(
    page.getByText("Оценка по фотографии", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText("INSUFFICIENT_CALIBRATION_DATA")).toBeVisible();
  await page
    .getByLabel("Активная партия", { exact: true })
    .selectOption({ label: "ТЕСТ · заказ 001 · ТЕСТ 185 C" });
  await page
    .getByRole("button", { name: "Сохранить пробу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Проба сохранена", exact: true }),
  ).toBeVisible();
  await page.goto(BASE + "#batches");
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "ТЕСТ · заказ 001" }) })
    .click();
  await page.getByLabel("Масса добавки, г").fill("25.5");
  await page.getByRole("button", { name: "Зафиксировать добавку" }).click();
  await expect(page.getByText("1025.5 г", { exact: true })).toBeVisible();
  await page.goto(BASE + "#quick");
  await page.getByRole("button", { name: "Lab / CSV", exact: true }).click();
  for (const title of ["Эталон", "Оттиск"]) {
    await page.getByLabel(`${title} L*`, { exact: true }).fill("50");
    await page
      .getByLabel(`${title} a*`, { exact: true })
      .fill(title === "Эталон" ? "10" : "12");
    await page.getByLabel(`${title} b*`, { exact: true }).fill("4");
  }
  await page
    .getByRole("button", { name: "Принять Lab", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "Принять Lab", exact: true })
    .nth(1)
    .click();
  await page
    .getByLabel("Активная партия", { exact: true })
    .selectOption({ label: "ТЕСТ · заказ 001 · ТЕСТ 185 C" });
  await page
    .getByRole("button", { name: "Сохранить пробу", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Проба сохранена", exact: true }),
  ).toBeVisible();
  await page.goto(BASE + "#settings");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON", exact: true }).click();
  const backup = await download;
  const path = await backup.path();
  expect(path).toBeTruthy();
  await page.getByLabel("Импорт резервной копии").setInputFiles(path!);
  await expect(
    page.getByRole("heading", { name: "Проверка пройдена" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Восстановить базу" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Я сохранил нужные данные и подтверждаю замену",
    })
    .check();
  await page.getByRole("button", { name: "Восстановить базу" }).click();
  await expect(page.getByRole("alert")).toContainText("восстановлена");
  await page.reload();
  await page.goto(BASE + "#batches");
  await expect(page.getByText("2 проб · 1 добавок")).toBeVisible();
});
test("повреждённая фотография и камера без доступа", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await page.goto(BASE);
  await page
    .getByLabel("Загрузить Общий снимок", { exact: true })
    .setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("bad"),
    });
  await expect(page.getByRole("alert")).toContainText("Не удалось прочитать");
  await page.getByRole("button", { name: "Камера в браузере" }).click();
  await expect(page.getByRole("alert")).toContainText("отклонён");
});
test("офлайн после кэширования и сохранённая рецептура", async ({
  page,
  context,
}) => {
  await page.goto(BASE + "#recipes");
  await page
    .getByRole("button", { name: "Новая рецептура", exact: true })
    .click();
  await page
    .getByLabel("Название рецептуры", { exact: true })
    .fill("ТЕСТ офлайн");
  await page
    .getByRole("button", { name: "Сохранить рецептуру", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ офлайн" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "ТЕСТ офлайн" }),
  ).toBeVisible();
  await expect(
    page.getByText("Офлайн · данные сохраняются на устройстве"),
  ).toBeVisible();
});
test("версии и масштаб рецептуры", async ({ page }) => {
  await page.goto(BASE + "#recipes");
  await page
    .getByRole("button", { name: "Новая рецептура", exact: true })
    .click();
  await page
    .getByLabel("Название рецептуры", { exact: true })
    .fill("ТЕСТ рецепт");
  await page.getByLabel("Масса 1", { exact: true }).fill("500");
  await page.getByLabel("Масштабировать до, г").fill("750");
  await page.getByRole("button", { name: "Пересчитать", exact: true }).click();
  await expect(page.getByLabel("Масса 1", { exact: true })).toHaveValue("750");
  await page
    .getByRole("button", { name: "Сохранить рецептуру", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "ТЕСТ рецепт" }) })
    .click();
  await page.getByLabel("Масса 1", { exact: true }).fill("800");
  await page
    .getByRole("button", { name: "Сохранить новой версией", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "ТЕСТ рецепт" })).toHaveCount(
    2,
  );
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
});
