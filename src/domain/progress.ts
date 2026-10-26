import { difference, deltaE2000 } from "../color/color";
import type { Measurement, Sample } from "./types";
export function comparable(a: Measurement, b: Measurement) {
  return (
    JSON.stringify(a.conditions) === JSON.stringify(b.conditions) &&
    a.source.startsWith("PHOTO") === b.source.startsWith("PHOTO") &&
    a.profileId === b.profileId &&
    a.calibrationId === b.calibrationId
  );
}
export function progress(
  target: Measurement,
  current: Measurement,
  previous?: Sample,
) {
  const targetCompatible = comparable(target, current);
  const toTarget = targetCompatible
    ? difference(target.lab, current.lab)
    : undefined;
  const previousCompatible =
    !!previous && comparable(previous.current, current);
  const fromPrevious = previousCompatible
    ? difference(previous!.current.lab, current.lab)
    : undefined;
  const sameTarget = !!previous && previous.target.id === target.id;
  const trendComparable =
    !!previous &&
    targetCompatible &&
    previousCompatible &&
    comparable(previous.target, previous.current) &&
    sameTarget;
  const previousError = trendComparable
    ? deltaE2000(target.lab, previous!.current.lab)
    : undefined;
  const gain =
    previousError !== undefined && toTarget
      ? previousError - toTarget.de00
      : undefined;
  const trend =
    gain === undefined
      ? "UNAVAILABLE"
      : Math.round(gain * 100) === 0
        ? "UNCHANGED"
        : gain > 0
          ? "CLOSER"
          : "FARTHER";
  const advice: string[] = [];
  if (!targetCompatible)
    advice.push(
      "Условия эталона и пробы отличаются. Снимите их вместе при одном освещении.",
    );
  if (current.stats?.heterogeneous)
    advice.push(
      "На пробе неоднородный участок. Выберите ровное поле без бликов и повторите анализ.",
    );
  if (trend === "CLOSER")
    advice.push(
      "Последняя проба ближе к эталону по расчёту. Сохраните результат и проверьте совпадение с физическим эталоном.",
    );
  if (trend === "FARTHER")
    advice.push(
      "Последняя проба дальше от эталона. Не повторяйте эту добавку автоматически: проверьте состав и сделайте контрольную пробу.",
    );
  if (trend === "UNCHANGED")
    advice.push(
      "Изменение меньше 0,01 ΔE00 на экране. Проверьте повторяемость снимков перед следующей добавкой.",
    );
  if (previous && !previousCompatible)
    advice.push(
      "Прямое сравнение с прошлой пробой недоступно: изменились условия измерения.",
    );
  if (previous && previousCompatible && !sameTarget)
    advice.push(
      "Эталон изменился. Разница с прошлой пробой показана, но вывод «ближе / дальше» не делается.",
    );
  if (toTarget) {
    const d = toTarget;
    const directions = [
      Math.abs(d.l) >= 0.005 ? (d.l < 0 ? "светлее" : "темнее") : null,
      Math.abs(d.a) >= 0.005
        ? d.a < 0
          ? "в красную сторону"
          : "в зелёную сторону"
        : null,
      Math.abs(d.b) >= 0.005
        ? d.b < 0
          ? "в жёлтую сторону"
          : "в синюю сторону"
        : null,
    ].filter(Boolean);
    if (directions.length)
      advice.push(
        `Направление к эталону: ${directions.join(", ")}. Это направление цвета, а не рецепт добавок.`,
      );
  }
  if (!previous)
    advice.push(
      "Это первая проба. После добавки загрузите следующую — появится сравнение с предыдущей.",
    );
  return { toTarget, fromPrevious, previousError, gain, trend, advice };
}
