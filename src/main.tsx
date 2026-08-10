import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/**
 * Não consultar versões nem recarregar a aplicação em segundo plano.
 * Roteiros, edições e outras atividades podem estar em andamento; uma nova
 * versão só entra quando o próprio usuário recarregar a página manualmente.
 */
createRoot(document.getElementById("root")!).render(<App />);
