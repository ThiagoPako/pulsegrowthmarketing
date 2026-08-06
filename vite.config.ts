import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Gera um identificador único de build usado para cache-busting.
 * Precisa ser estável durante um mesmo build e diferente entre builds.
 */
const BUILD_VERSION = `${Date.now()}`;

/**
 * Plugin de cache-busting:
 * - Em dev: responde /build-version.json em memória (evita 404 no console).
 * - Em build: emite /build-version.json no dist e injeta a versão no index.html.
 */
function buildVersionPlugin(): Plugin {
  const payload = JSON.stringify({ version: BUILD_VERSION });

  return {
    name: "pulse-build-version",
    configureServer(server) {
      server.middlewares.use("/build-version.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-version.json",
        source: payload,
      });
    },
    transformIndexHtml(html) {
      // Meta tags impedem que o próprio index.html fique preso em cache,
      // garantindo que os hashes novos dos assets sejam sempre lidos.
      const metas = [
        '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />',
        '<meta http-equiv="Pragma" content="no-cache" />',
        '<meta http-equiv="Expires" content="0" />',
        `<meta name="build-version" content="${BUILD_VERSION}" />`,
      ].join("\n    ");

      return html.replace("</head>", `  ${metas}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    buildVersionPlugin(),
  ].filter(Boolean),
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  build: {
    // Hash no nome de todos os artefatos: navegador nunca reaproveita chunk antigo.
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
