const DAILY = 25;
const INTERVALS = [0, 1, 3, 7, 14, 30]; // kutu başına tekrar aralığı (gün)
const KEY = 'kelime-v1';
const $ = id => document.getElementById(id);
const today = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const dayNum = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5); };

let state = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) {}
  return { words: {}, daily: { date: today(), newCount: 0, done: 0 } };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
if (state.daily.date !== today()) state.daily = { date: today(), newCount: 0, done: 0 };

let queue = [], current = null, flipped = false, total = 0;

function buildQueue() {
  const now = dayNum();
  const due = WORDS.filter(w => { const s = state.words[w.id]; return s && s.due <= now; })
    .sort((a, b) => state.words[a.id].due - state.words[b.id].due);
  const room = Math.max(0, DAILY - state.daily.newCount);
  const fresh = WORDS.filter(w => !state.words[w.id]).slice(0, room);
  queue = [...due.map(w => ({ w, review: true })), ...fresh.map(w => ({ w, review: false }))];
  total = queue.length + state.daily.done;
}

function render() {
  const stage = $('stage'); stage.innerHTML = '';
  $('count').textContent = `Bugün: ${state.daily.done} / ${total}`;
  $('bar').style.width = (total ? state.daily.done / total * 100 : 100) + '%';
  const footer = document.querySelector('footer');
  if (!queue.length) {
    current = null;
    const known = Object.values(state.words).filter(s => s.box >= 3).length;
    stage.innerHTML = `<div class="done"><h2>🎉 Bugünlük bitti</h2><p>${state.daily.done} kelime çalıştın.</p><p>Öğrenilmiş: ${known} / ${WORDS.length}</p><button id="more">Biraz daha çalış (+10)</button></div>`;
    $('more').onclick = () => { state.daily.newCount = Math.max(0, state.daily.newCount - 10); save(); buildQueue(); render(); };
    footer.style.visibility = 'hidden';
    return;
  }
  footer.style.visibility = 'visible';
  current = queue[0]; flipped = false;
  const c = document.createElement('div'); c.className = 'card'; c.id = 'card';
  c.innerHTML = `${current.review ? '<span class="rev">tekrar</span>' : ''}<span class="tag y">BİLİYORUM</span><span class="tag n">BİLMİYORUM</span><div class="en">${current.w.en}</div><div class="hint">Anlamı için dokun</div>`;
  stage.appendChild(c);
  bindDrag(c);
}

function flip() {
  if (flipped || !current) return; flipped = true;
  const w = current.w, c = $('card');
  c.querySelector('.hint').outerHTML = `<div class="tr">${w.tr}</div><div class="syn">≈ ${w.syn}</div><div class="ex">“${w.ex}”</div>`;
  speak(w.en);
}
function speak(t) {
  try { const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}

function answer(known) {
  if (!current) return;
  const w = current.w, now = dayNum();
  const s = state.words[w.id] || { box: 0, due: now };
  if (!state.words[w.id]) state.daily.newCount++;
  queue.shift();
  if (known) {
    s.box = Math.min(s.box + 1, INTERVALS.length - 1);
    s.due = now + INTERVALS[s.box];
    state.daily.done++;
  } else {
    s.box = 0; s.due = now;
    queue.splice(Math.min(4, queue.length), 0, { w, review: true }); // birkaç kart sonra tekrar göster
    total++;
  }
  state.words[w.id] = s; save();
}

function fling(known) {
  const c = $('card'); if (!c || !current) return;
  c.classList.remove('drag');
  c.style.transform = `translateX(${known ? 600 : -600}px) rotate(${known ? 25 : -25}deg)`;
  c.style.opacity = '0';
  answer(known);
  setTimeout(render, 220);
}

function bindDrag(c) {
  let x0 = 0, dx = 0, moved = false, down = false;
  const ty = c.querySelector('.tag.y'), tn = c.querySelector('.tag.n');
  c.addEventListener('pointerdown', e => { down = true; moved = false; dx = 0; x0 = e.clientX; c.classList.add('drag'); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', e => {
    if (!down) return; dx = e.clientX - x0; if (Math.abs(dx) > 6) moved = true;
    c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    ty.style.opacity = Math.max(0, dx / 120); tn.style.opacity = Math.max(0, -dx / 120);
  });
  const end = () => {
    if (!down) return; down = false; c.classList.remove('drag');
    if (!moved) { flip(); return; }
    if (dx > 100) fling(true); else if (dx < -100) fling(false);
    else { c.style.transform = ''; ty.style.opacity = tn.style.opacity = 0; }
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}

$('yes').onclick = () => fling(true);
$('no').onclick = () => fling(false);
$('statsBtn').onclick = () => {
  const ws = Object.entries(state.words).map(([id, s]) => ({ w: WORDS[id], s }));
  const hard = ws.filter(x => x.s.box === 0).map(x => x.w.en);
  const known = ws.filter(x => x.s.box >= 3).length;
  const sh = $('sheet'); sh.hidden = false;
  sh.innerHTML = `<div class="box"><h3>İstatistik</h3><p>Görülen: ${ws.length} · Öğrenilmiş: ${known} · Toplam: ${WORDS.length}</p><p><b>Tekrar bekleyenler (${hard.length}):</b></p><ul>${hard.map(h => `<li>${h}</li>`).join('') || '<li>Yok</li>'}</ul></div>`;
  sh.onclick = e => { if (e.target === sh) sh.hidden = true; };
};
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') fling(true);
  if (e.key === 'ArrowLeft') fling(false);
  if (e.key === ' ') flip();
});

buildQueue(); render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
