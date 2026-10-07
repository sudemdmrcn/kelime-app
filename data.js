/* data.js: kelime verisini yükler, doğrular ve YDS boşluk-doldurma için çekim (inflection) yardımcıları sağlar.

   Satır formatı (words-yds.js / words-legacy.js):
     [en, tr, syn, ex, pos?, extra?]
     pos   : verb | noun | adj | adv | phrasal
     extra : [[tr, örnek cümle], ...]  (çok anlamlı kelimeler için opsiyonel)

   Kart nesnesi: { key, en, tr, syn, ex, pos, extra, set:'yds'|'legacy', day }
   key = İngilizce kelimenin küçük harfli hali. İlerleme bu anahtarla saklanır; kelime eklemek
   ya da sıralamayı değiştirmek ilerlemeyi bozmaz. */
(function () {
  const K = window.K = window.K || {};
  const POS = ['verb', 'noun', 'adj', 'adv', 'phrasal'];
  const DAY_SIZE = 25;
  K.DAY_SIZE = DAY_SIZE;
  K.POS_LABEL = { verb: 'verb', noun: 'noun', adj: 'adj', adv: 'adv', phrasal: 'phrasal', other: '' };

  const problems = [];
  const cards = [], byKey = {};

  function add(rows, set) {
    let idx = 0;
    (rows || []).forEach((r, i) => {
      const where = `${set} #${i + 1} (${r && r[0]})`;
      if (!Array.isArray(r) || r.length < 4 || r.slice(0, 4).some(x => typeof x !== 'string' || !x.trim())) { problems.push('Eksik alan: ' + where); return; }
      const key = r[0].trim().toLowerCase();
      if (byKey[key]) { problems.push('Tekrar: ' + where); return; }
      let pos = r[4];
      if (pos != null && !POS.includes(pos)) { problems.push('Geçersiz tür: ' + where); pos = null; }
      let extra = Array.isArray(r[5]) ? r[5].filter(x => Array.isArray(x) && x.length === 2) : [];
      const c = { key, en: r[0].trim(), tr: r[1].trim(), syn: r[2].trim(), ex: r[3].trim(), pos: pos || 'other', extra, set, day: set === 'yds' ? Math.floor(idx / DAY_SIZE) + 1 : 0 };
      idx++;
      cards.push(c); byKey[key] = c;
    });
  }
  add(window.YDS_ROWS, 'yds');       // YDS önce işlenir, aynı kelime legacy'de varsa YDS kazanır
  add(window.LEGACY_ROWS, 'legacy');
  if (problems.length) console.warn('[kelime] veri sorunları:\n' + problems.join('\n'));

  K.cards = cards;
  K.byKey = byKey;
  K.dataProblems = problems;
  K.dayCount = Math.ceil(cards.filter(c => c.set === 'yds').length / DAY_SIZE);

  /* ---------- Çekim yardımcıları ---------- */
  // Düzensiz fiiller: kök -> [geçmiş, V3, -ing]. Listede olmayanlar kurala göre çekilir.
  const IRREG = {
    be: ['was', 'been', 'being'], begin: ['began', 'begun', 'beginning'], break: ['broke', 'broken', 'breaking'],
    bring: ['brought', 'brought', 'bringing'], build: ['built', 'built', 'building'], choose: ['chose', 'chosen', 'choosing'],
    draw: ['drew', 'drawn', 'drawing'], drive: ['drove', 'driven', 'driving'], find: ['found', 'found', 'finding'],
    give: ['gave', 'given', 'giving'], go: ['went', 'gone', 'going'], grow: ['grew', 'grown', 'growing'],
    hide: ['hid', 'hidden', 'hiding'], hold: ['held', 'held', 'holding'], keep: ['kept', 'kept', 'keeping'],
    know: ['knew', 'known', 'knowing'], lead: ['led', 'led', 'leading'], lose: ['lost', 'lost', 'losing'],
    make: ['made', 'made', 'making'], pay: ['paid', 'paid', 'paying'], rise: ['rose', 'risen', 'rising'],
    run: ['ran', 'run', 'running'], seek: ['sought', 'sought', 'seeking'], sell: ['sold', 'sold', 'selling'],
    send: ['sent', 'sent', 'sending'], set: ['set', 'set', 'setting'], show: ['showed', 'shown', 'showing'],
    spread: ['spread', 'spread', 'spreading'], take: ['took', 'taken', 'taking'], undertake: ['undertook', 'undertaken', 'undertaking'],
    overcome: ['overcame', 'overcome', 'overcoming'], withdraw: ['withdrew', 'withdrawn', 'withdrawing'], bear: ['bore', 'borne', 'bearing'],
    cut: ['cut', 'cut', 'cutting'], get: ['got', 'gotten', 'getting'], put: ['put', 'put', 'putting'], think: ['thought', 'thought', 'thinking']
  };
  const isV = ch => 'aeiou'.indexOf(ch) >= 0;
  const oneSyllable = w => (w.match(/[aeiouy]+/g) || []).length === 1;
  const cvc = w => w.length >= 3 && !isV(w[w.length - 3]) && isV(w[w.length - 2]) && !isV(w[w.length - 1]) && !'wxy'.includes(w[w.length - 1]);

  // Tek kelime için istenen çekim türünü üretir. kind: base | s | ed | ing
  function produceWord(root, kind) {
    const r = root.toLowerCase();
    if (kind === 'base') return r;
    const ir = IRREG[r];
    if (ir) { if (kind === 'ed') return ir[0]; if (kind === 'ing') return ir[2]; }
    const endY = /[^aeiou]y$/.test(r);
    if (kind === 's') return endY ? r.slice(0, -1) + 'ies' : /(s|x|z|ch|sh|o)$/.test(r) ? r + 'es' : r + 's';
    const dbl = oneSyllable(r) && cvc(r) ? r[r.length - 1] : '';
    if (kind === 'ed') return r.endsWith('e') ? r + 'd' : endY ? r.slice(0, -1) + 'ied' : r + dbl + 'ed';
    if (kind === 'ing') return r.endsWith('ie') ? r.slice(0, -2) + 'ying' : r.endsWith('e') && !r.endsWith('ee') ? r.slice(0, -1) + 'ing' : r + dbl + 'ing';
    return r;
  }
  // Eşleştirmede kabul edilen tüm olası biçimler: [[kind, form], ...]
  function allForms(root) {
    const r = root.toLowerCase(), out = [['base', r]];
    ['s', 'ed', 'ing'].forEach(k => out.push([k, produceWord(r, k)]));
    if (cvc(r)) { const c = r[r.length - 1]; out.push(['ed', r + c + 'ed'], ['ing', r + c + 'ing']); }
    const ir = IRREG[r];
    if (ir) { out.push(['ed', ir[0]], ['ed', ir[1]], ['ing', ir[2]]); }
    return out;
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Örnek cümlede kelimeyi (çekimli de olsa) bulur. Dönüş: {start, end, text, kind} | null
  function findInSentence(card) {
    const words = card.en.toLowerCase().split(/\s+/), tail = words.slice(1).map(esc).join('\\s+');
    let best = null;
    for (const [kind, form] of allForms(words[0])) {
      const re = new RegExp('\\b' + esc(form) + (tail ? '\\s+' + tail : '') + '\\b', 'i');
      const m = re.exec(card.ex);
      if (m && (!best || m.index < best.start || (m.index === best.start && m[0].length > best.text.length)))
        best = { start: m.index, end: m.index + m[0].length, text: m[0], kind };
    }
    return best;
  }
  // Başka bir kelimeyi aynı çekim türüne sokar (şıkların cümleye uyması için).
  function inflectLike(en, kind) {
    const parts = en.trim().split(/\s+/);
    parts[0] = produceWord(parts[0], kind);
    return parts.join(' ');
  }

  K.findInSentence = findInSentence;
  K.inflectLike = inflectLike;
  K.splitSyn = s => s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
})();
