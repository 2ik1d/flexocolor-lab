import { useState } from "react";
import { Download, Upload, FileSpreadsheet, Check } from "lucide-react";
import type { Ink, Recipe } from "../domain/types";
import {
  exportRecipeCSV,
  incomingMass,
  parseRecipeCSV,
  recipeCSVHeader,
  type IncomingRecipe,
} from "../domain/recipe-transfer";
import { importRecipes } from "../storage/recipe-import";
import { downloadText } from "./files";

export function RecipeTransfer({
  recipes,
  inks,
  onChange,
  onError,
}: {
  recipes: Recipe[];
  inks: Ink[];
  onChange: () => void;
  onError: (s: string) => void;
}) {
  const [pending, setPending] = useState<IncomingRecipe[]>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="card recipe-transfer">
      <div className="card-heading">
        <div>
          <div className="eyebrow">БАЗА СОСТАВОВ</div>
          <h2>Загрузить рецептуры сразу списком</h2>
        </div>
        <FileSpreadsheet size={28} />
      </div>
      <p>
        CSV из вашей таблицы: одна строка на базовую краску. Составы одного
        Pantone объединятся, новые базы добавятся в справочник. Существующие
        заказы и история сохранятся.
      </p>
      <div className="actions">
        <label className="button">
          <Upload size={17} /> Выбрать CSV
          <input
            type="file"
            hidden
            accept=".csv,.tsv,text/csv,text/tab-separated-values"
            aria-label="Импорт рецептур CSV"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setPending(undefined);
              setMessage("");
              try {
                if (file.size > 5 * 1024 * 1024)
                  throw Error("Файл больше 5 МБ");
                setPending(parseRecipeCSV(await file.text()));
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() =>
            downloadText(
              "\uFEFF" + recipeCSVHeader.join(";") + "\r\n",
              "FlexoColor-шаблон-рецептур.csv",
            )
          }
        >
          <Download size={17} /> Скачать шаблон
        </button>
        <button
          className="secondary"
          disabled={!recipes.length}
          onClick={() => {
            try {
              downloadText(exportCSV(), "FlexoColor-рецептуры.csv");
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          <Download size={17} /> Экспорт рецептур CSV
        </button>
      </div>
      <details>
        <summary>Формат таблицы и стандартные формулы Pantone</summary>
        <p>
          <code>
            pantone;name;ink;code;manufacturer;grams;source;sourceNote;version
          </code>
        </p>
        <p>
          Массы можно указать на 100 г (численно равны процентам) или на любой
          замес. В <code>source</code>: OWN — свой состав, SUPPLIER — поставщик,
          PANTONE — формула из оригинального справочника. Для внешних составов
          заполните <code>sourceNote</code>: документ и редакция. Поле version
          необязательно.
        </p>
        <p>
          Стандартные рецептуры публикуются в{" "}
          <a
            href="https://www.pantone.com/products/graphics/formula-guide-coated-uncoated"
            target="_blank"
            rel="noreferrer"
          >
            Pantone Formula Guide
          </a>
          . Полная таблица формул пока не включена. Экранный веер содержит
          образцы цветов.
        </p>
      </details>
      {pending && (
        <div className="import-preview" aria-label="Предпросмотр рецептур">
          <h3>К загрузке: {pending.length} рецептур</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pantone / название</th>
                  <th>Базовых красок</th>
                  <th>Исходная масса</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {pending.slice(0, 40).map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.pantone}
                      <small>{r.name}</small>
                    </td>
                    <td>{r.components.length}</td>
                    <td>{incomingMass(r)} г</td>
                    <td>
                      {r.source === "PANTONE"
                        ? "Pantone"
                        : r.source === "SUPPLIER"
                          ? "Поставщик"
                          : "Свой состав"}
                      <small>{r.sourceNote}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pending.length > 40 && (
            <p className="hint">
              Показаны первые 40. Будут загружены все {pending.length} рецептур.
            </p>
          )}
          <p className="hint">
            Совпадающие составы пропустим. Изменённый состав сохраним отдельной
            версией.
          </p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await importRecipes(pending);
                  setMessage(
                    `Добавлено рецептур: ${result.recipes}; новых красок: ${result.inks}; совпадений пропущено: ${result.skipped}.`,
                  );
                  setPending(undefined);
                  onChange();
                } catch (e) {
                  onError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Check size={17} />{" "}
              {busy ? "Загружаем…" : "Добавить рецептуры в базу"}
            </button>
            <button
              className="subtle"
              disabled={busy}
              onClick={() => setPending(undefined)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="accepted-label" role="status">
          {message}
        </p>
      )}
    </section>
  );
  function exportCSV() {
    return exportRecipeCSV(recipes, inks);
  }
}
