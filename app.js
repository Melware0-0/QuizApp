// =====================================================================
// PARSER-START  (turns pasted text into questions)
// =====================================================================
function parseLetters(s){
  s = String(s).replace(/\band\b/gi, ',');
  const parts = s.split(/[,;\/&+\s]+/).map(p => p.trim()).filter(Boolean);
  const letters = [];
  for (const p of parts){
    const m = p.match(/^\(?([A-Ha-h])[).:\]]?$/);
    if (m) letters.push(m[1].toUpperCase());
    else break; // stop at the first word that isn't a letter, e.g. "Correct: A, C (bile and glycogen)"
  }
  return letters.length ? [...new Set(letters)] : null;
}

function parseQuestions(text){
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const questions = [], errors = [];
  let topic = '', cur = null, field = null, n = 0;

  const strip = s => s.replace(/\u00a0/g, ' ').replace(/\*\*|__/g, '').replace(/^\s*[-*•>]\s+/, '').trim();

  const check = c => {
    if (!c.q) return 'The question text is missing';
    if (c.opts.length < 2) return c.opts.length ? 'Only 1 answer option found' : 'No answer options found (expected lines like "A) ...")';
    if (c.opts.length > 8) return 'Too many options (max 8)';
    if (c.dupLetter) return 'Option ' + c.dupLetter + ' appears twice';
    if (c.correct == null) return c.correctRaw ? 'Couldn\'t read the correct answers "' + c.correctRaw + '"' : 'Missing a "Correct:" line';
    const have = new Set(c.opts.map(o => o.L));
    const bad = c.correct.filter(L => !have.has(L));
    if (bad.length) return '"Correct" lists ' + bad.join(', ') + ', but there is no option ' + bad.join('/');
    return null;
  };

  const finish = () => {
    if (!cur) return;
    const err = check(cur);
    if (err) errors.push({ n: cur.n, line: cur.line, text: cur.q, msg: err });
    else {
      const set = new Set(cur.correct);
      questions.push({
        topic: cur.topic,
        q: cur.q,
        options: cur.opts.map(o => ({ t: o.t.trim(), c: set.has(o.L) })),
        explain: cur.explain.trim()
      });
    }
    cur = null; field = null;
  };

  for (let i = 0; i < lines.length; i++){
    if (/^\s*(```|~~~)/.test(lines[i])) continue;      // ignore code fences
    const line = strip(lines[i]);
    if (!line) continue;
    let m;

    // Topic lines: "# Topic: Liver", "Topic: Liver" or a plain "## Liver" heading
    if ((m = line.match(/^#*\s*topic\s*[:\-–—]\s*(.*)$/i))) { finish(); topic = m[1].trim(); continue; }
    if ((m = line.match(/^#{1,6}\s+(.+)$/))) { finish(); topic = m[1].trim(); continue; }

    // New question: "Q:", "Q1.", "Question 3:", or "1." / "1)"
    m = line.match(/^(?:q(?:uestion)?\s*\d*\s*[:.)]|(\d{1,3})\s*[.)])\s*(.*)$/i);
    if (m && (!m[1] || !cur || cur.correct != null)){
      finish(); n++;
      cur = { n, line: i + 1, topic, q: m[2].trim(), opts: [], correct: null, correctRaw: '', explain: '', dupLetter: false };
      field = 'q'; continue;
    }
    if (!cur) continue; // stray text before the first question, e.g. "Here are your questions:"

    if ((m = line.match(/^(?:correct(?:\s*answers?)?|correct\s*answer\(s\)|answers?)\s*[:\-–—=]\s*(.*)$/i))){
      cur.correctRaw = m[1].trim(); cur.correct = parseLetters(m[1]); field = 'correct'; continue;
    }
    if ((m = line.match(/^(?:explain|explanation|why|reason)\s*[:\-–—]\s*(.*)$/i))){
      cur.explain = m[1].trim(); field = 'explain'; continue;
    }
    if (field !== 'explain' && (m = line.match(/^\(?([a-h])\s*[).:\]]\s*(.+)$/i))){
      const L = m[1].toUpperCase();
      if (cur.opts.some(o => o.L === L)) cur.dupLetter = L;
      cur.opts.push({ L, t: m[2] }); field = 'opt'; continue;
    }
    // Continuation of a longer line
    if (field === 'q') cur.q = (cur.q + ' ' + line).trim();
    else if (field === 'opt') cur.opts[cur.opts.length - 1].t += ' ' + line;
    else { cur.explain = (cur.explain + ' ' + line).trim(); field = 'explain'; }
  }
  finish();
  return { questions, errors };
}
// PARSER-END
// =====================================================================

(function(){
'use strict';

const STORE_KEY = 'studyquiz.v1';
const PROMPT = `Write [40] multiple-choice study questions on [TOPIC].
[Optional: Base them only on these notes: PASTE NOTES HERE]

Use exactly this format, with a blank line between questions:

# Topic: [Topic name]

Q: Question text
A) Option
B) Option
C) Option
D) Option
E) Option (optional)
Correct: A, C
Explain: 1–3 sentences explaining the concept and why the wrong options are wrong.

Rules:
- Each question has 4 or 5 options.
- 1 to 4 options are correct. Vary the number of correct answers across questions; don't make most of them single-answer.
- Don't hint at how many answers are correct (no "select two" or "which TWO").
- No "All of the above", "None of the above", or options that refer to other options by letter, because the options get shuffled.
- Keep correct and incorrect options similar in length and style so the answer isn't obvious.
- Wrong options should be plausible common mistakes, not obviously silly.
- Put the whole output in a single code block with no other text before or after it.`;

const SAMPLE = `# Topic: Biology

Q: Which of these are functions of the liver?
A) Producing bile
B) Pumping blood around the body
C) Storing glycogen
D) Filtering air
E) Breaking down toxins
Correct: A, C, E
Explain: The liver makes bile for fat digestion, stores glucose as glycogen, and breaks down toxins. Pumping blood is the heart's job and filtering air is done by the lungs.

Q: Which organelle produces most of a cell's ATP?
A) Nucleus
B) Mitochondrion
C) Ribosome
D) Golgi apparatus
Correct: B
Explain: Mitochondria carry out aerobic respiration, which makes most of the cell's ATP. Ribosomes make proteins, the Golgi packages them and the nucleus stores DNA.

# Topic: Space

Q: Which of these planets are gas giants?
A) Jupiter
B) Mars
C) Saturn
D) Venus
Correct: A, C
Explain: Jupiter and Saturn are gas giants made mostly of hydrogen and helium. Mars and Venus are rocky planets.`;

const PIN = /^(all|none|both|neither)\s+of\b/i;
const GOOD = ['Nailed it! 🎉', 'Yes! ✨', 'Correct! 🌟', 'Great job! 💫', 'Spot on! 🌈'];
const BAD = ['Not quite', 'So close!', 'Almost!', 'Not this time'];

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
const pick = a => a[Math.floor(Math.random() * a.length)];
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
let toastTimer;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600); }
async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
    ta.remove(); return ok;
  }
}

// ---------- storage ----------
function load(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw){
      const s = JSON.parse(raw);
      const sync = s.sync && typeof s.sync === 'object' ? { uid: s.sync.uid || null, hashes: s.sync.hashes && typeof s.sync.hashes === 'object' ? s.sync.hashes : {} } : { uid: null, hashes: {} };
      return { quizzes: Array.isArray(s.quizzes) ? s.quizzes.map(cleanQuiz).filter(Boolean) : [], theme: s.theme === 'plain' ? 'plain' : 'color', sync };
    }
  } catch(e){}
  return { quizzes: [], theme: 'color', sync: { uid: null, hashes: {} } };
}
function cleanQuiz(qz){
  if (!qz || !Array.isArray(qz.questions)) return null;
  return {
    id: qz.id || uid(), name: String(qz.name || 'Untitled quiz'), created: qz.created || Date.now(), updated: qz.updated || 0,
    questions: qz.questions.filter(q => q && q.q && Array.isArray(q.options) && q.options.length >= 2).map(q => ({
      id: q.id || uid(), topic: q.topic || '', q: String(q.q),
      options: q.options.map(o => ({ t: String(o.t ?? ''), c: !!o.c })),
      explain: q.explain || '', missed: !!q.missed, right: q.right | 0, wrong: q.wrong | 0
    }))
  };
}
let state = load();
function persist(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch(e){ toast('Couldn\'t save. Your browser may be blocking storage, so use Export backup.'); }
}
// Every change goes through save(): it stamps changed quizzes, stores them on this device and queues a cloud upload.
function save(){ markChanges(); persist(); schedulePush(); }
const getQuiz = id => state.quizzes.find(q => q.id === id);
const topicsOf = qz => [...new Set(qz.questions.map(q => q.topic || 'General'))];
const missedOf = qz => qz.questions.filter(q => q.missed);
const sig = q => (q.q + '|' + q.options.map(o => o.t).join('|')).toLowerCase().replace(/\s+/g, ' ').trim();

function applyTheme(){
  document.body.className = 't-' + state.theme;
}

// ---------- router ----------
let view = 'home';
function go(v){ view = v; render(true); window.scrollTo(0, 0); }
function render(animate){
  const html = VIEWS[view]();
  app.innerHTML = '<div class="wrap' + (animate ? ' enter' : '') + '">' + html + '</div>';
  AFTER[view] && AFTER[view]();
}

// ---------- views ----------
let impState = { text: '', target: '__new', name: '' };
let setup = null;
let session = null;
let manageId = null;

const VIEWS = {
  home(){
    const qs = state.quizzes;
    const list = qs.length ? qs.map((qz, i) => {
      const missed = missedOf(qz).length, topics = topicsOf(qz).length;
      return `<article class="card qitem" style="--i:${i};--c:var(--p${i % 7 + 1})">
        <div>
          <h3>${esc(qz.name)}</h3>
          <p class="meta">${plural(qz.questions.length, 'question')} · ${plural(topics, 'topic')}${missed ? ` · <span class="pill">${missed} missed</span>` : ''}</p>
        </div>
        <div class="btns">
          <button class="btn sm" data-act="setup" data-id="${qz.id}">Study</button>
          ${missed ? `<button class="btn sm ghost" data-act="retryMissed" data-id="${qz.id}">Retry missed</button>` : ''}
          <button class="btn sm ghost" data-act="manage" data-id="${qz.id}" aria-label="Manage ${esc(qz.name)}">Edit</button>
        </div>
      </article>`;
    }).join('') : `<div class="card empty anim">
        <h3 style="margin:0">No quizzes yet</h3>
        <ol>
          <li>Tap <b>Copy question prompt</b>.</li>
          <li>Paste it into a new Claude chat and fill in your topic.</li>
          <li>Copy Claude's answer, tap <b>Import questions</b> and paste it in.</li>
        </ol>
        <button class="btn ghost sm" data-act="sample">Try a sample quiz</button>
      </div>`;
    return `
      <header class="top"><h1 class="brand"><span class="blob">✿</span>Study Quiz</h1></header>
      <section class="card switcher anim">
        <div><p class="label">Design</p><p class="muted">${state.theme === 'color' ? 'Colourful blocks with animations' : 'Simple list with circles'}</p></div>
        <div class="seg" role="group" aria-label="Design">
          <button data-act="theme" data-v="color" class="${state.theme === 'color' ? 'on' : ''}">🌈 Colourful</button>
          <button data-act="theme" data-v="plain" class="${state.theme === 'plain' ? 'on' : ''}">○ Simple</button>
        </div>
      </section>
      ${accountCard()}
      <div class="row">
        <button class="btn" data-act="goImport">+ Import questions</button>
        <button class="btn ghost" data-act="copyPrompt">Copy question prompt</button>
      </div>
      <h2 class="section-title">Your quizzes</h2>
      ${list}
      <div class="backup muted">
        <span>Backup:</span>
        <button class="btn sm ghost" data-act="exportBackup" ${qs.length ? '' : 'disabled'}>Export</button>
        <button class="btn sm ghost" data-act="restore">Restore</button>
      </div>`;
  },

  import(){
    const opts = state.quizzes.map(q => `<option value="${q.id}" ${impState.target === q.id ? 'selected' : ''}>${esc(q.name)}</option>`).join('');
    return `
      <header class="top"><button class="back" data-act="home">← Back</button><h1>Import questions</h1></header>
      <section class="card anim">
        <div class="field">
          <label for="imp-target">Add to</label>
          <select id="imp-target"><option value="__new">A new quiz</option>${opts}</select>
        </div>
        <div class="field" id="name-field" ${impState.target === '__new' ? '' : 'hidden'}>
          <label for="imp-name">Quiz name</label>
          <input type="text" id="imp-name" placeholder="e.g. Biology – Cells" value="${esc(impState.name)}">
        </div>
        <div class="field">
          <label for="imp-text">Paste questions</label>
          <textarea id="imp-text" spellcheck="false" placeholder="Paste Claude's questions here…">${esc(impState.text)}</textarea>
        </div>
        <div class="report" id="imp-report"></div>
        <button class="btn" id="imp-go" data-act="doImport" disabled>Add questions</button>
        <details>
          <summary>Format guide</summary>
          <p class="muted">Each question needs a <b>Q:</b> line, 2–8 options (<b>A)</b>, <b>B)</b>…), a <b>Correct:</b> line and optionally an <b>Explain:</b> line. <b># Topic:</b> lines group questions. Blank lines, code fences and extra chat text are ignored.</p>
          <pre>${esc(SAMPLE.split('\n\n').slice(0, 2).join('\n\n'))}</pre>
        </details>
      </section>`;
  },

  setup(){
    const qz = getQuiz(setup.id); if (!qz) return VIEWS.home();
    const topics = topicsOf(qz);
    const pool = setupPool();
    const counts = [10, 20, 40].filter(x => x < pool.length);
    if (setup.count !== 'all' && !counts.includes(setup.count)) setup.count = 'all';
    const missed = missedOf(qz).length;
    return `
      <header class="top"><button class="back" data-act="home">← Back</button></header>
      <section class="card anim">
        <h1 style="margin:0 0 4px;font-size:24px">${esc(qz.name)}</h1>
        <p class="muted" style="margin:0 0 18px">${plural(qz.questions.length, 'question')}</p>
        ${topics.length > 1 ? `<div class="field"><p class="label">Topics</p><div class="chips">
          ${topics.map((t, i) => `<button class="chip ${setup.topics.has(t) ? 'on' : ''}" style="--c:var(--p${i % 7 + 1})" data-act="toggleTopic" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
        </div></div>` : ''}
        <div class="field"><p class="label">How many</p><div class="chips">
          ${counts.map(c => `<button class="chip ${setup.count === c ? 'on' : ''}" data-act="count" data-v="${c}">${c}</button>`).join('')}
          <button class="chip ${setup.count === 'all' ? 'on' : ''}" data-act="count" data-v="all">All (${pool.length})</button>
        </div></div>
        ${missed ? `<div class="field"><label class="check"><input type="checkbox" id="missedOnly" ${setup.missedOnly ? 'checked' : ''}> Only questions I got wrong last time (${missed})</label></div>` : ''}
        <button class="btn" data-act="start" ${pool.length ? '' : 'disabled'} style="width:100%;margin-top:6px">Start ${pool.length ? '→' : '(no questions selected)'}</button>
      </section>`;
  },

  quiz(){
    const { q, item } = current();
    const total = session.items.length;
    const pct = Math.round(session.idx / total * 100);
    const opts = item.order.map((oi, k) => {
      const o = q.options[oi];
      return `<button class="opt" data-act="toggle" data-k="${k}" aria-pressed="false" style="--i:${k};--c:var(--p${(item.hue + k) % 7 + 1})">
        <span class="letter">${'ABCDEFGH'[k]}</span><span class="otext">${esc(o.t)}</span><span class="mark"></span></button>`;
    }).join('');
    return `
      <header class="qtop">
        <button class="x" data-act="quit" aria-label="Leave quiz">✕</button>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span class="count">${session.idx + 1}/${total}</span>
      </header>
      <section class="card anim">
        ${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}
        <h2 class="qtext">${esc(q.q)}</h2>
        <p class="hint">Select every correct answer, then check.</p>
        <div class="opts">${opts}</div>
        <div id="after"></div>
        <div class="qactions"><button class="btn" id="mainBtn" data-act="submit" disabled>Check</button></div>
      </section>
      <p class="keys">Keyboard: 1–${item.order.length} to select · Enter to check / continue</p>`;
  },

  results(){
    const total = session.results.length;
    const right = session.results.filter(r => r.isRight).length;
    const pct = total ? Math.round(right / total * 100) : 0;
    const qz = getQuiz(session.quizId);
    const missedQs = session.results.filter(r => !r.isRight).map(r => qz && qz.questions.find(q => q.id === r.qid)).filter(Boolean);
    const msg = pct === 100 ? 'Perfect score! 🏆' : pct >= 80 ? 'Great work! 🌟' : pct >= 60 ? 'Nice — keep going! 💪' : 'Good practice. Retry the ones you missed 📚';
    return `
      <section class="card result-card anim" style="margin-top:20px">
        <p class="label">${esc(qz ? qz.name : 'Quiz')}</p>
        <div class="score">${pct}%</div>
        <p style="font-size:18px;font-weight:800;margin:0">${right} of ${total} correct</p>
        <p class="muted" style="margin:4px 0 0">${state.theme === 'color' ? msg : msg.replace(/\s*\p{Extended_Pictographic}/gu, '')}</p>
        ${missedQs.length ? `<ul class="missed-list">${missedQs.map(q => `<li>${esc(trunc(q.q, 110))}</li>`).join('')}</ul>` : ''}
        <div class="btns">
          ${missedQs.length ? `<button class="btn" data-act="retryRound">Retry the ${missedQs.length} I missed</button>` : ''}
          <button class="btn ghost" data-act="setup" data-id="${session.quizId}">Study again</button>
          <button class="btn ghost" data-act="home">Home</button>
        </div>
      </section>`;
  },

  manage(){
    const qz = getQuiz(manageId); if (!qz) return VIEWS.home();
    const groups = topicsOf(qz).map(t => {
      const rows = qz.questions.filter(q => (q.topic || 'General') === t).map(q => {
        const letters = q.options.map((o, i) => o.c ? 'ABCDEFGH'[i] : '').filter(Boolean).join(', ');
        return `<div class="qrow"><div style="flex:1"><p>${esc(q.q)}</p>
          <p class="meta">${q.options.length} options · correct: ${letters}${q.missed ? ' · <span class="pill">missed</span>' : ''}</p></div>
          <button class="iconbtn" data-act="delQ" data-qid="${q.id}" aria-label="Delete question">✕</button></div>`;
      }).join('');
      return `<h3 class="topic-h">${esc(t)}</h3>${rows}`;
    }).join('');
    return `
      <header class="top"><button class="back" data-act="home">← Back</button><h1>Edit quiz</h1></header>
      <section class="card anim">
        <div class="field"><label for="rename">Name</label>
          <div style="display:flex;gap:8px"><input type="text" id="rename" value="${esc(qz.name)}"><button class="btn sm" data-act="rename">Save</button></div>
        </div>
        <div class="btns">
          <button class="btn sm ghost" data-act="addMore">+ Add questions</button>
          <button class="btn sm ghost" data-act="copyText">Copy as text</button>
          <button class="btn sm ghost" data-act="resetMissed">Clear missed list</button>
          <button class="btn sm danger" data-act="delQuiz">Delete quiz</button>
        </div>
      </section>
      <section class="card" style="margin-top:14px">
        <p class="label">${plural(qz.questions.length, 'question')}</p>
        ${groups || '<p class="muted">No questions yet.</p>'}
      </section>`;
  }
};

const AFTER = {
  import(){ $('#imp-target').value = getQuiz(impState.target) ? impState.target : '__new'; updateReport(); },
  results(){ const total = session.results.length, right = session.results.filter(r => r.isRight).length;
    if (state.theme === 'color' && total && right / total >= 0.7) confetti(); }
};

// ---------- import ----------
let reportTimer;
function updateReport(){
  const box = $('#imp-report'), btn = $('#imp-go'); if (!box) return;
  if (!impState.text.trim()){
    box.innerHTML = '<p class="muted">Paste your questions above. They\'ll be checked as you go.</p>';
    btn.disabled = true; btn.textContent = 'Add questions'; return;
  }
  const r = parseQuestions(impState.text);
  const n = r.questions.length;
  const topics = [...new Set(r.questions.map(q => q.topic).filter(Boolean))];
  let html = n
    ? `<div class="ok">✓ Found ${plural(n, 'question')}${topics.length ? ' in ' + plural(topics.length, 'topic') + ': ' + esc(topics.join(', ')) : ''}</div>`
    : `<div class="warn">No complete questions found yet. Check the format guide below.</div>`;
  if (r.errors.length){
    html += `<div class="warn"><b>${plural(r.errors.length, 'question')} need${r.errors.length === 1 ? 's' : ''} fixing and will be skipped:</b><ul>${
      r.errors.slice(0, 20).map(e => `<li>Question ${e.n} (line ${e.line})${e.text ? ': “' + esc(trunc(e.text, 50)) + '”' : ''} — ${esc(e.msg)}</li>`).join('')
    }${r.errors.length > 20 ? `<li>…and ${r.errors.length - 20} more</li>` : ''}</ul></div>`;
  }
  box.innerHTML = html;
  btn.disabled = !n;
  btn.textContent = n ? 'Add ' + plural(n, 'question') : 'Add questions';
}
function doImport(){
  const r = parseQuestions(impState.text);
  if (!r.questions.length) return;
  let qz;
  if (impState.target === '__new' || !getQuiz(impState.target)){
    const firstTopic = r.questions.find(q => q.topic);
    const name = impState.name.trim() || (firstTopic ? firstTopic.topic : 'Quiz ' + new Date().toLocaleDateString());
    qz = { id: uid(), name, created: Date.now(), questions: [] };
    state.quizzes.unshift(qz);
  } else qz = getQuiz(impState.target);
  const seen = new Set(qz.questions.map(sig));
  let added = 0, dups = 0;
  r.questions.forEach(q => {
    const s = sig(q); if (seen.has(s)){ dups++; return; }
    seen.add(s); qz.questions.push({ id: uid(), ...q, missed: false, right: 0, wrong: 0 }); added++;
  });
  save();
  impState = { text: '', target: '__new', name: '' };
  toast('Added ' + plural(added, 'question') + ' to “' + qz.name + '”' + (dups ? ' · ' + plural(dups, 'duplicate') + ' skipped' : ''));
  go('home');
}

// ---------- study session ----------
function setupPool(){
  const qz = getQuiz(setup.id); if (!qz) return [];
  return qz.questions.filter(q => setup.topics.has(q.topic || 'General') && (!setup.missedOnly || q.missed));
}
function optionOrder(q){
  const idx = q.options.map((_, i) => i);
  const pinned = idx.filter(i => PIN.test(q.options[i].t));
  const rest = idx.filter(i => !PIN.test(q.options[i].t));
  return [...shuffle(rest), ...pinned];
}
function startSession(quizId, qs){
  if (!qs.length){ toast('No questions to study'); return; }
  session = {
    quizId, idx: 0, picked: new Set(), submitted: false, results: [],
    items: shuffle(qs).map(q => ({ qid: q.id, order: optionOrder(q), hue: Math.floor(Math.random() * 7) }))
  };
  go('quiz');
}
function current(){
  const qz = getQuiz(session.quizId);
  const item = session.items[session.idx];
  return { qz, item, q: qz.questions.find(x => x.id === item.qid) };
}
function toggleOpt(el){
  if (session.submitted) return;
  const k = +el.dataset.k;
  if (session.picked.has(k)) session.picked.delete(k); else session.picked.add(k);
  const on = session.picked.has(k);
  el.classList.toggle('sel', on); el.setAttribute('aria-pressed', on);
  $('#mainBtn').disabled = !session.picked.size;
}
function submit(){
  if (session.submitted || !session.picked.size) return;
  const { q, item } = current();
  const correctK = item.order.map((oi, k) => q.options[oi].c ? k : -1).filter(k => k >= 0);
  const hits = correctK.filter(k => session.picked.has(k)).length;
  const extras = session.picked.size - hits;
  const isRight = hits === correctK.length && extras === 0;
  session.submitted = true;
  q.missed = !isRight;
  if (isRight) q.right = (q.right | 0) + 1; else q.wrong = (q.wrong | 0) + 1;
  save();
  session.results.push({ qid: q.id, isRight });

  document.querySelectorAll('.opt').forEach(el => {
    const k = +el.dataset.k, c = correctK.includes(k), p = session.picked.has(k);
    const cls = c && p ? 'right' : p ? 'wrongpick' : c ? 'missed' : 'dim';
    el.classList.add('done', cls);
    el.querySelector('.mark').innerHTML = cls === 'right' ? '✓' : cls === 'wrongpick' ? '✕' : cls === 'missed' ? '<span class="pill good">answer</span>' : '';
  });

  const color = state.theme === 'color';
  let html;
  if (isRight){
    html = `<div class="verdict good">${color ? pick(GOOD) : 'Correct'}</div>`;
    if (q.explain) html += `<button class="linkbtn" data-act="showExplain">Show explanation</button><div class="explain" id="exp" hidden><b>Why</b>${esc(q.explain)}</div>`;
  } else {
    const detail = `You picked ${hits} of ${plural(correctK.length, 'correct answer')}${extras ? ' and ' + extras + ' wrong one' + (extras === 1 ? '' : 's') : ''}.`;
    html = `<div class="verdict bad">${color ? pick(BAD) : 'Incorrect'}<small>${detail}</small></div>`;
    if (q.explain) html += `<div class="explain"><b>Why</b>${esc(q.explain)}</div>`;
  }
  $('#after').innerHTML = html;
  const btn = $('#mainBtn');
  const last = session.idx === session.items.length - 1;
  btn.textContent = last ? 'See results' : 'Next →';
  btn.dataset.act = 'next'; btn.disabled = false;
  if (!isRight && window.innerWidth < 700) setTimeout(() => { const a = $('#after'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 250);
}
function next(){
  session.idx++; session.picked = new Set(); session.submitted = false;
  // skip questions deleted mid-session
  while (session.idx < session.items.length && !current().q) session.idx++;
  go(session.idx >= session.items.length ? 'results' : 'quiz');
}

// ---------- backup ----------
function exportBackup(){
  const data = JSON.stringify({ app: 'study-quiz', version: 1, exported: new Date().toISOString(), quizzes: state.quizzes }, null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'quiz-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function restoreBackup(file){
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      const list = (Array.isArray(d) ? d : d.quizzes || []).map(cleanQuiz).filter(Boolean);
      if (!list.length) throw new Error();
      let added = 0, updated = 0;
      list.forEach(qz => {
        const i = state.quizzes.findIndex(x => x.id === qz.id);
        if (i >= 0){ state.quizzes[i] = qz; updated++; } else { state.quizzes.push(qz); added++; }
      });
      save(); render(false);
      toast('Restored ' + plural(added, 'new quiz').replace('quizs', 'quizzes') + (updated ? ', ' + updated + ' updated' : ''));
    } catch(e){ toast('That file isn\'t a Study Quiz backup'); }
  };
  r.readAsText(file);
}
function quizToText(qz){
  let out = '', lastTopic = null;
  qz.questions.forEach(q => {
    if ((q.topic || '') !== lastTopic){ lastTopic = q.topic || ''; if (lastTopic) out += '# Topic: ' + lastTopic + '\n\n'; }
    out += 'Q: ' + q.q + '\n';
    q.options.forEach((o, i) => out += 'ABCDEFGH'[i] + ') ' + o.t + '\n');
    out += 'Correct: ' + q.options.map((o, i) => o.c ? 'ABCDEFGH'[i] : '').filter(Boolean).join(', ') + '\n';
    if (q.explain) out += 'Explain: ' + q.explain + '\n';
    out += '\n';
  });
  return out.trim() + '\n';
}

function confetti(){
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)'];
  for (let i = 0; i < 70; i++){
    const c = document.createElement('i');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % 7];
    c.style.animationDuration = 2.2 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * .6 + 's';
    c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5000);
}

// ---------- cloud sync (Firebase) ----------
// Quizzes live in Firestore at users/{uid}/quizzes/{quizId}. This device keeps a full copy in
// localStorage, so the app works offline. state.sync.hashes remembers what each quiz looked like
// when it last matched the cloud: a different hash means "changed here, upload it", and a hash
// for a quiz that no longer exists means "deleted here, tell the other devices".
const cloud = { ready: false, user: null, loaded: false, status: '', unsub: null, pushing: false, timer: null, warned: {} };

function hashStr(s){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
const quizHash = qz => hashStr(JSON.stringify([qz.name, qz.created, qz.questions]));
const isDirty = qz => quizHash(qz) !== state.sync.hashes[qz.id];
function anyDirty(){
  const live = new Set(state.quizzes.map(q => q.id));
  return state.quizzes.some(isDirty) || Object.keys(state.sync.hashes).some(id => !live.has(id));
}
function markChanges(){
  const now = Date.now();
  state.quizzes.forEach(qz => { if (isDirty(qz)) qz.updated = now; });
}

function statusText(){
  return ({ syncing: 'Syncing…', synced: 'All changes synced ✓', offline: 'Offline. Changes will sync when you\'re back online.',
            error: 'Sync problem. Your quizzes are still saved on this device.' })[cloud.status] || '';
}
function setStatus(s){
  cloud.status = s;
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = statusText();
}
function schedulePush(delay){
  if (!cloud.user) return;
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(push, delay == null ? 1200 : delay);
}
async function push(){
  if (!cloud.user || !cloud.loaded || cloud.pushing) return; // wait until the cloud copy has been merged in first
  const uid = cloud.user.uid, hashes = state.sync.hashes, jobs = [];
  state.quizzes.forEach(qz => {
    if (!isDirty(qz)) return;
    const h = quizHash(qz);
    const data = { name: qz.name, created: qz.created, updated: qz.updated || Date.now(), deleted: false, questions: qz.questions };
    if (JSON.stringify(data).length > 900000){ // Firestore documents max out at 1 MB
      if (!cloud.warned[qz.id]){ cloud.warned[qz.id] = 1; toast('“' + qz.name + '” is too big to sync. Split it into smaller quizzes.'); }
      return;
    }
    jobs.push(Cloud.put(uid, qz.id, data).then(() => { hashes[qz.id] = h; }));
  });
  const live = new Set(state.quizzes.map(q => q.id));
  Object.keys(hashes).forEach(id => {
    if (!live.has(id)) jobs.push(Cloud.put(uid, id, { deleted: true, updated: Date.now() }).then(() => { delete hashes[id]; }));
  });
  if (!jobs.length){ setStatus(navigator.onLine ? 'synced' : 'offline'); return; }
  cloud.pushing = true;
  setStatus(navigator.onLine ? 'syncing' : 'offline');
  try { await Promise.all(jobs); persist(); setStatus('synced'); }
  catch(e){ console.error('Sync failed', e); setStatus('error'); }
  finally { cloud.pushing = false; }
  if (cloud.status === 'synced' && anyDirty()) schedulePush(300); // something changed while uploading
}

// Merge the cloud copy into this device. Newest edit wins for each quiz.
function applyRemote(docs){
  const hashes = state.sync.hashes;
  let changed = false;
  docs.forEach(d => {
    const i = state.quizzes.findIndex(q => q.id === d.id);
    const local = i >= 0 ? state.quizzes[i] : null;
    const remoteTime = d.updated || 0, localTime = local ? local.updated || 0 : 0;
    if (d.deleted){
      if (local && localTime <= remoteTime){ state.quizzes.splice(i, 1); changed = true; }
      if (!local || localTime <= remoteTime) delete hashes[d.id];
      return;
    }
    const r = cleanQuiz({ ...d, id: d.id });
    if (!r) return;
    const rh = quizHash(r);
    if (!local){ state.quizzes.push(r); hashes[r.id] = rh; changed = true; }
    else if (remoteTime > localTime){ state.quizzes[i] = r; hashes[r.id] = rh; changed = true; }
    else if (quizHash(local) === rh) hashes[r.id] = rh;
    // otherwise this device has the newer version, and push() uploads it
  });
  if (changed) state.quizzes.sort((a, b) => (b.created || 0) - (a.created || 0));
  persist();
  cloud.loaded = true;
  if (changed && ['home', 'manage', 'setup', 'results'].includes(view)) render(false);
  schedulePush(200);
}

function initCloud(){
  if (cloud.ready || !window.Cloud) return;
  cloud.ready = true;
  Cloud.onAuth(user => {
    if (cloud.unsub){ cloud.unsub(); cloud.unsub = null; }
    clearTimeout(cloud.timer);
    cloud.user = user; cloud.loaded = false;
    if (user){
      if (state.sync.uid !== user.uid){ state.sync = { uid: user.uid, hashes: {} }; persist(); }
      setStatus(navigator.onLine ? 'syncing' : 'offline');
      cloud.unsub = Cloud.subscribe(user.uid, applyRemote, err => { console.error('Sync error', err); setStatus('error'); });
    } else setStatus('');
    if (view === 'home') render(false);
  });
}
function accountCard(){
  if (!cloud.ready) return '';
  if (!cloud.user) return `<section class="card sync anim">
      <div><p class="label">Sync</p><p class="muted">Sign in to keep your quizzes in sync on your phone and laptop.</p></div>
      <button class="btn sm" data-act="signIn">Sign in with Google</button></section>`;
  return `<section class="card sync anim">
      <div><p class="label">Synced as ${esc(cloud.user.name)}</p><p class="muted" id="syncStatus">${esc(statusText())}</p></div>
      <button class="btn sm ghost" data-act="signOut">Sign out</button></section>`;
}

// ---------- actions ----------
const ACTIONS = {
  async signIn(){
    try { await Cloud.signIn(); }
    catch(e){
      console.error(e);
      toast(e && e.code === 'auth/unauthorized-domain'
        ? 'This web address isn\'t allowed yet. Add it in Firebase under Authentication → Settings → Authorized domains.'
        : 'Sign-in didn\'t work. Please try again.');
    }
  },
  async signOut(){
    if (!confirm('Sign out? Your quizzes stay on this device, but stop syncing.')) return;
    await Cloud.signOut();
  },
  home: () => go('home'),
  theme: el => { state.theme = el.dataset.v; save(); applyTheme(); render(true); },
  goImport: () => { impState.target = '__new'; go('import'); },
  async copyPrompt(){ toast(await copyText(PROMPT) ? 'Prompt copied. Paste it into a new Claude chat.' : 'Couldn\'t copy, sorry'); },
  sample(){ impState = { text: SAMPLE, target: '__new', name: 'Sample quiz' }; doImport(); },
  doImport,
  setup: el => {
    const qz = getQuiz(el.dataset.id); if (!qz) return;
    setup = { id: qz.id, topics: new Set(topicsOf(qz)), count: 'all', missedOnly: false };
    go('setup');
  },
  toggleTopic: el => { const t = el.dataset.t; setup.topics.has(t) ? setup.topics.delete(t) : setup.topics.add(t); render(false); },
  count: el => { setup.count = el.dataset.v === 'all' ? 'all' : +el.dataset.v; render(false); },
  start: () => { let pool = shuffle(setupPool()); if (setup.count !== 'all') pool = pool.slice(0, setup.count); startSession(setup.id, pool); },
  retryMissed: el => startSession(el.dataset.id, missedOf(getQuiz(el.dataset.id))),
  retryRound: () => {
    const qz = getQuiz(session.quizId);
    const ids = new Set(session.results.filter(r => !r.isRight).map(r => r.qid));
    startSession(session.quizId, qz.questions.filter(q => ids.has(q.id)));
  },
  toggle: toggleOpt,
  submit, next,
  showExplain: el => { $('#exp').hidden = false; el.remove(); },
  quit: () => { if (confirm('Leave this quiz? Answers so far are still saved.')) go('home'); },
  manage: el => { manageId = el.dataset.id; go('manage'); },
  rename: () => { const v = $('#rename').value.trim(); if (!v) return; getQuiz(manageId).name = v; save(); toast('Renamed'); render(false); },
  addMore: () => { impState = { text: '', target: manageId, name: '' }; go('import'); },
  async copyText(){ toast(await copyText(quizToText(getQuiz(manageId))) ? 'Questions copied as text' : 'Couldn\'t copy, sorry'); },
  resetMissed: () => { getQuiz(manageId).questions.forEach(q => q.missed = false); save(); toast('Missed list cleared'); render(false); },
  delQuiz: () => {
    const qz = getQuiz(manageId);
    if (!confirm('Delete “' + qz.name + '” and all its questions? This can\'t be undone.')) return;
    state.quizzes = state.quizzes.filter(q => q.id !== manageId); save(); toast('Quiz deleted'); go('home');
  },
  delQ: el => {
    const qz = getQuiz(manageId);
    if (!confirm('Delete this question?')) return;
    qz.questions = qz.questions.filter(q => q.id !== el.dataset.qid); save(); render(false);
  },
  exportBackup,
  restore: () => $('#restoreFile').click()
};

app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el, e);
});
app.addEventListener('input', e => {
  if (e.target.id === 'imp-text'){ impState.text = e.target.value; clearTimeout(reportTimer); reportTimer = setTimeout(updateReport, 200); }
  if (e.target.id === 'imp-name') impState.name = e.target.value;
});
app.addEventListener('change', e => {
  if (e.target.id === 'imp-target'){ impState.target = e.target.value; $('#name-field').hidden = impState.target !== '__new'; }
  if (e.target.id === 'missedOnly'){ setup.missedOnly = e.target.checked; render(false); }
});
$('#restoreFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) restoreBackup(f); e.target.value = ''; });

document.addEventListener('keydown', e => {
  if (view !== 'quiz' || !session || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 8){
    const el = document.querySelector('.opt[data-k="' + (n - 1) + '"]');
    if (el){ toggleOpt(el); e.preventDefault(); }
  } else if (e.key === 'Enter'){
    e.preventDefault();
    session.submitted ? next() : submit();
  }
});

window.addEventListener('cloud-ready', initCloud);
window.addEventListener('online', () => schedulePush(500));
window.addEventListener('offline', () => { if (cloud.user) setStatus('offline'); });

applyTheme();
render(true);
initCloud(); // in case firebase.js finished loading first
})();
