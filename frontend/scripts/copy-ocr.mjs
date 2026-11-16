// Zet de bestanden van de tekstherkenning (tesseract.js) in public/tesseract, zodat de site ze zelf
// serveert. Zo hoeft de browser niets van een andere website te laden en werkt het ook zonder internet.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const target = join(root, 'public', 'tesseract');

mkdirSync(join(target, 'core'), { recursive: true });
mkdirSync(join(target, 'lang'), { recursive: true });

copyFileSync(join(modules, 'tesseract.js', 'dist', 'worker.min.js'), join(target, 'worker.min.js'));
for (const file of readdirSync(join(modules, 'tesseract.js-core'))) {
  if (file.endsWith('-lstm.wasm.js')) copyFileSync(join(modules, 'tesseract.js-core', file), join(target, 'core', file));
}
copyFileSync(
  join(modules, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
  join(target, 'lang', 'eng.traineddata.gz'),
);
console.log('Tekstherkenning klaargezet in public/tesseract');
