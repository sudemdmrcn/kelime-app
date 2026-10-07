/* app.js: arayüz. Görünümler: home, study (kart), quiz, days, hard, stats, settings.
   Mantık store.js / quiz.js / data.js içindedir; burada sadece oturum akışı ve ekran çizimi var. */
(function () {
  const K = window.K, st = K.store;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = $('app');
  let view = 'home', S = null, Q = null;

  /* ---------- Yardımcılar ---------- */
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600);
  }
  function sheet(html) {
    const sh = $('sheet'); sh.hidden = false; sh.innerHTML = `<div class="box">${html}</div>`;
    sh.onclick = e => { if (e.target === sh) closeSheet(); };
    return sh;
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }
  function confirmSheet(title, text, okLabel) {
    return new Promise(res => {
      const sh = sheet(`<h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn accent" id="cOk">${esc(okLabel || 'Tamam')}</button><button class="btn" id="cNo">Vazgeç</button>`);
      sh.querySelector('#cOk').onclick = () => { closeSheet(); res(true); };
      sh.querySelector('#cNo').onclick = () => { closeSheet(); res(false); };
      sh.onclick = e => { if (e.target === sh) { closeSheet(); res(false); } };
    });
  }
  function speak(t) {
    try { const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  }
  const badge = c => c.pos && c.pos !== 'other' ? `<span class="badge ${c.pos}">${c.pos}</span>` : '';
  function go(v) { view = v; closeSheet(); render(); }
  function highlight(c) {
    const m = K.findInSentence(c);
    if (!m) return esc(c.ex);
    return esc(c.ex.slice(0, m.start)) + '<mark>' + esc(c.ex.slice(m.start, m.end)) + '</mark>' + esc(c.ex.slice(m.end));
  }

  /* ---------- Ana ekran ---------- */
  function counts() {
    const due = st.dueKeys().length, allow = st.newAllowance(due);
    return { due, newN: Math.min(allow, st.unseenKeys(allow).length) };
  }
  function renderHome() {
    const { due, newN } = counts(), streak = st.streak(), hard = st.hardKeys().length;
    const seenAny = Object.keys(st.state.cards).length;
    const reduced = st.state.settings.autoReduce && due > 100;
    root.innerHTML = `<div class="view"><div class="top"><h1>YDS Kelime</h1><button class="chip" id="streak">🔥 ${streak} gün</button></div>
      <div class="scroll">
      ${st.memOnly ? '<div class="banner">⚠️ Tarayıcı depolaması kapalı, ilerleme kaydedilemiyor.</div>' : ''}
      ${st.backupDue() ? '<div class="banner">💾 Bir haftadan uzun süredir yedek almadın.<button id="bk">Yedekle</button></div>' : ''}
      <div class="hero"><div class="big">${due + newN} kelime</div>
        <div class="sub">${due} tekrar · ${newN} yeni${reduced ? ' (tekrar çok, yeni kelime azaltıldı)' : ''}</div>
        <button class="btn primary" id="start" ${due + newN ? '' : 'disabled'}>${due + newN ? 'Günlük çalışmaya başla' : 'Bugünlük bitti 🎉'}</button></div>
      <div class="grid">
        <button class="tile" data-go="cloze"><b>Boşluk doldurma</b><span>YDS tarzı, 5 şık</span></button>
        <button class="tile" data-go="syn"><b>Eş anlamlı</b><span>Doğru eş anlamlıyı seç</span></button>
        <button class="tile" data-go="hard"><b>Zor kelimeler</b><span>${hard} kelime</span></button>
        <button class="tile" data-go="days"><b>Günler</b><span>${K.dayCount} gün, 25'er kelime</span></button>
        <button class="tile" data-go="stats"><b>İstatistik</b><span>${seenAny} kelime görüldü</span></button>
        <button class="tile" data-go="settings"><b>Ayarlar</b><span>Yedek, yön, limit</span></button>
      </div></div></div>`;
    $('start') && ($('start').onclick = startDaily);
    $('bk') && ($('bk').onclick = backup);
    $('streak').onclick = () => toast('Üst üste çalıştığın gün sayısı');
    root.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      const g = b.dataset.go;
      if (g === 'cloze' || g === 'syn') startQuiz(g); else if (g === 'hard') startHard(); else go(g);
    });
  }

  /* ---------- Kart çalışma oturumu ---------- */
  function startSession(keys, kind, title) {
    S = { items: keys.map(k => ({ key: k })), total: keys.length, done: 0, kind, title, revealed: false, cur: null };
    view = 'study'; render();
  }
  function startDaily() {
    const due = st.dueKeys(), allow = st.newAllowance(due.length);
    const fresh = st.unseenKeys(allow);
    // tekrarlar önce, sonra yeni kelimeler (tekrar kendi içinde karışık)
    startSession([...due, ...fresh], 'daily', 'Günlük çalışma');
  }
  function startHard() {
    const k = st.hardKeys();
    if (!k.length) { toast('Henüz zor kelime yok'); return; }
    startSession(K.shuffle(k), 'hard', 'Zor kelimeler');
  }
  function startDay(d) {
    const keys = K.cards.filter(c => c.set === 'yds' && c.day === d).map(c => c.key);
    startSession(K.shuffle(keys), 'day', `Gün ${d}`);
  }

  function frontHTML(c, dir) {
    const lead = dir === 'en-tr'
      ? `<div class="en">${esc(c.en)}</div>`
      : `<div class="en" style="font-size:30px">${esc(c.tr)}</div>`;
    return `${badge(c)}${lead}<div class="hint">Önce kendin hatırlamaya çalış, sonra dokun</div>`;
  }
  function backHTML(c, dir) {
    const first = dir === 'en-tr' ? `<div class="tr">${esc(c.tr)}</div>` : `<div class="tr">${esc(c.en)}</div>`;
    const extra = c.extra.length ? `<div class="more">${c.extra.map(x => `<div><b>${esc(x[0])}</b><br><em>${esc(x[1])}</em></div>`).join('')}</div>` : '';
    const head = dir === 'en-tr' ? `<div class="en" style="font-size:30px">${esc(c.en)}</div>` : `<div class="en" style="font-size:24px;color:var(--mut)">${esc(c.tr)}</div>`;
    return `${badge(c)}${head}${first}<div class="syn">≈ ${esc(c.syn)}</div><div class="ex">“${highlight(c)}”</div>${extra}`;
  }

  function renderStudy() {
    if (!S.items.length) return renderDone();
    const dir = st.state.settings.dir, cur = S.cur = S.items[0], c = K.byKey[cur.key];
    S.revealed = false;
    const isRev = st.cs(cur.key) && S.kind === 'daily';
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back" aria-label="Geri">←</button>
      <div class="bar"><i style="width:${S.total ? S.done / S.total * 100 : 100}%"></i></div><span class="count">${S.done} / ${S.total}</span>
      <button class="chip" id="dir">${dir === 'en-tr' ? 'EN→TR' : 'TR→EN'}</button></div>
      <div class="stage"><div class="card" id="card">${isRev ? '<span class="rev">tekrar</span>' : ''}<span class="tag y">BİLDİM</span><span class="tag n">BİLMEDİM</span><span class="tag h">ZORLANDIM</span>
        <button class="speak" id="spk" aria-label="Seslendir">🔊</button><div id="face">${frontHTML(c, dir)}</div></div></div>
      <div class="actions"><button class="act no" data-g="0" disabled>Bilmedim</button><button class="act hard" data-g="1" disabled>Zorlandım</button><button class="act yes" data-g="2" disabled>Bildim</button></div></div>`;
    $('back').onclick = () => go('home');
    $('dir').onclick = () => { st.setSetting('dir', dir === 'en-tr' ? 'tr-en' : 'en-tr'); renderStudy(); };
    $('spk').onpointerdown = e => e.stopPropagation();
    $('spk').onclick = e => { e.stopPropagation(); speak(c.en); };
    root.querySelectorAll('.act').forEach(b => b.onclick = () => gradeCur(+b.dataset.g));
    bindDrag($('card'));
  }
  function reveal() {
    if (S.revealed) return; S.revealed = true;
    const c = K.byKey[S.cur.key];
    $('face').innerHTML = backHTML(c, st.state.settings.dir);
    root.querySelectorAll('.act').forEach(b => b.disabled = false);
    if (st.state.settings.autoSpeak) speak(c.en);
  }
  function gradeCur(g) {
    if (!S || !S.revealed) { const c = $('card'); if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } toast('Önce cevabı gör'); return; }
    const cur = S.cur, c = $('card');
    c.classList.remove('drag');
    c.style.transform = g === 2 ? 'translateX(600px) rotate(22deg)' : g === 0 ? 'translateX(-600px) rotate(-22deg)' : 'translateY(-700px)';
    c.style.opacity = '0';
    st.grade(cur.key, g); st.record('card', g === 2);
    S.items.shift();
    if (g === 0) S.items.splice(Math.min(3, S.items.length), 0, cur); else S.done++;
    if (g === 0) S.total = Math.max(S.total, S.done + S.items.length);
    setTimeout(renderStudy, 200);
  }
  function bindDrag(c) {
    let x0 = 0, y0 = 0, dx = 0, dy = 0, down = false, moved = false;
    const ty = c.querySelector('.tag.y'), tn = c.querySelector('.tag.n'), th = c.querySelector('.tag.h');
    c.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; down = true; moved = false; dx = dy = 0; x0 = e.clientX; y0 = e.clientY; c.classList.add('drag'); c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (!down || !S.revealed) { if (down && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 8) moved = true; return; }
      dx = e.clientX - x0; dy = e.clientY - y0; if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
      c.style.transform = `translate(${dx}px,${Math.min(0, dy)}px) rotate(${dx / 18}deg)`;
      ty.style.opacity = Math.max(0, dx / 120); tn.style.opacity = Math.max(0, -dx / 120);
      th.style.opacity = Math.abs(dy) > Math.abs(dx) ? Math.max(0, -dy / 120) : 0;
    });
    const end = () => {
      if (!down) return; down = false; c.classList.remove('drag');
      if (!S.revealed) { c.style.transform = ''; reveal(); return; }  // cevap gizliyken sadece açılır
      if (!moved) { c.style.transform = ''; return; }
      if (dx > 100) gradeCur(2); else if (dx < -100) gradeCur(0); else if (dy < -100) gradeCur(1);
      else { c.style.transform = ''; ty.style.opacity = tn.style.opacity = th.style.opacity = 0; }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }
  function renderDone() {
    const d = st.state.daily;
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>${esc(S.title)}</h1></div>
      <div class="done"><h2>🎉 Tamamlandı</h2><p>${S.done} kelime çalıştın. Bugün toplam ${d.reviewed} puanlama.</p>
      ${S.kind === 'daily' ? '<button class="btn accent" id="more">+10 yeni kelime ekle</button>' : ''}
      <button class="btn" id="home">Ana ekran</button></div></div>`;
    $('back').onclick = $('home').onclick = () => go('home');
    $('more') && ($('more').onclick = () => { st.state.daily.bonus += 10; st.save(); startDaily(); });
  }

  /* ---------- Quiz (boşluk doldurma, eş anlamlı) ---------- */
  function startQuiz(mode) {
    const r = K.quiz.build(mode, 10);
    if (!r.questions.length) {
      sheet(`<h3>Önce biraz kelime öğren</h3><p>${r.seenCount ? 'Görülen kelimelerden soru üretilemedi.' : 'Quiz için en az birkaç kelime görmüş olman gerekiyor.'} Günlük çalışmayı yapıp tekrar dene.</p><button class="btn accent" id="ok">Tamam</button>`).querySelector('#ok').onclick = closeSheet;
      return;
    }
    Q = { mode, qs: r.questions, i: 0, ok: 0, answered: false };
    view = 'quiz'; render();
  }
  function renderQuiz() {
    if (Q.i >= Q.qs.length) {
      root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>Sonuç</h1></div><div class="done"><h2>${Q.ok} / ${Q.qs.length}</h2><p>doğru cevap</p>
        <button class="btn accent" id="again">Yeni set</button><button class="btn" id="home">Ana ekran</button></div></div>`;
      $('back').onclick = $('home').onclick = () => go('home');
      $('again').onclick = () => startQuiz(Q.mode);
      return;
    }
    const q = Q.qs[Q.i]; Q.answered = false;
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><div class="bar"><i style="width:${Q.i / Q.qs.length * 100}%"></i></div><span class="count">${Q.i + 1} / ${Q.qs.length}</span></div>
      <div class="q scroll"><div class="qtype">${q.mode === 'cloze' ? 'Boşluğa uygun kelimeyi seç' : 'Eş anlamlısını seç'}</div>
        <div class="prompt ${q.mode === 'syn' ? 'word' : ''}">${esc(q.prompt)}</div>
        <div class="opts">${q.options.map((o, i) => `<button class="opt" data-i="${i}"><b>${q.letters[i]}</b>${esc(o)}</button>`).join('')}</div>
        <div id="fb"></div></div></div>`;
    $('back').onclick = () => go('home');
    root.querySelectorAll('.opt').forEach(b => b.onclick = () => answerQ(+b.dataset.i));
  }
  function answerQ(i) {
    if (Q.answered) return; Q.answered = true;
    const q = Q.qs[Q.i], c = K.byKey[q.key], ok = i === q.answer;
    root.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (j === q.answer) b.classList.add('ok'); else if (j === i) b.classList.add('bad'); });
    // Doğru ve vadesi gelmemiş kart için aralık uzatılmaz (şıklı soruda tahmin payı var); yanlış her zaman sıfırlar.
    if (!ok || st.isDue(q.key)) st.grade(q.key, ok ? 2 : 0);
    st.record(q.mode, ok);
    if (ok) Q.ok++;
    speak(c.en);
    $('fb').innerHTML = `<div class="opt-reveal"><b>${esc(c.en)}</b> = ${esc(c.tr)}<br>≈ ${esc(c.syn)}${q.reveal ? `<br><i>“${q.reveal}”</i>` : ''}</div><button class="btn accent" id="nx" style="margin-top:10px">${Q.i + 1 < Q.qs.length ? 'Sonraki' : 'Sonucu gör'}</button>`;
    $('nx').onclick = () => { Q.i++; renderQuiz(); };
    $('nx').scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Günler ---------- */
  function renderDays() {
    const sd = st.state.settings.startDay;
    let h = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>Günler</h1></div><div class="scroll">`;
    for (let d = 1; d <= K.dayCount; d++) {
      const cs = K.cards.filter(c => c.set === 'yds' && c.day === d), seen = cs.filter(c => st.cs(c.key) && st.cs(c.key).reps >= 1).length, learned = cs.filter(c => st.isLearned(c.key)).length;
      const p = Math.round(seen / cs.length * 100);
      h += `<button class="row" data-d="${d}"><div class="grow"><b>Gün ${d}${d === sd ? ' · yeni kelimeler buradan' : ''}</b><small>${seen}/${cs.length} görüldü · ${learned} öğrenildi · %${p}</small><div class="bar"><i style="width:${p}%"></i></div></div>›</button>`;
    }
    root.innerHTML = h + '</div></div>';
    $('back').onclick = () => go('home');
    root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => dayMenu(+b.dataset.d));
  }
  function dayMenu(d) {
    const cs = K.cards.filter(c => c.set === 'yds' && c.day === d);
    const sh = sheet(`<h3>Gün ${d}</h3><p>${cs.slice(0, 6).map(c => esc(c.en)).join(', ')}…</p>
      <button class="btn accent" id="study">Bu günü çalış</button><button class="btn" id="from">Yeni kelimeler buradan başlasın</button><button class="btn" id="cancel">Kapat</button>`);
    sh.querySelector('#study').onclick = () => startDay(d);
    sh.querySelector('#from').onclick = () => { st.setSetting('startDay', d); closeSheet(); toast(`Yeni kelimeler Gün ${d}'den gelecek`); renderDays(); };
    sh.querySelector('#cancel').onclick = closeSheet;
  }

  /* ---------- Zor kelimeler ---------- */
  function renderHard() {
    const keys = st.hardKeys();
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>Zor kelimeler</h1></div><div class="scroll">
      ${keys.length ? '<button class="btn accent" id="go" style="margin-bottom:12px">Sadece bunlarla çalış</button>' : '<p>Henüz zorlandığın kelime yok.</p>'}
      ${keys.map(k => { const c = K.byKey[k]; return `<div class="row"><div class="grow"><b>${esc(c.en)} ${badge(c)}</b><small>${esc(c.tr)}</small></div><small>${st.cs(k).miss}× yanlış</small></div>`; }).join('')}</div></div>`;
    $('back').onclick = () => go('home'); $('go') && ($('go').onclick = startHard);
  }

  /* ---------- İstatistik ---------- */
  function renderStats() {
    const a = st.activeCards(), cs = st.state.cards;
    const seen = a.filter(c => cs[c.key]).length, learned = a.filter(c => st.isLearned(c.key)).length, due = st.dueKeys().length;
    const m = st.state.stats.modes, pct = x => x.n ? Math.round(x.ok / x.n * 100) + '%' : '–';
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>İstatistik</h1></div><div class="scroll">
      <div class="kv"><div><b>${learned}</b><span>öğrenilen / ${a.length}</span></div><div><b>${seen}</b><span>görülen</span></div>
      <div><b>🔥 ${st.streak()}</b><span>günlük seri</span></div><div><b>${due}</b><span>bugünkü tekrar</span></div></div>
      <div class="sect">Doğruluk (mod bazlı)</div>
      <div class="kv"><div><b>${pct(m.card)}</b><span>Kart (Bildim oranı, ${m.card.n} cevap)</span></div><div><b>${pct(m.cloze)}</b><span>Boşluk doldurma (${m.cloze.n})</span></div><div><b>${pct(m.syn)}</b><span>Eş anlamlı (${m.syn.n})</span></div></div>
      <p style="color:var(--mut);font-size:13px">Öğrenilen: üst üste 3 başarılı tekrar yapılan kelime.</p></div></div>`;
    $('back').onclick = () => go('home');
  }

  /* ---------- Yedekleme ---------- */
  async function backup() {
    const name = `kelime-yedek-${new Date().toISOString().slice(0, 10)}.json`, json = st.exportJSON();
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name });   // iOS paylaşım menüsü: "Dosyalara Kaydet"
        st.markBackup(); toast('Yedek alındı'); render(); return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    st.markBackup(); toast('Yedek indirildi'); render();
  }
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const text = await f.text(), n = Object.keys((JSON.parse(text).state || {}).cards || {}).length;
      if (!await confirmSheet('Yedeği yükle', `Yedekte ${n} kelimelik ilerleme var. Şu anki ilerlemenin yerine geçecek.`, 'Yükle')) return;
      st.importJSON(text); toast('Yedek yüklendi'); go('home');
    } catch (err) { toast(err.message || 'Yedek okunamadı'); }
  };

  /* ---------- Ayarlar ---------- */
  function renderSettings() {
    const s = st.state.settings, last = s.lastBackup ? new Date(s.lastBackup).toLocaleDateString('tr-TR') : 'hiç alınmadı';
    root.innerHTML = `<div class="view"><div class="top"><button class="icon-btn" id="back">←</button><h1>Ayarlar</h1></div><div class="scroll">
      <div class="sect">Çalışma</div>
      <div class="set"><div class="grow">Günlük yeni kelime<small>Tekrarlar bunun dışında</small></div><select id="npd">${[10, 15, 20, 25, 30, 40].map(n => `<option ${n === s.newPerDay ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="set"><div class="grow">Tekrar çoksa yeni kelimeyi azalt<small>100'den fazla tekrar birikirse</small></div><input type="checkbox" class="switch" id="ar" ${s.autoReduce ? 'checked' : ''}></div>
      <div class="set"><div class="grow">Kart yönü</div><select id="dir"><option value="en-tr" ${s.dir === 'en-tr' ? 'selected' : ''}>EN → TR</option><option value="tr-en" ${s.dir === 'tr-en' ? 'selected' : ''}>TR → EN</option></select></div>
      <div class="set"><div class="grow">Cevapta otomatik seslendir</div><input type="checkbox" class="switch" id="as" ${s.autoSpeak ? 'checked' : ''}></div>
      <div class="set"><div class="grow">Genel kelimeleri de dahil et<small>YDS dışı başlangıç listesi (${K.cards.filter(c => c.set === 'legacy').length} kelime)</small></div><input type="checkbox" class="switch" id="lg" ${s.legacy ? 'checked' : ''}></div>
      <div class="sect">Yedekleme</div>
      <div class="set"><div class="grow">Son yedek<small>${esc(last)}</small></div></div>
      <button class="btn accent" id="exp" style="margin-top:10px">Yedeği indir / paylaş</button>
      <button class="btn" id="imp" style="margin-top:8px">Yedekten geri yükle</button>
      <div class="sect">Tehlikeli bölge</div>
      <button class="btn" id="rst" style="color:var(--no)">Tüm ilerlemeyi sıfırla</button></div></div>`;
    $('back').onclick = () => go('home');
    $('npd').onchange = e => st.setSetting('newPerDay', +e.target.value);
    $('ar').onchange = e => st.setSetting('autoReduce', e.target.checked);
    $('dir').onchange = e => st.setSetting('dir', e.target.value);
    $('as').onchange = e => st.setSetting('autoSpeak', e.target.checked);
    $('lg').onchange = e => st.setSetting('legacy', e.target.checked);
    $('exp').onclick = backup;
    $('imp').onclick = () => $('importFile').click();
    $('rst').onclick = async () => { if (await confirmSheet('Her şey silinecek', 'Önce yedek aldığından emin ol. Bu işlem geri alınamaz.', 'Sıfırla')) { st.reset(); toast('Sıfırlandı'); go('home'); } };
  }

  function render() {
    st.rollDay();
    ({ home: renderHome, study: renderStudy, quiz: renderQuiz, days: renderDays, hard: renderHard, stats: renderStats, settings: renderSettings })[view]();
  }
  document.addEventListener('keydown', e => {
    if (view !== 'study' || !S) return;
    if (e.key === ' ') { e.preventDefault(); reveal(); }
    else if (e.key === 'ArrowRight') gradeCur(2);
    else if (e.key === 'ArrowLeft') gradeCur(0);
    else if (e.key === 'ArrowUp') gradeCur(1);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && view === 'home') render(); });

  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
