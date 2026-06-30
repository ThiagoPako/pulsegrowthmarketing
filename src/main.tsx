import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const BUILD_VERSION_URL = "/build-version.json";
const BUILD_VERSION_KEY = "pulse_build_version";

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

async function enforceLatestBuild(): Promise<void> {
  try {
    const response = await fetch(`${BUILD_VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!response.ok) return;

    const data = (await response.json()) as { version?: string };
    if (!data.version) return;

    const currentVersion = localStorage.getItem(BUILD_VERSION_KEY);
    if (!currentVersion) {
      localStorage.setItem(BUILD_VERSION_KEY, data.version);
      return;
    }

    if (currentVersion !== data.version) {
      localStorage.setItem(BUILD_VERSION_KEY, data.version);
      await clearBrowserCaches();
      window.location.reload();
    }
  } catch (error) {
    console.warn("Não foi possível verificar a versão do sistema:", error);
  }
}

void enforceLatestBuild();
window.addEventListener("focus", () => void enforceLatestBuild());

createRoot(document.getElementById("root")!).render(<App />);
