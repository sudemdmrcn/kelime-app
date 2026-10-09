// data/yds-block-*.json dosyalarını birleştirip words-yds.js üretir.
// Kullanım:  node tools/build-words.js
// Yeni blok eklemek için data/ klasörüne yds-block-02.json gibi bir dosya koyup bunu çalıştırın.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'data');
const files = fs.readdirSync(dir).filter(f => /^yds-block-\d+\.json$/.test(f)).sort();
const POS = ['verb', 'noun', 'adj', 'adv', 'phrasal'];
const seen = new Map(), rows = [];
let problems = 0;
for (const f of files) {
  let arr;
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
  catch (e) { console.error(`${f}: geçerli JSON değil (${e.message})`); process.exit(1); }
  arr.forEach((r, i) => {
    const where = `${f} #${i + 1} (${r && r[0]})`;
    if (!Array.isArray(r) || r.length < 4 || r.slice(0, 4).some(x => typeof x !== 'string' || !x.trim())) { console.warn('EKSİK ALAN:', where); problems++; return; }
    if (r[4] != null && !POS.includes(r[4])) { console.warn('GEÇERSİZ TÜR:', where, r[4]); problems++; }
    if (r[5] != null && !(Array.isArray(r[5]) && r[5].every(x => Array.isArray(x) && x.length === 2))) { console.warn('GEÇERSİZ EK ANLAM:', where); problems++; return; }
    if (r[6] != null && typeof r[6] !== 'string') { console.warn('GEÇERSİZ ÇEVİRİ:', where); problems++; }
    if (r[6] == null) console.warn('ÇEVİRİ YOK (7. alan):', where);
    const key = r[0].trim().toLowerCase();
    if (seen.has(key)) { console.warn(`TEKRAR: ${where} (ilk: ${seen.get(key)})`); problems++; return; }
    seen.set(key, where);
    rows.push(r);
  });
}
const out = '// OTOMATİK ÜRETİLDİ: node tools/build-words.js  (elle düzenlemeyin; kaynak: data/yds-block-*.json)\n' +
  'window.YDS_ROWS = [\n' + rows.map(r => JSON.stringify(r)).join(',\n') + '\n];\n';
fs.writeFileSync(path.join(root, 'words-yds.js'), out);
console.log(`${files.length} blok, ${rows.length} kelime yazıldı, ${problems} sorun.`);
