import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Testes do gate de build.
 *
 * 1) Garante que o texto do botão continua existindo no código-fonte
 *    (protege contra renomeações silenciosas que quebrariam o gate).
 * 2) Se `dist/` existir, garante que o mesmo texto entrou no bundle.
 */

const MARKER = "Excluir vídeos por período";
const SOURCE_FILE = resolve("src/pages/ContentManager.tsx");
const DIST_DIR = resolve("dist");
const SCANNED_EXTENSIONS = [".js", ".mjs", ".css", ".html"];

function collectFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Versão com acentos escapados, como o minificador pode emitir. */
function escapeNonAscii(value: string): string {
  return value.replace(
    /[^\x00-\x7F]/g,
    (char) => `\\u${char.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}

describe("marcadores obrigatórios de build", () => {
  it("mantém o botão de exclusão de vídeos no código-fonte", () => {
    expect(existsSync(SOURCE_FILE)).toBe(true);
    expect(readFileSync(SOURCE_FILE, "utf8")).toContain(MARKER);
  });

  it("inclui o botão no bundle gerado quando dist/ existe", () => {
    if (!existsSync(DIST_DIR)) {
      // Sem build local não há o que validar; o gate roda no deploy.
      expect(true).toBe(true);
      return;
    }

    const files = collectFiles(DIST_DIR);
    expect(files.length).toBeGreaterThan(0);

    const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
    const found = bundle.includes(MARKER) || bundle.includes(escapeNonAscii(MARKER));

    expect(found).toBe(true);
  });
});
