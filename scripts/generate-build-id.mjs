import fs from 'fs';
import path from 'path';

const buildId = {
  version: Date.now().toString(),
  timestamp: new Date().toISOString()
};

const distPath = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distPath)) {
  fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(
  path.join(distPath, 'build-version.json'),
  JSON.stringify(buildId, null, 2)
);

// Also write to public for dev mode consistency
const publicPath = path.join(process.cwd(), 'public');
if (fs.existsSync(publicPath)) {
  fs.writeFileSync(
    path.join(publicPath, 'build-version.json'),
    JSON.stringify(buildId, null, 2)
  );
}

console.log(`Build ID generated: ${buildId.version}`);
