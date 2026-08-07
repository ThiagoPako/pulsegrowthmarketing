#!/usr/bin/env node
/**
 * Verificação de build (gate de deploy).
 *
 * Garante que marcadores críticos de UI realmente entraram no bundle gerado
 * em `dist/`. Se um marcador sumir, o build foi feito a partir de código
 * antigo (ou a árvore foi tree-shaken indevidamente) e o deploy deve parar.
 *
 * Uso: node scripts/verify-bundle.mjs [caminho-do-dist]
 * Saída: código 0 = OK, 1 = falha (impede o deploy).
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** Marcadores obrigatórios: texto exato exibido na UI + descrição do recurso. */
const REQUIRED_MARKERS = [
  {
    text: "Excluir vídeos por período",
    feature: "Botão de exclusão de vídeos do Portal (ContentManager)",
  },
];

const DIST_DIR = resolve(process.argv[2] ?? "dist");
/** Só arquivos que podem conter strings de UI. */
const SCANNED_EXTENSIONS = [".js", ".mjs", ".css", ".html"];

/** Lista recursivamente os arquivos relevantes do dist. */
function collectFiles(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function main() {
  if (!existsSync(DIST_DIR)) {
    console.error(`ERRO: diretório de build não encontrado: ${DIST_DIR}`);
    console.error('Rode "npm run build" antes da verificação.');
    process.exit(1);
  }

  const files = collectFiles(DIST_DIR);

  if (files.length === 0) {
    console.error(`ERRO: nenhum artefato encontrado em ${DIST_DIR}.`);
    process.exit(1);
  }

  // Concatenar uma vez evita reler os arquivos por marcador.
  const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");

  const missing = REQUIRED_MARKERS.filter(({ text }) => {
    // O Vite pode escapar acentos como \u00e9 no JS minificado.
    const escaped = text.replace(/[^\x00-\x7F]/g, (char) =>
      `\\u${char.codePointAt(0).toString(16).padStart(4, "0")}`,
    );
    return !bundle.includes(text) && !bundle.includes(escaped);
  });

  if (missing.length > 0) {
    console.error("ERRO: marcadores ausentes no bundle gerado:");
    for (const { text, feature } of missing) {
      console.error(`  - "${text}"  (${feature})`);
    }
    console.error("\nO deploy foi abortado: o build não contém o código atual.");
    process.exit(1);
  }

  console.log(
    `OK: ${REQUIRED_MARKERS.length} marcador(es) encontrado(s) em ${files.length} arquivo(s) de ${DIST_DIR}.`,
  );
}

main();
