/* quiz.js: soru üretimi (YDS tarzı boşluk doldurma ve eş anlamlı eşleştirme). DOM'a dokunmaz.

   Boşluk doldurma: örnek cümlede kelimenin çekimli hali (revealed, resembles...) bulunur, yerine boşluk
   konur. Şıklar AYNI kelime türünden seçilir ve hedefle AYNI çekime sokulur, böylece şıklar cümleye
   dilbilgisel olarak uyar. Cümlede bulunamayan kelime için soru üretilmez (kart modunda yine çalışılır). */
(function () {
  const K = window.K, st = K.store;
  const LETTERS = ['A', 'B', 'C', 'D', 'E'];
  const BLANK = '_______';

  function pickDistractors(card, n, pool) {
    return K.shuffle(pool.filter(c => c.key !== card.key && c.pos === card.pos)).slice(0, n);
  }
  const esc = s => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function genCloze(card, pool) {
    const m = K.findInSentence(card);
    if (!m) return null;
    const ds = pickDistractors(card, 4, pool);
    if (ds.length < 4) return null;
    const upper = /[A-Z]/.test(m.text.charAt(0));
    const fix = s => upper ? cap(s) : s;
    const correct = fix(m.text.toLowerCase());
    const opts = [correct, ...ds.map(d => fix(K.inflectLike(d.en, m.kind)))];
    if (new Set(opts.map(o => o.toLowerCase())).size < 5) return null;
    const order = K.shuffle(opts.map((o, i) => i));
    return {
      mode: 'cloze', key: card.key,
      prompt: card.ex.slice(0, m.start) + BLANK + card.ex.slice(m.end),
      options: order.map(i => opts[i]), answer: order.indexOf(0), letters: LETTERS,
      reveal: esc(card.ex.slice(0, m.start)) + '<mark>' + esc(card.ex.slice(m.start, m.end)) + '</mark>' + esc(card.ex.slice(m.end))
    };
  }

  function genSyn(card, pool) {
    const mine = K.splitSyn(card.syn), lower = mine.map(s => s.toLowerCase());
    if (!mine.length) return null;
    const correct = mine[Math.floor(Math.random() * mine.length)];
    const bad = new Set(), cands = [];
    pool.filter(c => c.key !== card.key && c.pos === card.pos).forEach(c => K.splitSyn(c.syn).forEach(s => {
      const l = s.toLowerCase();
      if (!lower.includes(l) && l !== card.key && !bad.has(l)) { bad.add(l); cands.push(s); }
    }));
    if (cands.length < 4) return null;
    const opts = [correct, ...K.shuffle(cands).slice(0, 4)];
    const order = K.shuffle(opts.map((o, i) => i));
    return {
      mode: 'syn', key: card.key, prompt: card.en,
      options: order.map(i => opts[i]), answer: order.indexOf(0), letters: LETTERS,
      reveal: null
    };
  }

  // Görülmüş kartlardan (önce vadesi gelenler) en fazla n soru üretir.
  function build(mode, n) {
    const active = st.activeCards();
    const seen = active.filter(c => st.cs(c.key));
    const t = K.dayNum();
    const ordered = K.shuffle(seen.slice()).sort((a, b) => (st.cs(a.key).due <= t ? 0 : 1) - (st.cs(b.key).due <= t ? 0 : 1));
    const gen = mode === 'cloze' ? genCloze : genSyn, qs = [];
    for (const c of ordered) {
      if (qs.length >= n) break;
      const q = gen(c, active);
      if (q) qs.push(q);
    }
    return { questions: qs, seenCount: seen.length };
  }

  K.quiz = { build, genCloze, genSyn };
})();
