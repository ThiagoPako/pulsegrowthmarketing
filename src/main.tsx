import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const BUILD_VERSION_URL = "/build-version.json";
const BUILD_VERSION_KEY = "pulse_build_version";
const CHECK_INTERVAL_MS = 5 * 60_000;

declare const __BUILD_VERSION__: string | undefined;

/** Versão embutida no bundle atualmente carregado (injetada pelo Vite). */
const RUNTIME_VERSION: string | null =
  typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : null;

/**
 * IMPORTANTE: nunca recarregar a página automaticamente.
 * Um reload automático descarta trabalho em andamento (roteiro sendo escrito,
 * edição em curso). Apenas avisamos o usuário e ele decide quando atualizar.
 */
export const NEW_BUILD_EVENT = "pulse:new-build";

let notified = false;

async function checkLatestBuild(): Promise<void> {
  if (notified || document.visibilityState === "hidden") return;

  try {
    const response = await fetch(`${BUILD_VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return;

    const data = (await response.json()) as { version?: string };
    if (!data.version) return;

    const stored = localStorage.getItem(BUILD_VERSION_KEY);
    if (!stored) {
      localStorage.setItem(BUILD_VERSION_KEY, data.version);
      return;
    }

    // Só considera "nova versão" quando o servidor mudou em relação ao que
    // este navegador já viu. Não comparamos com RUNTIME_VERSION porque o
    // deploy pode gerar um identificador diferente do embutido no bundle.
    if (stored !== data.version) {
      localStorage.setItem(BUILD_VERSION_KEY, data.version);
      notified = true;
      window.dispatchEvent(
        new CustomEvent(NEW_BUILD_EVENT, { detail: { version: data.version, runtime: RUNTIME_VERSION } }),
      );
    }
  } catch {
    /* offline ou servidor indisponível: ignora silenciosamente */
  }
}

void checkLatestBuild();
window.setInterval(() => void checkLatestBuild(), CHECK_INTERVAL_MS);

createRoot(document.getElementById("root")!).render(<App />);
