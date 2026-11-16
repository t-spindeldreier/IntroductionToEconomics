// Reports what a phone downloads (gzipped): index.html plus the script and style
// it references. Everything else in dist/assets is loaded only on the stage.
// Runs after every build; fails if the phone bundle exceeds 200 kB.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT_KB = 200;
const kb = (path) => gzipSync(readFileSync(path)).length / 1024;
const html = readFileSync('dist/index.html', 'utf8');
const phoneFiles = ['index.html', ...[...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1])];
const stageFiles = readdirSync('dist/assets').map((f) => `assets/${f}`).filter((f) => !phoneFiles.includes(f));

const total = (files) => files.reduce((sum, f) => sum + kb(`dist/${f}`), 0);
console.log('\nGzipped download sizes');
for (const f of phoneFiles) console.log(`  phone  ${kb(`dist/${f}`).toFixed(1).padStart(7)} kB  ${f}`);
console.log(`  phone  ${total(phoneFiles).toFixed(1).padStart(7)} kB  TOTAL (limit ${LIMIT_KB} kB)`);
console.log(`  stage  ${total(stageFiles).toFixed(1).padStart(7)} kB  additional, loaded only on #/stage`);
if (total(phoneFiles) > LIMIT_KB) {
  console.error('The phone bundle is over the limit.');
  process.exit(1);
}
