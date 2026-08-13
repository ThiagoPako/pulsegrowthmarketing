import fs from 'fs';
import path from 'path';

// Este script gera um identificador único de build para forçar o navegador a recarregar
const buildId = new Date().getTime();
const buildVersion = {
  version: "1.0." + buildId,
  timestamp: new Date().toISOString(),
  forceRefresh: true
};

const distPath = path.join(process.cwd(), 'dist');
// O build-version.json deve estar na raiz do servidor estático (dentro de dist/)
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(
  path.join(distPath, 'build-version.json'),
  JSON.stringify(buildVersion, null, 2)
);

console.log(`Build version ${buildVersion.version} generated in dist/build-version.json`);
