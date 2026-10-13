import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAutoTranslate } from "./lib/i18n";

// Tradução automática do sistema inteiro quando o idioma for inglês.
initAutoTranslate();

/**
 * Não consultar versões nem recarregar a aplicação em segundo plano.
 * Roteiros, edições e outras atividades podem estar em andamento; uma nova
 * versão só entra quando o próprio usuário recarregar a página manualmente.
 */
createRoot(document.getElementById("root")!).render(<App />);
