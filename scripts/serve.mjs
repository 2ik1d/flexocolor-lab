import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const address = "http://127.0.0.1:4175/";
const openBrowser = () => {
  if (process.argv.includes("--no-open")) return;
  const command =
    process.platform === "win32"
      ? ["cmd.exe", ["/c", "start", "", address]]
      : process.platform === "darwin"
        ? ["open", [address]]
        : ["xdg-open", [address]];
  const child = spawn(command[0], command[1], {
    stdio: "ignore",
    windowsHide: true,
    detached: true,
  });
  child.on("error", () => console.log(`Откройте ${address} в браузере.`));
  child.unref();
};
if (!existsSync(path.join(root, "index.html"))) {
  console.error("Не найдена готовая сборка dist. Выполните pnpm build.");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, address).pathname);
    const file = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(path.resolve(root) + path.sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw Error("Not a file");
    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-FlexoColor-Lab": "1.1",
    });
    if (request.method === "HEAD") response.end();
    else
      createReadStream(file)
        .on("error", () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.on("error", async (error) => {
  if (error.code === "EADDRINUSE") {
    try {
      const current = await fetch(address, {
        signal: AbortSignal.timeout(2000),
      });
      if ((await current.text()).includes("FlexoColor Lab")) {
        console.log(`FlexoColor Lab уже работает: ${address}`);
        openBrowser();
        return;
      }
    } catch {
      /* The port belongs to another application. */
    }
    console.error(
      "Порт 4175 занят другим приложением. Освободите его и запустите снова.",
    );
  } else console.error(error.message);
  process.exitCode = 1;
});
server.listen(4175, "127.0.0.1", () => {
  console.log(
    `FlexoColor Lab 1.1: ${address}\nДля остановки нажмите Ctrl+C. Данные сохраняются в браузере.`,
  );
  openBrowser();
});
