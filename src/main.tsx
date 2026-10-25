import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
const update = registerSW({
  onNeedRefresh() {
    const bar = document.createElement("div");
    bar.className = "update-banner";
    bar.append("Доступна новая версия. Сохраните текущую пробу. ");
    const button = document.createElement("button");
    button.textContent = "Обновить";
    button.onclick = () => void update(true);
    bar.append(button);
    document.body.append(bar);
  },
  onOfflineReady() {
    const bar = document.createElement("div");
    bar.className = "update-banner";
    bar.textContent = "Приложение готово к работе офлайн";
    document.body.append(bar);
    setTimeout(() => bar.remove(), 6000);
  },
});
