/* store.js: ilerleme verisi, aralıklı tekrar algoritması, istatistik, yedekleme.

   Saklama: localStorage 'kelime-v2'. Biçim:
   {
     v: 2, createdAt,
     cards:   { "<kelime>": { ef, int, reps, due, lapses, miss, seen, last } },
     daily:   { day, newCount, reviewed, bonus },
     settings:{ newPerDay, autoReduce, legacy, dir, autoSpeak, startDay, lastBackup },
     stats:   { streak:{last,count}, modes:{ card|cloze|syn: {n, ok} } }
   }
   Tarihler "gün numarası"dır (yerel saatle 1970'ten beri geçen gün), saat dilimi sorunu çıkarmaz.

   SM-2 benzeri algoritma (puan: 0 Bilmedim, 1 Zorlandım, 2 Bildim):
     ef   = kolaylık katsayısı (başlangıç 2.5, alt sınır 1.3). Çarpan olarak kullanılır.
     int  = bir sonraki tekrara kadar gün. reps = üst üste başarılı tekrar sayısı.
     Bilmedim : reps=0, int=0, ef-0.2, vade=bugün (oturumda birkaç kart sonra tekrar gelir)
     Zorlandım: ef-0.15, int = reps==0 ? 1 : int*1.2
     Bildim   : int = reps==0 ? 1 : reps==1 ? 3 : int*ef, (reps>=2 ise ef+0.05)
   "Öğrenilmiş" sayılma ölçütü: reps >= 3. */
(function () {
  const K = window.K = window.K || {};
  const KEY = 'kelime-v2', OLD_KEY = 'kelime-v1';
  const OLD_BOX_DAYS = [0, 1, 3, 7, 14, 30];

  const dayNum = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5); };
  K.dayNum = dayNum;
  K.dayToDate = n => new Date(n * 864e5 + new Date().getTimezoneOffset() * 6e4);

  const defaults = () => ({
    v: 2, createdAt: Date.now(), cards: {},
    daily: { day: dayNum(), newCount: 0, reviewed: 0, bonus: 0 },
    settings: { newPerDay: 25, autoReduce: true, legacy: false, dir: 'en-tr', autoSpeak: true, startDay: 1, lastBackup: 0 },
    stats: { streak: { last: 0, count: 0 }, modes: { card: { n: 0, ok: 0 }, cloze: { n: 0, ok: 0 }, syn: { n: 0, ok: 0 } } }
  });
  const merge = (def, src) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return def;
    for (const k of Object.keys(def)) {
      if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k])) def[k] = merge(def[k], src[k]);
      else if (src[k] !== undefined && typeof src[k] === typeof def[k]) def[k] = src[k];
    }
    return def;
  };

  // v1 (kelime sırası numarasına bağlı) -> v2 (kelime anahtarlı). Eski kayıt silinmez.
  function migrateV1(old) {
    const s = defaults(), rows = window.LEGACY_ROWS || [];
    Object.entries(old.words || {}).forEach(([idx, w]) => {
      const row = rows[+idx]; if (!row || !w) return;
      const box = Math.max(0, Math.min(5, w.box | 0));
      s.cards[row[0].trim().toLowerCase()] = { ef: 2.5, int: OLD_BOX_DAYS[box], reps: box, due: w.due | 0, lapses: 0, miss: box === 0 ? 1 : 0, seen: w.due | 0, last: box > 0 ? 2 : 0 };
    });
    return s;
  }

  function normalize(src) {
    const s = merge(defaults(), src);
    s.cards = {};
    for (const [k, c] of Object.entries((src && src.cards) || {})) {
      if (!c || typeof c !== 'object') continue;
      s.cards[k] = { ef: +c.ef || 2.5, int: c.int | 0, reps: c.reps | 0, due: c.due | 0, lapses: c.lapses | 0, miss: c.miss | 0, seen: c.seen | 0, last: c.last | 0 };
    }
    return s;
  }

  let memOnly = false;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      const old = localStorage.getItem(OLD_KEY);
      if (old) return migrateV1(JSON.parse(old));
    } catch (e) { memOnly = true; }
    return defaults();
  }
  let state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { memOnly = true; } }
  function rollDay() {
    const t = dayNum();
    if (state.daily.day !== t) { state.daily = { day: t, newCount: 0, reviewed: 0, bonus: 0 }; save(); }
  }
  rollDay();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  /* ---------- Okuma yardımcıları ---------- */
  const st = K.store = {
    get state() { return state; },
    get memOnly() { return memOnly; },
    save, rollDay,
    activeCards() { return K.cards.filter(c => c.set === 'yds' || state.settings.legacy); },
    cs: key => state.cards[key],
    isDue: key => { const c = state.cards[key]; return !!c && c.due <= dayNum(); },
    isLearned: key => { const c = state.cards[key]; return !!c && c.reps >= 3; },

    // Vadesi gelen kartlar (karışık sırada: tür ve gün bazında sıralanmaz)
    dueKeys() {
      const t = dayNum();
      return shuffle(st.activeCards().filter(c => state.cards[c.key] && state.cards[c.key].due <= t).map(c => c.key));
    },
    // Bugün alınabilecek yeni kelime hakkı. Vadesi gelen tekrar 100'ü aşarsa her 4 fazla tekrar için 1 yeni kelime kısılır.
    newAllowance(dueCount) {
      const s = state.settings;
      let n = s.newPerDay + state.daily.bonus;
      if (s.autoReduce && dueCount > 100) n -= Math.ceil((dueCount - 100) / 4);
      return Math.max(0, n - state.daily.newCount);
    },
    // Henüz görülmemiş kartlar: startDay'den itibaren sırayla, sonra baştaki günler, sonra legacy
    unseenKeys(limit) {
      const sd = state.settings.startDay;
      const rest = st.activeCards().filter(c => !state.cards[c.key]);
      const ord = c => c.set === 'legacy' ? 2 : c.day >= sd ? 0 : 1;
      return rest.map((c, i) => [ord(c), i, c.key]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(x => x[2]);
    },
    hardKeys() {
      return st.activeCards().filter(c => state.cards[c.key] && state.cards[c.key].miss > 0)
        .sort((a, b) => state.cards[b.key].miss - state.cards[a.key].miss).map(c => c.key);
    },

    /* ---------- Puanlama ---------- */
    grade(key, g) {
      rollDay();
      const t = dayNum();
      let c = state.cards[key];
      if (!c) { c = state.cards[key] = { ef: 2.5, int: 0, reps: 0, due: t, lapses: 0, miss: 0, seen: t, last: 0 }; state.daily.newCount++; }
      if (g === 0) {
        if (c.reps > 0) c.lapses++;
        c.miss++; c.reps = 0; c.int = 0; c.ef = Math.max(1.3, c.ef - 0.2); c.due = t;
      } else {
        if (g === 1) { c.ef = Math.max(1.3, c.ef - 0.15); c.int = c.reps === 0 ? 1 : Math.max(1, Math.round(c.int * 1.2)); }
        else { c.int = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.max(1, Math.round(c.int * c.ef)); if (c.reps >= 2) c.ef = Math.min(3, c.ef + 0.05); }
        c.reps++; c.due = t + c.int;
      }
      c.last = g;
      state.daily.reviewed++;
      save();
    },
    // İstatistik: günlük seri ve mod doğruluğu
    record(mode, ok) {
      const m = state.stats.modes[mode]; m.n++; if (ok) m.ok++;
      const t = dayNum(), s = state.stats.streak;
      if (s.last !== t) { s.count = s.last === t - 1 ? s.count + 1 : 1; s.last = t; }
      save();
    },
    streak() { const s = state.stats.streak, t = dayNum(); return s.last >= t - 1 ? s.count : 0; },
    setSetting(k, v) { state.settings[k] = v; save(); },

    /* ---------- Yedekleme ---------- */
    exportJSON() {
      return JSON.stringify({ app: 'kelime', version: 2, exportedAt: new Date().toISOString(), state });
    },
    importJSON(text) {
      let o; try { o = JSON.parse(text); } catch (e) { throw new Error('Dosya geçerli bir JSON değil.'); }
      if (!o || o.app !== 'kelime' || !o.state || typeof o.state.cards !== 'object') throw new Error('Bu bir Kelime yedek dosyası değil.');
      if (o.version > 2) throw new Error('Yedek daha yeni bir sürümden. Uygulamayı güncelleyin.');
      state = normalize(o.state); rollDay(); save();
    },
    markBackup() { state.settings.lastBackup = Date.now(); save(); },
    backupDue() {
      const s = state.settings, hasData = Object.keys(state.cards).length > 0;
      if (!hasData) return false;
      const ref = s.lastBackup || state.createdAt;
      return Date.now() - ref > 7 * 864e5;
    },
    reset() { state = defaults(); save(); }
  };

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  K.shuffle = shuffle;
})();
