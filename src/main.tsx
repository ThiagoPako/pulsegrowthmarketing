import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const BUILD_VERSION_URL = "/build-version.json";
const BUILD_VERSION_KEY = "pulse_build_version";
const RELOAD_GUARD_KEY = "pulse_build_reloaded_at";
const CHECK_INTERVAL_MS = 60_000;
/** Evita loop de reload caso o servidor entregue versões inconsistentes. */
const RELOAD_GUARD_WINDOW_MS = 15_000;

declare const __BUILD_VERSION__: string | undefined;

/** Versão embutida no bundle atualmente carregado (injetada pelo Vite). */
const RUNTIME_VERSION: string | null =
  typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : null;

async function clearBrowserCaches(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn("Não foi possível limpar caches do navegador:", error);
  }
}

function canReloadNow(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

async function applyNewBuild(version: string): Promise<void> {
  try {
    localStorage.setItem(BUILD_VERSION_KEY, version);
  } catch {
    /* storage indisponível: segue com o reload mesmo assim */
  }

  if (!canReloadNow()) return;

  await clearBrowserCaches();
  // `location.replace` evita entrada extra no histórico e força busca do index novo.
  window.location.replace(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
}

async function enforceLatestBuild(): Promise<void> {
  if (document.visibilityState === "hidden") return;

  try {
    const response = await fetch(`${BUILD_VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!response.ok) return;

    const data = (await response.json()) as { version?: string };
    if (!data.version) return;

    // Fonte de verdade primária: versão embutida no bundle em execução.
    if (RUNTIME_VERSION && RUNTIME_VERSION !== data.version) {
      await applyNewBuild(data.version);
      return;
    }

    const storedVersion = localStorage.getItem(BUILD_VERSION_KEY);
    if (!storedVersion) {
      localStorage.setItem(BUILD_VERSION_KEY, data.version);
      return;
    }

    if (storedVersion !== data.version) {
      await applyNewBuild(data.version);
    }
  } catch (error) {
    console.warn("Não foi possível verificar a versão do sistema:", error);
  }
}

void enforceLatestBuild();
window.addEventListener("focus", () => void enforceLatestBuild());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void enforceLatestBuild();
});
window.setInterval(() => void enforceLatestBuild(), CHECK_INTERVAL_MS);

createRoot(document.getElementById("root")!).render(<App />);
