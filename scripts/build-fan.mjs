import fs from "node:fs/promises";
const sources = {
  legacy:
    "https://raw.githubusercontent.com/aj90909/unofficial-pantone-solid-coated-2024-v5/main/output.json",
  additions: "https://pantoneconverter.com/new-pantone-colors-2026/",
};
const cached = process.argv.includes("--from-cache");
const legacy = JSON.parse(
  cached
    ? await fs.readFile("fixtures/pantone-coated-source.json", "utf8")
    : await (await fetch(sources.legacy)).text(),
);
const html = cached
  ? await fs.readFile("fixtures/coated-2026-source.html", "utf8")
  : await (await fetch(sources.additions)).text();
const next = JSON.parse(
  html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1] || "null",
);
function findColors(value) {
  if (
    Array.isArray(value) &&
    value.length === 224 &&
    value[0]?.code &&
    value[0]?.c?.hex
  )
    return value;
  if (value && typeof value === "object")
    for (const child of Object.values(value)) {
      const result = findColors(child);
      if (result) return result;
    }
}
const additions = findColors(next);
if (!additions || legacy.colors.length < 3000)
  throw Error("Unexpected source format");
const unique = new Map(
  legacy.colors
    .filter((c) => / C$/.test(c.name))
    .map((c) => [
      c.name.replace(/^PANTONE /, ""),
      {
        name: c.name.replace(/^PANTONE /, ""),
        lab: c.components,
        edition: "2024",
        source: sources.legacy,
      },
    ]),
);
for (const c of additions)
  unique.set(`${c.code} C`, {
    name: `${c.code} C`,
    hex: c.c.hex,
    edition: "2026",
    source: sources.additions,
  });
await fs.mkdir("src/data", { recursive: true });
await fs.writeFile(
  "src/data/coated.json",
  JSON.stringify([...unique.values()].map(({ source, ...color }) => color)),
);
console.log(
  `Coated swatches: ${unique.size}; additions 2026: ${additions.length}`,
);
