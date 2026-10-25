import { useEffect, useState } from "react";
import {
  ScanLine,
  BookOpen,
  History,
  PaintBucket,
  SlidersHorizontal,
  Settings as SettingsIcon,
  Menu,
  X,
  WifiOff,
  Database,
  ChevronRight,
} from "lucide-react";
import { db, seed } from "./storage/db";
import {
  defaultConditions,
  type Ink,
  type Recipe,
  type Batch,
  type Profile,
  type Experiment,
  type Settings as SettingsType,
} from "./domain/types";
import { Compare } from "./ui/Compare";
import { Batches, Inks, Recipes } from "./ui/Records";
import { Calibration } from "./ui/Calibration";
import { Settings } from "./ui/Settings";
type Page =
  "quick" | "recipes" | "batches" | "inks" | "calibration" | "settings";
const nav = [
  { id: "quick", name: "Быстрая приладка", icon: ScanLine },
  { id: "recipes", name: "Рецептуры", icon: BookOpen },
  { id: "batches", name: "История замесов", icon: History },
  { id: "inks", name: "База красок", icon: PaintBucket },
  { id: "calibration", name: "Калибровка", icon: SlidersHorizontal },
  { id: "settings", name: "Настройки", icon: SettingsIcon },
] as const;
const getPage = (): Page =>
  nav.some((n) => n.id === location.hash.slice(1))
    ? (location.hash.slice(1) as Page)
    : "quick";
export default function App() {
  const [page, setPage] = useState(getPage),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [ready, setReady] = useState(false),
    [fatal, setFatal] = useState(""),
    [revision, setRevision] = useState(0),
    [notice, setNotice] = useState<{ text: string; error: boolean }>(),
    [inks, setInks] = useState<Ink[]>([]),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [batches, setBatches] = useState<Batch[]>([]),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [experiments, setExperiments] = useState<Experiment[]>([]),
    [settings, setSettings] = useState<SettingsType>({
      id: "settings",
      tolerance: null,
      profileId: "",
      conditions: defaultConditions,
    });
  useEffect(() => {
    const hash = () => {
      setPage(getPage());
      setMenu(false);
    };
    const status = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", hash);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
    };
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        await seed();
        const [i, r, b, p, e, s] = await Promise.all([
          db.inks.toArray(),
          db.recipes.toArray(),
          db.batches.orderBy("createdAt").reverse().toArray(),
          db.profiles.toArray(),
          db.experiments.toArray(),
          db.settings.get("settings"),
        ]);
        setInks(i);
        setRecipes(r);
        setBatches(b);
        setProfiles(p);
        setExperiments(e);
        if (s) setSettings(s);
        setReady(true);
      } catch (e) {
        setFatal(
          `Локальная база недоступна: ${(e as Error).message}. Проверьте разрешение хранения и свободное место браузера.`,
        );
      }
    })();
  }, [revision]);
  const onChange = () => setRevision((r) => r + 1),
    onError = (text: string) => setNotice({ text, error: true }),
    onSuccess = (text: string) => setNotice({ text, error: false });
  const shared = { inks, onChange, onError };
  return (
    <div className="app">
      <header className="mobile-header">
        <a href="#quick" className="brand">
          <Brand />
          FlexoColor <b>Lab</b>
        </a>
        <button
          className="icon-button"
          aria-label="Открыть меню"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="#quick">
          <Brand />
          <span>
            FlexoColor <b>Lab</b>
            <small>UV FLEXO · COLOR WORKSPACE</small>
          </span>
        </a>
        <div className="nav-label">ЛАБОРАТОРИЯ</div>
        <nav>
          {nav.map((n) => (
            <a
              href={`#${n.id}`}
              key={n.id}
              className={page === n.id ? "active" : ""}
            >
              <n.icon size={20} />
              <span>{n.name}</span>
              {page === n.id && <ChevronRight size={15} />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="db-state">
            <Database size={18} />
            <div>
              Ваши данные — на устройстве<small>IndexedDB · без аккаунта</small>
            </div>
          </div>
          <span className="version">FLEXOCOLOR LAB / 1.0</span>
        </div>
      </aside>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <main>
        <div className="topbar">
          <span>
            Рабочее пространство <ChevronRight size={13} />{" "}
            {nav.find((n) => n.id === page)?.name}
          </span>
          <span className="tag">УФ-флексопечать</span>
        </div>
        {!online && (
          <div className="offline-banner">
            <WifiOff size={17} />
            Офлайн · данные сохраняются на устройстве
          </div>
        )}
        {notice && (
          <div role="alert" className={`toast ${notice.error ? "error" : ""}`}>
            <span>{notice.text}</span>
            <button
              className="icon-button"
              aria-label="Закрыть уведомление"
              onClick={() => setNotice(undefined)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {fatal ? (
          <section className="card">
            <h1>Не удалось открыть базу</h1>
            <p role="alert">{fatal}</p>
            <button onClick={() => location.reload()}>Повторить</button>
          </section>
        ) : !ready ? (
          <p>Открываем локальную лабораторию…</p>
        ) : (
          <div key={page}>
            {page === "quick" && (
              <Compare
                {...shared}
                batches={batches}
                settings={settings}
                onSuccess={onSuccess}
              />
            )}
            {page === "batches" && (
              <Batches
                {...shared}
                batches={batches}
                recipes={recipes}
                experiments={experiments}
              />
            )}
            {page === "recipes" && <Recipes {...shared} recipes={recipes} />}
            {page === "inks" && <Inks {...shared} />}
            {page === "calibration" && (
              <Calibration
                profiles={profiles}
                settings={settings}
                onChange={onChange}
                onError={onError}
              />
            )}
            {page === "settings" && (
              <Settings
                settings={settings}
                onChange={onChange}
                onError={onError}
                onSuccess={onSuccess}
              />
            )}
          </div>
        )}
        <footer>
          FlexoColor Lab{" "}
          <span>Физический эталон. Измеримые изменения. Честные выводы.</span>
        </footer>
      </main>
    </div>
  );
}
function Brand() {
  return (
    <svg className="brand-icon" viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="10" fill="#b8ec70" />
      <path d="M11 10h16v5H16v4h9v5h-9v6h-5z" fill="#142015" />
      <circle cx="26" cy="29" r="3" fill="#142015" />
    </svg>
  );
}
