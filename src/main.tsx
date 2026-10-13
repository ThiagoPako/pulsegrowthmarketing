import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAutoTranslate } from "./lib/i18n";

// Tradução automática do sistema inteiro quando o idioma for inglês.
initAutoTranslate();

// Retorno da autorização da Meta numa janela aberta pelo sistema: devolve o código à janela principal.
try {
  const qs = new URLSearchParams(window.location.search);
  const oauthCode = qs.get("code");
  const oauthError = qs.get("error") || qs.get("error_reason");
  if (window.opener && qs.get("state") && (oauthCode || oauthError)) {
    window.opener.postMessage({ type: "pulse-oauth-return", code: oauthCode, error: oauthError }, "*");
  }
} catch { /* janela sem acesso ao opener */ }

/**
 * Não consultar versões nem recarregar a aplicação em segundo plano.
 * Roteiros, edições e outras atividades podem estar em andamento; uma nova
 * versão só entra quando o próprio usuário recarregar a página manualmente.
 */
createRoot(document.getElementById("root")!).render(<App />);
