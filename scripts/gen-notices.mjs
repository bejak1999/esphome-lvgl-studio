// Erzeugt src/public/THIRD_PARTY_NOTICES.txt aus den Laufzeit-Abhängigkeiten (wird mit der
// Extension ausgeliefert). Nach Änderungen an `dependencies` erneut ausführen: npm run notices
import fs from 'node:fs';
const deps = Object.keys(JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies);
let out =
  'Third-party software included in ESPHome LVGL Studio\n' +
  '=====================================================\n\n' +
  'ESPHome LVGL Studio is licensed under the GNU General Public License v3.0.\n' +
  'It bundles the following open-source components:\n\n';
for (const d of deps) {
  // direkt lesen: nicht jedes Paket exportiert seine package.json
  const p = JSON.parse(fs.readFileSync(`node_modules/${d}/package.json`, 'utf8'));
  const repo = (typeof p.repository === 'string' ? p.repository : p.repository?.url || p.homepage || '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  out += `- ${d} ${p.version} — ${p.license}${repo ? ' — ' + repo : ''}\n`;
}
out +=
  '\nMaterial Design Icons font (@mdi/font): Apache License 2.0, Copyright (c) Pictogrammers.\n' +
  'Full license texts: https://www.apache.org/licenses/LICENSE-2.0 and https://opensource.org/license/mit\n';
fs.writeFileSync('src/public/THIRD_PARTY_NOTICES.txt', out);
console.log('src/public/THIRD_PARTY_NOTICES.txt aktualisiert');
