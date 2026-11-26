/* ============================================================================
   study.js  —  Controller for the STAGE 1 CHECK review.

   The other three tabs drill hands on controls; this one drills the oral.
   It has its own full-width page (#studyApp) instead of the cockpit layout:

     HOME   PAVE first, then the other sections, as topic cards with a star
            rating each and an overall readiness ring. "Mock oral" deals 15
            questions from every topic, examiner style.
     TOPIC  Learn — tables, diagrams and interactive widgets (AOA lab, energy
            grid, inop flowchart, risk matrix, FRAT, personal minimums).
            Drill — the topic's activities run back to back and score.

   Activity runners: acronym (tiles, type-it, or a timed rapid-fire round),
   quiz (first click counts), match, sort, inop (go/no-go down the 91.213
   flow), systems (the examiner picks three — each worked as graded tasks on a
   live simulator, then a quiz) and systask (find / order / set / predict /
   locate on that simulator). The Systems Learn page is the same simulators
   mounted by mountLab(), under a 3D airplane when three.js is available.

   Drills show a progress bar and a combo counter. Every missed quiz, sort,
   inop and systems-task card lands in a Leitner review deck ("Review my misses") and comes
   back on a growing interval until it is answered right five times running.
   The mock oral is a conversation with an examiner, optionally read aloud.
   Keys: 1–9 answer, Enter / → next.

   Best scores persist in localStorage, as do the personal minimums, the
   review deck, the daily streak and the badges.

   API on window.StudyDrill: init() / activate() / deactivate() / start() /
   restart() / showHint()  (the last three are no-ops; the top-bar buttons
   are hidden in this mode)
   ========================================================================== */

const StudyDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const STORE = "c172-stage1-progress";
  const MINS = "c172-stage1-minimums";
  const STATS = "c172-stage1-stats";    // streak, best combo, badges, rapid-fire times
  const DECK = "c172-stage1-misses";    // review deck: card key -> { box, due, n }
  const PREFS = "c172-stage1-prefs";    // examiner voice on/off
  let root = null;
  let progress = load(STORE, {});
  let stats = load(STATS, {});
  let deck = load(DECK, {});
  let prefs = load(PREFS, {});

  function load(key, dflt) {
    try { return JSON.parse(localStorage.getItem(key)) || dflt; } catch (e) { return dflt; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* private mode */ }
  }

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  };
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stars = (pct) => pct == null ? 0 : pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 40 ? 1 : 0;
  const starHTML = (pct) => [0, 1, 2].map((k) => `<span class="star ${k < stars(pct) ? "on" : ""}">★</span>`).join("");

  function readiness() {
    const ids = Object.keys(STAGE1_TOPICS);
    const sum = ids.reduce((s, id) => s + (progress[id] || 0), 0);
    return Math.round(sum / ids.length);
  }
  function setTopbar() { $("progressText").textContent = `Stage 1 readiness ${readiness()}%`; }
  const calm = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

  /* ========================== streak & badges =========================== */
  const dayKey = (t) => new Date(t).toLocaleDateString("en-CA");   // local YYYY-MM-DD
  // the streak is alive if the last study day was today or yesterday
  const streakNow = () => [dayKey(Date.now()), dayKey(Date.now() - 864e5)].includes(stats.day) ? stats.streak || 0 : 0;
  function studied() {
    const today = dayKey(Date.now());
    if (stats.day === today) return;
    stats.streak = stats.day === dayKey(Date.now() - 864e5) ? (stats.streak || 0) + 1 : 1;
    stats.day = today;
    save(STATS, stats);
    if (stats.streak >= 3) award("streak3");
    if (stats.streak >= 7) award("streak7");
  }

  const BADGES = [
    ["first", "🛫", "First flight", "Finish any drill"],
    ["pave", "🧭", "PAVE master", "Three stars on every PAVE topic"],
    ["ready", "🏆", "Checkride ready", "Three stars on every topic"],
    ["oral", "🎤", "Perfect oral", "15 for 15 on a mock oral"],
    ["combo10", "🔥", "On a roll", "A 10-answer combo"],
    ["combo25", "☄️", "Unstoppable", "A 25-answer combo"],
    ["quick", "⚡", "Quick draw", "A clean rapid-fire acronym"],
    ["streak3", "📅", "Three in a row", "Study three days running"],
    ["streak7", "🗓️", "Week streak", "Study seven days running"],
    ["clean", "🧹", "Clean slate", "Empty the review deck"],
  ];
  function award(id) {
    stats.badges = stats.badges || {};
    if (stats.badges[id]) return;
    stats.badges[id] = Date.now(); save(STATS, stats);
    const b = BADGES.find((x) => x[0] === id);
    toast(`<span class="s1-toast-ic">${b[1]}</span><span><small>Badge earned</small><b>${b[2]}</b></span>`);
  }
  function checkStars() {
    const three = (id) => stars(progress[id]) === 3;
    if (STAGE1_SECTIONS[0].topics.every(three)) award("pave");
    if (Object.keys(STAGE1_TOPICS).every(three)) award("ready");
  }

  let toastQ = Promise.resolve();
  function toast(html) {
    // queued, so two badges at once don't stack on top of each other
    toastQ = toastQ.then(() => new Promise((res) => {
      const t = el(`<div class="s1-toast" role="status">${html}</div>`);
      document.body.appendChild(t);
      setTimeout(() => { t.classList.add("out"); setTimeout(() => { t.remove(); res(); }, 300); }, 2600);
    }));
  }

  /* ======================== typed-answer matching ======================== */
  // Shared by the acronym type-it / rapid modes and the must-know recall.
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // at most one slip (wrong, missing, extra or swapped letter) between a and b
  const near = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    const rest = (x, y) => a.slice(x) === b.slice(y);
    return rest(i, i) || rest(i + 1, i + 1) || rest(i + 1, i) || rest(i, i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && rest(i + 2, i + 2));
  };
  // the first five letters decide, one typo forgiven ("alchohol", "ilness").
  // Short alternates ("ad", "t/o", "wx") must be the whole answer or a
  // whole word of it — otherwise "radio" would pass for ADs.
  const accepts = (it, raw) => {
    const v = norm(raw), words = raw.toLowerCase().split(/[^a-z0-9]+/), p = v.slice(0, 5);
    if (v.length < 2) return false;
    return [it.w, ...(it.alt || [])].map(norm).some((c) => c.length < 4
      ? v === c || words.includes(c) || (c.length === 3 && v.startsWith(c))
      : (v.length >= 3 && c.startsWith(p)) || v.includes(c) ||
        (p.length === 5 && [4, 5, 6].some((n) => near(p, c.slice(0, n)))));
  };

  // Recall (must-know) is stricter than the acronym matcher: its answers are
  // phrases and numbers, so a bare prefix or a longer number must not pass.
  //   · numbers match as whole numbers ("150" ≠ "50" ≠ "1500"; "2,700 RPM" ok)
  //   · a short alt (<4 letters: "arm", "wet") must be the whole answer or a whole word
  //   · a longer alt passes when contained ("lycoming io 360" ⊇ "io360"), or when the
  //     answer is as long as it (≥70%) and agrees on the first five letters
  //     give or take one typo, or is one slip from it, or one word is one slip
  // → 0 wrong · 1 right · 2 right but only through typo forgiveness
  const numTok = (raw) => raw.toLowerCase().replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) || [];
  function recallHit(cands, raw, group) {
    const v = norm(raw);
    if (!v) return 0;
    const words = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), nums = numTok(raw), p = v.slice(0, 5);
    let best = 0;
    for (const alt of cands) {
      const c = norm(alt);
      if (!c) continue;
      let r = 0;
      if (/^\d+(\.\d+)?$/.test(alt.trim())) r = nums.includes(alt.trim()) ? 1 : 0;
      else if (c.length < 4) r = v === c || words.includes(c) ? 1 : 0;
      else if (v.includes(c)) r = 1;
      else if (/\d/.test(c)) r = 0;   // a typo in a number is a different number ("56 gal" ≠ "53 gal")
      else if (words.some((w) => w.length >= 3 && Math.abs(w.length - c.length) <= 1 && near(w, c))) r = 2;
      else if (!group && v.length >= c.length * 0.7 && v.length >= 3 &&
        (c.startsWith(p) || (p.length === 5 && [4, 5, 6].some((n) => near(p, c.slice(0, n))) ) || near(v, c))) r = 2;
      if (r === 1) return 1;
      best = r || best;
    }
    return best;
  }
  function recallMatch(it, raw) {
    if (it.all) {
      const hs = it.all.map((g) => recallHit(g, raw, true));
      return hs.includes(0) ? 0 : Math.max(...hs);
    }
    return recallHit([...(it.alt || []), it.a], raw);
  }

  /* ============================ review deck ============================= */
  // Leitner boxes: a miss goes to box 0 (due now); each right answer when it
  // is due moves it up a box; right out of the last box and it is retired.
  const BOX_DAYS = [0, 1, 3, 7, 14];
  const cardKey = {
    // the answer is part of the key: the light-gun and sign questions share
    // their wording ("What does it mean?") and differ only by the figure
    quiz: (q) => "q:" + q.q + "|" + q.o[0],
    sort: (it, a) => "s:" + a.title + "|" + it.t,
    inop: (c) => "i:" + c.item + "|" + c.flight,
    task: (sysId, t) => "x:" + sysId + "|" + t.q,
    must: (sysId, m) => "m:" + sysId + "|" + m.q,
  };
  function grade(key, ok) {
    const m = deck[key], now = Date.now();
    if (!ok) deck[key] = { box: 0, due: now, n: (m ? m.n : 0) + 1 };
    else if (m && m.due <= now) {
      if (m.box + 1 >= BOX_DAYS.length) delete deck[key];
      else deck[key] = { ...m, box: m.box + 1, due: now + BOX_DAYS[m.box + 1] * 864e5 };
    } else return;
    save(DECK, deck);
  }
  // every gradeable card in the content, by key — looked up fresh each time so
  // a saved miss survives edits to stagecheck.js (cards that vanish are skipped)
  function cardIndex() {
    const ix = {};
    const add = (k, v) => { if (!ix[k]) ix[k] = v; };
    Object.entries(STAGE1_TOPICS).forEach(([id, t]) => t.drill.forEach((a) => {
      if (a.type === "quiz") a.qs.forEach((q) => add(cardKey.quiz(q), { kind: "quiz", topic: t.name, q }));
      if (a.type === "sort") a.items.forEach((it) => add(cardKey.sort(it, a), { kind: "sort", topic: t.name, a, it }));
      if (a.type === "inop") a.cases.forEach((c) => add(cardKey.inop(c), { kind: "inop", topic: t.name, c }));
    }));
    STAGE1_SYSTEMS.forEach((s) => {
      (s.qs || []).forEach((q) => add(cardKey.quiz(q), { kind: "quiz", topic: "Systems · " + s.name, q }));
      // lab tasks replay only where their simulator exists
      (s.must || []).forEach((m) => add(cardKey.must(s.id, m), { kind: "recall", topic: "Systems · " + s.name + " · must know", item: { ...m, sys: s.id } }));
      if (hasDef(s.id)) (s.tasks || []).forEach((t) => add(cardKey.task(s.id, t), { kind: "task", topic: "Systems · " + s.name, sys: s, task: t }));
    });
    return ix;
  }
  function deckStatus() {
    const ix = cardIndex(), now = Date.now();
    const live = Object.entries(deck).filter(([k]) => ix[k]);
    const due = live.filter(([, m]) => m.due <= now);
    const next = live.length > due.length ? Math.min(...live.filter(([, m]) => m.due > now).map(([, m]) => m.due)) : null;
    return { ix, live, due, next };
  }

  /* ======================= run: progress + combo ======================== */
  // One drill in progress. Runners report each graded answer with hit() and
  // each finished item with tick(); the header bar and the combo pill follow.
  let run = null;
  const live = () => run && run.head.isConnected;
  function startRun(host, units, label) {
    const head = el(`<div class="s1-runhead">
      <div class="s1-runrow"><span class="s1-step">${label}</span>
        <span class="s1-combo" hidden>🔥 <b>0</b><small>combo</small></span></div>
      <div class="s1-bar"><i></i></div></div>`);
    host.prepend(head);
    run = { head, units: Math.max(1, units), done: 0, partStart: 0, combo: 0, best: 0 };
    paint();
    return run;
  }
  function paint() {
    run.head.querySelector(".s1-bar i").style.width = (100 * Math.min(1, run.done / run.units)).toFixed(1) + "%";
  }
  function tick(n = 1) { if (live()) { run.done += n; paint(); } }
  function grow(n) { if (live()) { run.units += n; paint(); } }
  function hit(ok, key) {
    if (key) grade(key, ok);
    studied();
    if (!live()) return;
    const pill = run.head.querySelector(".s1-combo");
    if (ok) {
      run.combo++;
      run.best = Math.max(run.best, run.combo);
      if (run.combo > (stats.bestCombo || 0)) { stats.bestCombo = run.combo; save(STATS, stats); }
      if (run.combo >= 10) award("combo10");
      if (run.combo >= 25) award("combo25");
      pill.hidden = run.combo < 2;
      pill.querySelector("b").textContent = run.combo;
      pill.classList.remove("bump", "big"); void pill.offsetWidth;
      pill.classList.add(run.combo % 5 === 0 ? "big" : "bump");
      if (run.combo % 5 === 0) {
        const f = el(`<span class="s1-float">Combo ×${run.combo}!</span>`);
        run.head.appendChild(f); setTimeout(() => f.remove(), 1100);
      }
    } else {
      if (run.combo >= 2) {
        pill.classList.remove("bump", "big"); void pill.offsetWidth; pill.classList.add("broke");
        const r = run;
        setTimeout(() => { pill.classList.remove("broke"); if (r.combo < 2) pill.hidden = true; }, 450);
      }
      run.combo = 0;
    }
  }

  /* ================================ HOME ================================ */
  function home() {
    stopVoice(); killViews();
    run = null;
    setTopbar();
    const r = readiness(), C = 2 * Math.PI * 42;
    const ds = deckStatus(), streak = streakNow();
    const got = stats.badges || {}, nGot = BADGES.filter((b) => got[b[0]]).length;
    const nextIn = ds.next ? Math.max(1, Math.ceil((ds.next - Date.now()) / 864e5)) : 0;
    const reviewSub = ds.due.length ? `${ds.due.length} due now${ds.live.length > ds.due.length ? ` · ${ds.live.length - ds.due.length} later` : ""}`
      : ds.live.length ? `Nothing due — next in ${nextIn} day${nextIn > 1 ? "s" : ""}` : "Misses land here";
    let html = `<div class="s1-home">
      <section class="s1-hero">
        <svg class="s1-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" stroke="#313a46" stroke-width="9" fill="none"/>
          <circle class="s1-ring-arc" cx="50" cy="50" r="42" stroke="#2ed573" stroke-width="9" fill="none" stroke-linecap="round"
            stroke-dasharray="${(C * r / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>
          <text x="50" y="55" text-anchor="middle" font-size="20" font-weight="800" fill="#e8edf2">${r}%</text>
        </svg>
        <div class="s1-hero-text">
          <h2>Stage 1 Check — oral review</h2>
          <p>Learn each topic, then drill it until it's three stars. Acronyms marked <b>memorize</b> are word-for-word —
          the examiner will ask for them cold.</p>
          <div class="s1-hero-actions">
            <button class="btn primary" data-act="mock">🎤 Mock oral with the examiner</button>
            <button class="btn" data-act="reset">Reset progress</button>
          </div>
        </div>
      </section>
      <section class="s1-stats">
        <div class="s1-stat ${streak ? "hot" : "cold"}"><span class="s1-stat-ic">🔥</span>
          <span><b>${streak} day${streak === 1 ? "" : "s"}</b><small>${streak ? (stats.day === dayKey(Date.now()) ? "Streak — done for today" : "Streak — study today to keep it") : "Study today to start a streak"}</small></span></div>
        <button class="s1-stat review ${ds.due.length ? "due" : "cold"}" data-act="review" ${ds.due.length ? "" : "disabled"}>
          <span class="s1-stat-ic">🔁</span><span><b>Review my misses</b><small>${reviewSub}</small></span>
          ${ds.due.length ? `<span class="s1-count">${ds.due.length}</span>` : ""}</button>
        <div class="s1-stat ${nGot ? "" : "cold"}"><span class="s1-stat-ic">🏅</span>
          <span><b>${nGot} of ${BADGES.length} badges</b><small>Best combo ${stats.bestCombo || 0}</small></span></div>
      </section>`;
    STAGE1_SECTIONS.forEach((sec) => {
      html += `<section class="s1-section"><h3>${sec.name} <span>${sec.sub}</span></h3>`;
      if (sec.id === "pave") html += paveStrip();
      html += `<div class="s1-cards">`;
      sec.topics.forEach((id) => {
        const t = STAGE1_TOPICS[id];
        html += `<button class="s1-card" data-topic="${id}" style="--c:${t.color}">
          <span class="s1-tag">${t.tag}</span>
          <span class="s1-card-name">${t.name}</span>
          <span class="s1-card-sub">${t.sub || ""}</span>
          <span class="s1-stars">${starHTML(progress[id])}</span>
        </button>`;
      });
      html += `</div></section>`;
    });
    html += `<section class="s1-section"><h3>Badges <span>${nGot} of ${BADGES.length}</span></h3>
      <div class="s1-badges">${BADGES.map(([id, ic, n, d]) =>
        `<div class="s1-badge ${got[id] ? "got" : ""}" title="${esc(d)}"><span>${ic}</span><b>${n}</b><small>${d}</small></div>`).join("")}</div></section>`;
    html += `</div>`;
    root.innerHTML = html;
    root.querySelectorAll("[data-topic]").forEach((b) => b.addEventListener("click", () => topic(b.dataset.topic)));
    root.querySelector('[data-act="mock"]').addEventListener("click", mockOral);
    root.querySelector('[data-act="review"]').addEventListener("click", review);
    root.querySelector('[data-act="reset"]').addEventListener("click", () => {
      if (!confirm("Clear all Stage 1 stars, the streak, badges and the review deck?")) return;
      progress = {}; stats = {}; deck = {};
      save(STORE, progress); save(STATS, stats); save(DECK, deck); home();
    });
    window.scrollTo(0, 0);
  }

  function paveStrip() {
    const L = [["P", "Pilot", "#34ace0", "pilot"], ["A", "Aircraft", "#ff9f43", "inspections"],
               ["V", "enVironment", "#2ed573", "environment"], ["E", "External pressures", "#e056fd", "external"]];
    return `<div class="s1-pave">${L.map(([l, n, c, id]) =>
      `<button class="s1-pave-l" style="--c:${c}" data-topic="${id}"><b>${l}</b><span>${n}</span></button>`).join("")}</div>`;
  }

  /* ================================ TOPIC =============================== */
  function topic(id, tab = "learn", opt) {
    stopVoice(); killViews();
    run = null;
    const t = STAGE1_TOPICS[id];
    root.innerHTML = `<div class="s1-topic" style="--c:${t.color}">
      <div class="s1-topic-head">
        <button class="btn small" data-act="back">← Topics</button>
        <span class="s1-tag">${t.tag}</span>
        <h2>${t.name}${t.sub ? ` <span>${t.sub}</span>` : ""}</h2>
        <span class="s1-stars">${starHTML(progress[id])}</span>
      </div>
      <div class="s1-tabs">
        <button class="s1-tab ${tab === "learn" ? "on" : ""}" data-tab="learn">📖 Learn</button>
        <button class="s1-tab ${tab === "drill" ? "on" : ""}" data-tab="drill">🎯 Drill</button>
        ${id === "systems" ? `<button class="s1-tab ${tab === "recall" ? "on" : ""}" data-tab="recall">★ Must-know recall</button>` : ""}
      </div>
      <div class="s1-body"></div>
    </div>`;
    root.querySelector('[data-act="back"]').addEventListener("click", home);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => topic(id, b.dataset.tab)));
    const body = root.querySelector(".s1-body");
    if (tab === "learn") renderLearn(t, body, id);
    else if (tab === "recall" && id === "systems") recallPage(id, body, opt || {});
    else runDrill(t.drill, body, (pct, combo) => finishDrill(id, pct, body, combo));
    window.scrollTo(0, 0);
  }

  function renderLearn(t, body, id) {
    t.learn.forEach((b) => {
      const blk = el(`<article class="s1-block"><h3>${b.h}</h3></article>`);
      if (b.html) blk.appendChild(el(`<div class="s1-html">${b.html}</div>`));
      if (b.fig) blk.appendChild(el(`<div class="s1-fig">${b.fig()}</div>`));
      if (b.widget) { const w = el(`<div class="s1-widget"></div>`); blk.appendChild(w); WIDGETS[b.widget](w); }
      body.appendChild(blk);
    });
    const go = el(`<button class="btn primary wide">Drill it 🎯</button>`);
    go.addEventListener("click", () => topic(id, "drill"));
    body.appendChild(go);
  }

  // Standalone must-know recall (Systems → ★ Must-know recall): every system's
  // must-know items, shuffled — typed, or a timed rapid-fire round. Misses go
  // to the review deck; this does not move the topic's drill stars.
  const RECALL_RAPID_N = 10;
  const mustAll = (only) => STAGE1_SYSTEMS.filter((s) => !only || s.id === only).flatMap((s) => (s.must || []).map((m) => ({ ...m, sys: s.id })));
  function recallPage(id, body, opt) {
    const start = (o) => {
      const items = shuffle(mustAll(o.sys)).slice(0, o.rapid ? RECALL_RAPID_N : 999);
      const sn = o.sys ? sysById(o.sys).name : "all systems";
      body.innerHTML = "";
      const stage = el(`<div class="s1-part"></div>`);
      body.appendChild(stage);
      startRun(body, items.length, o.rapid ? "⚡ Rapid fire" : "★ Must-know recall · " + sn);
      RUNNERS.recall({ items, rapid: o.rapid, last: "See results →" }, stage, (r, t, note) => {
        const pct = Math.round(100 * r / Math.max(1, t));
        result(body, pct, `${r} of ${t} from memory${note ? " · " + note : ""} · misses are in your review deck`, [
          ["Again", () => start(o)], ["Learn", () => topic(id, "learn")], ["Topics", home, true]]);
      });
      window.scrollTo(0, 0);
    };
    if (opt.go) return start(opt);
    const best = (stats.rapid || {}).mustknow, n = mustAll().length;
    body.innerHTML = `<div class="s1-block s1-rc-home">
      <h3><span class="s1-rc-star">★</span> Must-know recall</h3>
      <p>The facts the examiner expects word for word — engine make and model, fuel capacities, mag-check numbers, voltages, Vfe. Each one is typed from memory, not picked from a list.</p>
      <div class="s1-rc-modes">
        <button class="btn primary" data-go="all">All systems · ${n} prompts</button>
        <button class="btn" data-go="rapid">⚡ Rapid fire · ${RECALL_RAPID_N} × 15 s${best ? ` · best ${best.toFixed(1)} s` : ""}</button></div>
      <p class="s1-muted">Or just one system:</p>
      <div class="s1-sysnav">${STAGE1_SYSTEMS.filter((s) => (s.must || []).length).map((s) => `<button class="s1-chip" data-go="${s.id}">${esc(s.name)} <small>${s.must.length}</small></button>`).join("")}</div></div>`;
    body.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      const g = b.dataset.go;
      start(g === "all" ? {} : g === "rapid" ? { rapid: true } : { sys: g });
    }));
  }

  function finishDrill(id, pct, body, combo) {
    const prev = progress[id] || 0, best = Math.max(prev, pct);
    progress[id] = best; save(STORE, progress); setTopbar();
    const ids = Object.keys(STAGE1_TOPICS), next = ids[ids.indexOf(id) + 1];
    const newBest = pct > prev && prev > 0 ? " · new best!" : "";
    result(body, pct, `Best: ${best}%${newBest}${combo >= 2 ? ` · longest combo ${combo}` : ""}`, [
      ["Drill again", () => topic(id, "drill")],
      ["Review", () => topic(id, "learn")],
      next ? [`Next: ${STAGE1_TOPICS[next].name} →`, () => topic(next), true] : ["All topics", home, true],
    ]);
  }

  function result(body, pct, sub, buttons) {
    body.innerHTML = "";
    const s = stars(pct);
    const msg = pct >= 90 ? "Checkride ready." : pct >= 70 ? "Solid — tighten up the misses." : pct >= 40 ? "Getting there. Review and go again." : "Back to the Learn tab for this one.";
    const card = el(`<div class="s1-result">
      <div class="s1-big-stars">${[0, 1, 2].map((k) => `<span class="star ${k < s ? "on pop" : ""}" style="animation-delay:${k * 0.15}s">★</span>`).join("")}</div>
      <div class="s1-score">${pct}%</div><p>${msg}</p><p class="s1-muted">${sub}</p>
      <div class="s1-result-actions"></div></div>`);
    buttons.forEach(([label, fn, primary]) => {
      const b = el(`<button class="btn ${primary ? "primary" : ""}">${label}</button>`);
      b.addEventListener("click", fn);
      card.querySelector(".s1-result-actions").appendChild(b);
    });
    body.appendChild(card);
    // count the score up rather than printing it
    const sc = card.querySelector(".s1-score");
    if (!calm() && pct > 0) {
      const t0 = performance.now();
      const step = (t) => { const f = Math.min(1, (t - t0) / 700); sc.textContent = Math.round(pct * (1 - Math.pow(1 - f, 3))) + "%"; if (f < 1) requestAnimationFrame(step); };
      sc.textContent = "0%"; requestAnimationFrame(step);
    }
    award("first");
    checkStars();
    if (s === 3) confetti();
  }

  function confetti() {
    if (calm()) return;
    const box = el(`<div class="s1-confetti"></div>`);
    const cols = ["#34ace0", "#2ed573", "#ffa502", "#ff4757", "#e056fd", "#f6c90e"];
    for (let k = 0; k < 40; k++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = cols[k % cols.length];
      p.style.animationDelay = Math.random() * 0.6 + "s";
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  /* ============================== MOCK ORAL ============================= */
  // A conversation, not a quiz: the examiner works through the topics in
  // stage-check order, leads into each question, and reacts to the answer.
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  function stopVoice() { if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  function say(html) {
    if (!canSpeak || !prefs.voice) return;
    const t = el(`<div>${html}</div>`);
    t.querySelectorAll(".s1-fig, .s1-muted").forEach((x) => x.remove());
    try { stopVoice(); speechSynthesis.speak(new SpeechSynthesisUtterance(t.textContent.replace(/\s+/g, " ").trim())); } catch (e) { /* ignore */ }
  }

  function mockOral() {
    killViews();
    const order = Object.keys(STAGE1_TOPICS);
    const pool = [];
    Object.entries(STAGE1_TOPICS).forEach(([id, t]) => t.drill.forEach((a) => {
      if (a.type === "quiz") a.qs.forEach((q) => pool.push({ ...q, from: t.name, ord: order.indexOf(id) }));
    }));
    const sysOrd = Math.max(0, order.indexOf("systems"));
    STAGE1_SYSTEMS.forEach((s) => (s.qs || []).forEach((q) => pool.push({ ...q, from: "Systems · " + s.name, ord: sysOrd })));
    // a random fifteen — twelve questions plus three typed must-know recalls — then
    // asked topic by topic the way the oral flows
    const mustPool = STAGE1_SYSTEMS.flatMap((s) => (s.must || []).map((m) => ({ q: m.q, a: m.a, must: m, sys: s.id, from: "Systems · " + s.name, ord: sysOrd })));
    // typed recall sets in the topics (memory-item V-speeds, pre-solo numbers…) join the must-knows
    Object.entries(STAGE1_TOPICS).forEach(([id, t]) => t.drill.forEach((a) => {
      if (a.type === "recall" && a.items) a.items.forEach((m) => mustPool.push({ q: m.q, a: m.a, must: m, from: t.name, ord: order.indexOf(id) }));
    }));
    const qs = [...shuffle(pool).slice(0, 12), ...shuffle(mustPool).slice(0, 3)].sort((x, y) => x.ord - y.ord || (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
    stopVoice();
    root.innerHTML = `<div class="s1-topic" style="--c:#34ace0">
      <div class="s1-topic-head"><button class="btn small" data-act="back">← Topics</button>
      <span class="s1-tag">🎤</span><h2>Mock oral <span>${qs.length} questions from everything</span></h2>
      ${canSpeak ? `<button class="btn small s1-voice" data-act="voice" aria-pressed="${!!prefs.voice}">${prefs.voice ? "🔊 Voice on" : "🔈 Voice off"}</button>` : ""}</div>
      <div class="s1-body"></div></div>`;
    root.querySelector('[data-act="back"]').addEventListener("click", home);
    const vb = root.querySelector('[data-act="voice"]');
    if (vb) vb.addEventListener("click", () => {
      prefs.voice = !prefs.voice; save(PREFS, prefs);
      vb.textContent = prefs.voice ? "🔊 Voice on" : "🔈 Voice off"; vb.setAttribute("aria-pressed", prefs.voice);
      if (!prefs.voice) stopVoice();
    });
    const body = root.querySelector(".s1-body");
    body.innerHTML = `<div class="s1-chat" aria-live="polite"></div><div class="s1-replies"></div>`;
    startRun(body, qs.length, "Mock oral");
    const chat = body.querySelector(".s1-chat"), replies = body.querySelector(".s1-replies");
    const misses = [];
    let k = 0, right = 0, prevFrom = null;

    const scroll = (n) => n.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
    // the examiner "types" for a moment before each line
    const examiner = (html, then) => {
      const typing = el(`<div class="s1-msg ex"><span class="s1-av">🧑‍✈️</span><div class="s1-bubble s1-typing"><i></i><i></i><i></i></div></div>`);
      chat.appendChild(typing); scroll(typing);
      setTimeout(() => {
        if (!typing.isConnected) return;
        typing.querySelector(".s1-bubble").outerHTML = `<div class="s1-bubble">${html}</div>`;
        scroll(typing); say(html);
        if (then) then();
      }, calm() ? 0 : 550);
    };
    const me = (text, cls) => { const m = el(`<div class="s1-msg me ${cls}"><div class="s1-bubble">${esc(text)}</div></div>`); chat.appendChild(m); scroll(m); };
    const button = (label, fn) => { replies.innerHTML = ""; const b = nextBtn(label, fn); replies.appendChild(b); scroll(b); };

    const ask = () => {
      replies.innerHTML = "";
      if (k >= qs.length) return finish();
      const q = qs[k];
      const topicLead = q.from !== prevFrom
        ? (k === 0 ? `Let's start with <b>${esc(q.from)}</b>.` : pickOne(["Let's move on to", "Switching to", "Now,"]) + ` <b>${esc(q.from)}</b>.`)
        : pickOne(["Staying with that —", "Follow-up:", "Related question —", "Okay, next one."]);
      prevFrom = q.from;
      examiner(`<span class="s1-muted">${topicLead}</span><br>${esc(q.q)}${q.fig ? `<div class="s1-fig">${q.fig()}</div>` : ""}`, () => {
        if (q.must) {   // a must-know: answered by typing, not by picking
          const f = el(`<form class="s1-rc-row"><input class="s1-rc-in" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Answer from memory · Enter" aria-label="Your answer"><button class="btn primary">Answer</button></form>`);
          replies.appendChild(f);
          const inp = f.querySelector("input"); inp.focus();
          f.addEventListener("submit", (e) => {
            e.preventDefault();
            const v = inp.value.trim();
            if (!v) return;
            const lvl = recallMatch(q.must, v), ok = lvl > 0;
            if (ok) right++; else misses.push(q);
            hit(ok, cardKey.must(q.sys, q.must)); tick();
            replies.innerHTML = "";
            me(v, ok ? "ok" : "bad");
            const reply = ok ? `<b>${pickOne(["Good.", "Correct.", "That's right."])}</b> ${esc(q.a)}${lvl === 2 ? ` <span class="s1-muted">(close enough — say it exactly on the day)</span>` : ""}`
              : `<b>${pickOne(["Not quite.", "Hmm — no."])}</b> I was after: <b>${esc(q.a)}</b>. You should know that one cold.`;
            examiner(reply, () => { k++; button(k < qs.length ? "Next question →" : "Wrap up →", ask); });
          });
          return;
        }
        shuffle(q.o.map((t, j) => ({ t, ok: j === 0 }))).forEach((o) => {
          const b = el(`<button class="s1-opt">${esc(o.t)}</button>`);
          b.addEventListener("click", () => {
            replies.querySelectorAll("button").forEach((x) => { x.disabled = true; });
            if (o.ok) right++; else misses.push(q);
            hit(o.ok, cardKey.quiz(q)); tick();
            replies.innerHTML = "";
            me(o.t, o.ok ? "ok" : "bad");
            const reply = o.ok
              ? `<b>${pickOne(["Good.", "Correct.", "That's right.", "Exactly."])}</b> ${esc(q.why || "")}`
              : `<b>${pickOne(["Not quite.", "Hmm — no.", "Let's look at that again."])}</b> The answer I was after: <b>${esc(q.o[0])}</b>. ${esc(q.why || "")}`;
            examiner(reply, () => { k++; button(k < qs.length ? "Next question →" : "Wrap up →", ask); });
          });
          replies.appendChild(b);
        });
        if (!k) replies.appendChild(el(KEYS(q.o.length)));
      });
    };

    const finish = () => {
      const pct = Math.round(100 * right / qs.length);
      if (right === qs.length && qs.length >= 15) award("oral");
      const line = pct >= 90 ? "That's a solid oral. I'd be comfortable sending you to the flight portion."
        : pct >= 70 ? "Good overall — go back over the ones you missed before the real thing."
        : "We'd stop here on a real stage check. Review the misses and we'll try again.";
      examiner(`${line} <span class="s1-muted">(${right} of ${qs.length})</span>`, () => button("See the debrief →", () => {
        stopVoice();
        result(body, pct, `${right} of ${qs.length} right`, [["Another mock oral", mockOral, true], ["Topics", home]]);
        if (misses.length) {
          const list = el(`<div class="s1-block"><h3>Review these <span class="s1-muted">— they're in your review deck now</span></h3><ul class="s1-list"></ul></div>`);
          misses.forEach((q) => list.querySelector("ul").appendChild(
            el(`<li><span class="s1-muted">${esc(q.from)}</span><br>${esc(q.q)} — <b>${esc(q.o ? q.o[0] : q.a)}</b></li>`)));
          body.appendChild(list);
        }
      }));
    };

    examiner(`Good morning. I'll ask you about ${qs.length} questions from across the stage — PAVE, systems, ADM, aerodynamics, approaches and airport ops. Take your time; it's fine to think out loud. Ready?`,
      () => button("Ready →", ask));
  }

  /* ============================ REVIEW DECK ============================= */
  function review() {
    run = null; killViews();
    const ds = deckStatus();
    // most-missed and lowest-box first, capped so a session stays short
    const due = ds.due.sort(([, a], [, b]) => a.box - b.box || b.n - a.n).slice(0, 20).map(([k]) => k);
    root.innerHTML = `<div class="s1-topic" style="--c:#ffa502">
      <div class="s1-topic-head"><button class="btn small" data-act="back">← Topics</button>
      <span class="s1-tag">🔁</span><h2>Review my misses <span>${due.length} due</span></h2></div>
      <div class="s1-body"></div></div>`;
    root.querySelector('[data-act="back"]').addEventListener("click", home);
    const body = root.querySelector(".s1-body");
    if (!due.length) { body.innerHTML = `<div class="s1-block"><p>Nothing due. Go drill something!</p></div>`; return; }
    const stage = el(`<div></div>`);
    body.appendChild(stage);
    startRun(body, due.length, "Review");
    const queue = due.slice(), again = new Set();
    const ix = cardIndex();
    let right = 0, first = 0;
    const next = () => {
      if (!queue.length) return finish();
      const key = queue.shift(), c = ix[key];
      if (!c) return next();
      const m = deck[key] || { box: 0 };
      stage.innerHTML = "";
      stage.appendChild(el(`<p class="s1-from"><span>${esc(c.topic)}</span> <span class="s1-boxes" title="Leitner box">${BOX_DAYS.map((_, j) => `<i class="${j <= m.box ? "on" : ""}"></i>`).join("")}</span>${again.has(key) ? ` <b>again</b>` : ""}</p>`));
      const box = el(`<div></div>`); stage.appendChild(box);
      const act = c.kind === "task" ? null : c.kind === "quiz" ? { type: "quiz", qs: [c.q] }
        : c.kind === "recall" ? { type: "recall", items: [c.item] }
        : c.kind === "sort" ? { type: "sort", title: c.a.title, buckets: c.a.buckets, items: [c.it] }
        : { type: "inop", cases: [c.c] };
      // a miss comes round once more at the end; only the first try is scored
      const wasAgain = again.has(key);
      const after = (r) => {
        if (!wasAgain) { first++; right += r; }
        if (!r && !wasAgain) { again.add(key); queue.push(key); grow(1); }
        next();
      };
      if (c.kind === "task") RUNNERS.systask({ sys: c.sys, tasks: [c.task], tickOne: true }, box, (p, u) => after(p >= u ? 1 : 0));
      else RUNNERS[c.kind](act, box, after);
      window.scrollTo(0, 0);
    };
    const finish = () => {
      const left = deckStatus();
      const pct = Math.round(100 * right / Math.max(1, first));
      result(body, pct, `${right} of ${first} right the first time · ${left.live.length} card${left.live.length === 1 ? "" : "s"} left in the deck`,
        [["Topics", home, true], ...(left.due.length ? [["Review again", review]] : [])]);
      if (!left.live.length) award("clean");
    };
    next();
  }

  /* ============================ DRILL RUNNER ============================ */
  const UNITS = { acronym: (a) => a.items.length, quiz: (a) => a.qs.length, match: (a) => a.pairs.length,
    sort: (a) => a.items.length, inop: (a) => a.cases.length, systems: () => 3,
    recall: (a) => (a.items || []).length || 1,
    systask: (a) => a.tasks.reduce((n, t) => n + taskUnits(t), 0) };
  function runDrill(acts, body, done) {
    let k = 0, right = 0, total = 0;
    body.innerHTML = "";
    const stage = el(`<div></div>`);
    body.appendChild(stage);
    startRun(body, acts.reduce((n, a) => n + (UNITS[a.type] ? UNITS[a.type](a) : 1), 0), "");
    const r = run;
    const next = () => {
      if (k >= acts.length) return done(Math.round(100 * right / Math.max(1, total)), r.best);
      r.head.querySelector(".s1-step").textContent = `Part ${k + 1} of ${acts.length}`;
      r.partStart = r.done;
      stage.innerHTML = "";
      const box = el(`<div class="s1-part"></div>`);
      stage.appendChild(box);
      const a = acts[k++];
      RUNNERS[a.type](a, box, (rr, t) => { right += rr; total += t; next(); });
      window.scrollTo(0, 0);
    };
    next();
  }

  // the keyboard hint, shown only where there is a keyboard (CSS hides it on touch)
  const KEYS = (n) => `<p class="s1-keys">Keys: <kbd>1</kbd>–<kbd>${n}</kbd> to answer · <kbd>Enter</kbd> for next</p>`;
  const nextBtn = (label, fn) => {
    const b = el(`<button class="btn primary wide s1-next">${label}</button>`);
    b.addEventListener("click", fn);
    return b;
  };

  /* ========================== SYSTEMS LAB: mountLab ========================= */
  // One generic controller over any SysDiagrams def. Learn and Drill both mount
  // it; the def owns geometry and sim logic, this owns events, the control
  // strip, the readout and redraws. Defs and Systems3D are looked up lazily so
  // the chunks can load (or be missing) in any order.
  const SD = () => (typeof SysDiagrams !== "undefined" ? SysDiagrams : null);
  const S3 = () => window.Systems3D || null;
  const hasDef = (id) => { const d = SD(); return !!(d && d.has(id)); };
  const sysById = (id) => STAGE1_SYSTEMS.find((s) => s.id === id);

  // 3D views in flight, so leaving the page can always release their WebGL state
  const liveViews = new Set();
  const track = (v) => { if (v) liveViews.add(v); return v; };
  function dropView(v) { if (!v) return; liveViews.delete(v); try { v.destroy(); } catch (e) { /* already gone */ } }
  function killViews() { [...liveViews].forEach(dropView); }

  // load three.js once; resolves false when 3D can't run (caller shows 2D)
  let p3 = null;
  function ready3d() {
    if (!p3) p3 = (async () => {
      try {
        const t = S3();
        if (!t || (t.supported && !t.supported())) return false;
        return !!(await t.load());
      } catch (e) { return false; }
    })();
    return p3;
  }

  // every airplane hotspot as {id:"sys.part", sys, part}: the 3D module's list,
  // else the 2D locator's parts, else whatever the content has parts for
  function hotspots() {
    let ids = [];
    try { const t = S3(); if (t && t.ids) ids = t.ids("airplane") || []; } catch (e) { ids = []; }
    if (!ids.length && hasDef("airplane")) {
      ids = SD().get("airplane").parts.map((p) => { const i = p.indexOf("."); return { id: p, sys: p.slice(0, i), part: p.slice(i + 1) }; });
    }
    if (!ids.length) STAGE1_SYSTEMS.forEach((s) => Object.keys(s.parts || {}).forEach((p) => ids.push({ id: s.id + "." + p, sys: s.id, part: p })));
    return ids;
  }
  const partName = (h) => { const s = sysById(h.sys); return (s && s.parts && s.parts[h.part] && s.parts[h.part].n) || h.part; };
  // accessible stand-in for the 3D canvas: one button per hotspot, grouped by system
  function pickListHTML() {
    const by = {};
    hotspots().forEach((h) => (by[h.sys] = by[h.sys] || []).push(h));
    return STAGE1_SYSTEMS.filter((s) => by[s.id]).map((s) => `<div class="sx-pgroup"><h5>${esc(s.name)}</h5><div class="sx-pbtns">${
      by[s.id].map((h) => `<button type="button" class="sx-pick" data-pick="${esc(h.id)}">${esc(partName(h))}</button>`).join("")}</div></div>`).join("");
  }

  // start / apply / lab patches are raw merges: they set fault keys (altFail, epump…) the reducer would refuse
  const patchState = (D, def, st, patch) => ({ ...st, ...(patch || {}) });

  function mountLab(host, sysId, o = {}) {
    const sys = sysById(sysId), D = SD(), def = D && D.has(sysId) ? D.get(sysId) : null;
    const L = { def, sys, fallback: !def };
    if (!def) {
      // no simulator registered: the static figure and the key points still teach
      host.innerHTML = `<div class="sx-stage sx-static">${sys && sys.fig ? `<div class="s1-fig">${sys.fig()}</div>` : ""}
        <ul class="s1-list">${((sys && sys.points) || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`;
      const nop = () => L;
      return Object.assign(L, { state: {}, model: () => ({}), set: nop, patch: nop, load: nop, reset: nop, redraw: nop, onPart: nop, onChange: nop, lock: nop, mask: nop, destroy: nop });
    }
    let state = patchState(D, def, def.init(), o.start);
    const view = { sel: null, marks: {}, labels: o.labels !== false, trace: [], mask: !!o.mask };
    let locked = false, partFn = null, changeFn = null;
    const withCtl = o.controls !== false, withRo = o.readout !== false;

    const ctls = def.controls || [];
    const strip = !withCtl || !ctls.length ? "" : `<div class="sx-strip" role="group" aria-label="Controls">${ctls.map((c) => {
      if (c.type === "seg") return `<div class="sx-cg"><span class="sx-cl">${esc(c.label)}</span><div class="s1-seg">${
        c.opts.map((op, j) => `<button type="button" data-k="${c.key}" data-j="${j}">${esc(op[1])}</button>`).join("")}</div></div>`;
      if (c.type === "toggle") return `<div class="sx-cg"><button type="button" class="sx-tg" data-k="${c.key}" aria-pressed="false">${esc(c.label)}</button></div>`;
      return `<label class="sx-cg sx-rg"><span class="sx-cl">${esc(c.label)}</span><input type="range" data-k="${c.key}" min="${c.min}" max="${c.max}" step="${c.step || 1}"><output></output></label>`;
    }).join("")}</div>`;
    host.innerHTML = `<div class="sx-stage"><div class="sx-fig"></div>${strip}${withRo ? `<p class="sx-readout" aria-live="polite"></p>` : ""}</div>`;
    const stage = host.firstElementChild, figEl = stage.querySelector(".sx-fig"), ro = stage.querySelector(".sx-readout");
    const model = () => def.model(state);

    function draw() {
      // a redraw replaces the SVG, so put keyboard focus back where it was
      const a = document.activeElement, f = a && figEl.contains(a) ? a.closest("[data-part],[data-ctl]") : null;
      const sel = f ? (f.dataset.part ? `[data-part="${f.dataset.part}"]` : `[data-ctl="${f.dataset.ctl}"][data-val="${f.dataset.val}"]`) : null;
      try { figEl.innerHTML = def.draw(state, { sel: view.sel, marks: view.marks, labels: view.labels, trace: view.trace, mask: view.mask }); }
      catch (e) { console.error(e); figEl.innerHTML = `<p class="s1-note">This diagram failed to draw.</p>`; }
      const n = sel && figEl.querySelector(sel);
      if (n) n.focus({ preventScroll: true });
    }
    function sync() {
      if (ro) { let m = ""; try { m = model().msg || ""; } catch (e) { console.error(e); } ro.innerHTML = m; }
      stage.querySelectorAll("[data-k]").forEach((n) => {
        const c = ctls.find((x) => x.key === n.dataset.k), v = state[c.key];
        if (c.type === "seg") { const on = c.opts[+n.dataset.j][0] === v; n.classList.toggle("on", on); n.setAttribute("aria-pressed", on); }
        else if (c.type === "toggle") { n.classList.toggle("on", !!v); n.setAttribute("aria-pressed", !!v); }
        else { if (document.activeElement !== n) n.value = v; n.nextElementSibling.textContent = v + (c.unit || ""); }
      });
    }
    function apply(s, key) { state = s; draw(); sync(); if (changeFn) changeFn(state, key); }
    // data-val arrives as a string: map it back to the control's real value
    function coerce(key, raw) {
      const c = ctls.find((x) => x.key === key);
      if (c && c.type === "seg") { const op = c.opts.find((x) => String(x[0]) === String(raw)); if (op) return op[0]; }
      if (raw === "true") return true;
      if (raw === "false") return false;
      return raw !== "" && raw != null && !isNaN(raw) ? +raw : raw;
    }
    // an in-SVG control with no data-val cycles (seg) or flips (toggle) its value
    function hardware(n) {
      const key = n.dataset.ctl, c = ctls.find((x) => x.key === key);
      if (n.dataset.val != null) return coerce(key, n.dataset.val);
      if (c && c.type === "seg") { const i = c.opts.findIndex((x) => x[0] === state[key]); return c.opts[(i + 1) % c.opts.length][0]; }
      return !state[key];
    }
    function act(t, e) {
      const c = t.closest && t.closest("[data-ctl]");
      if (c && host.contains(c)) { if (locked) return false; L.set(c.dataset.ctl, hardware(c)); return true; }
      const p = t.closest && t.closest("[data-part]");
      if (p && host.contains(p) && partFn) { partFn(p.dataset.part, e); return true; }
      return false;
    }
    host.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("button[data-k]");
      if (b && stage.contains(b)) {
        const c = ctls.find((x) => x.key === b.dataset.k);
        return L.set(c.key, c.type === "seg" ? c.opts[+b.dataset.j][0] : !state[c.key]);
      }
      act(e.target, e);
    });
    host.addEventListener("input", (e) => {
      const r = e.target.closest && e.target.closest('input[data-k]');
      if (r) L.set(r.dataset.k, +r.value);
    });
    // Enter / Space on a focused part or hardware control; stopped here so a
    // handled key doesn't also fire the drill's global Enter → Next
    host.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && act(e.target, e)) { e.preventDefault(); e.stopPropagation(); }
    });

    Object.assign(L, {
      model,
      set(key, val) { if (!locked) apply(D.setState(def, state, key, val), key); return L; },
      patch(obj) { apply(patchState(D, def, state, obj)); return L; },
      load(s) { apply({ ...s }); return L; },
      reset(patch) { view.sel = null; view.marks = {}; view.trace = []; apply(patchState(D, def, def.init(), patch === undefined ? o.start : patch)); return L; },
      redraw(opts) { Object.assign(view, opts || {}); draw(); return L; },
      onPart(fn) { partFn = fn; return L; },
      onChange(fn) { changeFn = fn; return L; },
      lock(b) { locked = !!b; stage.classList.toggle("sx-locked", locked); stage.querySelectorAll("button,input").forEach((n) => { n.disabled = locked; }); return L; },
      // predict tasks: hide the readout and controls, and ask the def to hide the fault
      mask(b) { stage.classList.toggle("sx-masked", !!b); view.mask = !!b; draw(); return L; },
      destroy() { partFn = changeFn = null; },
    });
    Object.defineProperty(L, "state", { get: () => state });   // live, so not part of the assign above
    if (o.mask) stage.classList.add("sx-masked");
    draw(); sync();
    return L;
  }

  // breadth-first search over the controls for a state satisfying `goal`, so a
  // failed `set` task can show one way to do it
  function solveGoal(def, start, goal) {
    const D = SD();
    const vals = (c) => c.type === "seg" ? c.opts.map((x) => x[0]) : c.type === "toggle" ? [true, false] : [...new Set([c.min, Math.round((c.min + c.max) / 2), c.max])];
    if (D.match(def, start, goal)) return start;
    const seen = new Set([JSON.stringify(start)]);
    let frontier = [start];
    for (let depth = 0; depth < 4 && frontier.length && seen.size < 6000; depth++) {
      const nxt = [];
      for (const s of frontier) for (const c of def.controls || []) for (const v of vals(c)) {
        const n = D.setState(def, s, c.key, v), k = JSON.stringify(n);
        if (seen.has(k)) continue;
        seen.add(k);
        if (D.match(def, n, goal)) return n;
        nxt.push(n);
      }
      frontier = nxt;
    }
    return null;
  }

  const taskUnits = (t) => t.t === "order" ? t.seq.length : 1;

  // One graded task on the live diagram. `o` = { k, n, tickOne }; `end(points, units)`
  // fires from the Next button, so the 1–9 / Enter keys behave as in the quiz.
  function runTask(sys, t, box, o, end) {
    killViews();
    const units = taskUnits(t);
    const dots = o.n > 1 ? `<div class="s1-dots">${Array.from({ length: o.n }, (_, j) => `<i class="${j < o.k ? "done" : j === o.k ? "cur" : ""}"></i>`).join("")}</div>` : "";
    const card = el(`<div class="s1-block sx-task">${dots}<p class="s1-muted">${esc(sys.name)} · ${t.t === "locate" ? "find it on the airplane" : t.t === "order" ? "trace it" : t.t === "set" ? "set it up" : t.t === "predict" ? "predict" : "find it"}</p>
      <h3>${esc(t.q)}</h3><div class="sx-host"></div><div class="sx-actions"></div><div class="s1-why" hidden></div></div>`);
    box.innerHTML = "";
    box.appendChild(card);
    const host = card.querySelector(".sx-host"), actions = card.querySelector(".sx-actions"), why = card.querySelector(".s1-why");
    let finished = false;
    const fin = (pts, extra = "") => {
      if (finished) return;
      finished = true;
      const ok = pts === units;
      hit(ok, cardKey.task(sys.id, t)); tick(o.tickOne ? 1 : units);
      actions.innerHTML = "";
      why.hidden = false;
      why.className = "s1-why " + (ok ? "good" : "badwhy");
      why.innerHTML = `<b>${ok ? "✓ Correct." : "✗ Not quite."}</b> ${units > 1 ? `${pts} of ${units} steps first try. ` : ""}${esc(t.why || "")} ${extra}`;
      card.appendChild(nextBtn(o.last || "Next →", () => end(pts, units)));
    };
    const help = (s) => host.insertAdjacentHTML("beforebegin", `<p class="sx-help">${s}</p>`);

    if (t.t === "find") {
      const lab = mountLab(host, sys.id, { start: t.start, controls: false, readout: false, labels: !t.blind });
      lab.lock(true);   // the scene is the question: hardware stays put
      const reveal = (marks) => { lab.lock(true); lab.onPart(null); lab.redraw({ marks, labels: true }); };
      if (!t.parts) {
        lab.onPart((p) => { const ok = p === t.part; reveal(ok ? { [p]: "ok" } : { [p]: "bad", [t.part]: "ok" }); fin(ok ? 1 : 0); });
      } else {
        const want = new Set(t.parts), got = new Set();
        help("Click every part that applies, then Check.");
        lab.onPart((p) => {
          got.has(p) ? got.delete(p) : got.add(p);
          lab.redraw({ marks: Object.fromEntries([...got].map((x) => [x, "hint"])) });
        });
        const chk = el(`<button class="btn primary wide">Check</button>`);
        chk.addEventListener("click", () => {
          const ok = got.size === want.size && [...want].every((x) => got.has(x));
          const marks = Object.fromEntries(t.parts.map((x) => [x, "ok"]));
          got.forEach((x) => { if (!want.has(x)) marks[x] = "bad"; });
          reveal(marks); fin(ok ? 1 : 0);
        });
        actions.appendChild(chk);
      }
    } else if (t.t === "order") {
      const lab = mountLab(host, sys.id, { start: t.start, controls: false, readout: false, labels: !t.blind });
      lab.lock(true);
      const bar = el(`<p class="sx-step"></p>`);
      host.insertAdjacentElement("beforebegin", bar);
      let i = 0, pts = 0, missed = false;
      const marks = {};
      const stepText = () => { bar.textContent = `Step ${Math.min(i + 1, t.seq.length)} of ${t.seq.length}`; };
      stepText();
      lab.onPart((p) => {
        if (marks[p] === "done") return;
        if (p === t.seq[i]) {
          if (!missed) pts++;
          missed = false; marks[p] = "done"; i++;
          lab.redraw({ marks: { ...marks }, trace: t.seq.slice(0, i) });
          if (i >= t.seq.length) { lab.lock(true); lab.onPart(null); lab.redraw({ labels: true }); bar.remove(); fin(pts); } else stepText();
        } else {
          missed = true;
          lab.redraw({ marks: { ...marks, [p]: "bad" } });
          setTimeout(() => { if (!finished && host.isConnected) lab.redraw({ marks: { ...marks } }); }, 650);
        }
      });
    } else if (t.t === "set") {
      const lab = mountLab(host, sys.id, { start: t.start });
      const chk = el(`<button class="btn primary wide">Check</button>`);
      chk.addEventListener("click", () => {
        const ok = SD().match(lab.def, lab.state, t.goal);
        let extra = "";
        lab.lock(true);
        if (!ok) {
          const sol = solveGoal(lab.def, lab.state, t.goal);
          if (sol) { lab.load(sol); extra = "<br>One way to do it is now on the diagram."; }
        }
        fin(ok ? 1 : 0, extra);
      });
      actions.appendChild(chk);
    } else if (t.t === "predict") {
      const lab = mountLab(host, sys.id, { start: t.start, controls: false, mask: true });
      lab.lock(true);
      const opts = el(`<div class="s1-opts"></div>`);
      shuffle(t.o.map((txt, j) => ({ txt, ok: j === 0 }))).forEach((x) => {
        const b = el(`<button class="s1-opt">${esc(x.txt)}</button>`);
        if (x.ok) b.dataset.ok = "1";
        b.addEventListener("click", () => {
          opts.querySelectorAll("button").forEach((n) => { n.disabled = true; });
          opts.querySelector("[data-ok]").classList.add("ok");
          if (x.ok) b.classList.add("picked"); else b.classList.add("bad");
          card.querySelector(".s1-keys")?.remove();
          // now let the diagram show what really happens
          lab.mask(false);
          if (t.apply) lab.patch(t.apply);
          fin(x.ok ? 1 : 0);
        });
        opts.appendChild(b);
      });
      host.insertAdjacentElement("afterend", opts);
      opts.insertAdjacentHTML("afterend", KEYS(t.o.length));
    } else if (t.t === "locate") {
      host.innerHTML = `<div class="sx-loc"><p class="s3-hint">Loading the airplane…</p></div>
        <details class="sx-picks"><summary>Pick from a list instead</summary><div class="sx-pickbody">${pickListHTML()}</div></details>`;
      const vh = host.querySelector(".sx-loc"), det = host.querySelector("details");
      let view = null, lab = null;
      const grade = (id) => {
        if (finished) return;
        const ok = id === t.id;
        const marks = ok ? { [t.id]: "ok" } : { [id]: "bad", [t.id]: "ok" };
        if (view) view.mark(marks); else if (lab) { lab.lock(true); lab.redraw({ marks, labels: true }); }
        fin(ok ? 1 : 0);
      };
      host.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => grade(b.dataset.pick)));
      ready3d().then((ok) => { if (!ok) return null; vh.innerHTML = ""; return S3().mount(vh, { scene: "airplane", labels: false, onPick: (p) => grade(p.id) }); }).catch(() => null).then((v) => {
        if (!vh.isConnected) return dropView(v);
        if (v) { view = track(v); return; }
        vh.innerHTML = "";
        if (hasDef("airplane")) {
          lab = mountLab(vh, "airplane", { controls: false, readout: false, labels: false });
          lab.onPart(grade);
          vh.insertAdjacentHTML("afterbegin", `<p class="s3-note">3D unavailable — showing schematic</p>`);
        } else { vh.innerHTML = ""; det.open = true; }
      });
    }
  }

  const RUNNERS = {
    /* ----------------------------- acronym ------------------------------ */
    acronym(a, box, done) {
      let mode = "tiles", stop = () => {};
      const render = () => {
        stop();
        // switching modes restarts this part's share of the progress bar
        if (live()) { run.done = run.partStart; paint(); }
        box.innerHTML = `<div class="s1-block s1-acro">
          <div class="s1-acro-top"><h3>${a.title ? a.title : `Spell out <b>${a.word}</b>`}</h3>
            <div class="s1-seg"><button data-m="tiles" class="${mode === "tiles" ? "on" : ""}">${a.title ? "In order" : "Tiles"}</button>
            <button data-m="type" class="${mode === "type" ? "on" : ""}">Type it</button>
            ${a.title ? "" : `<button data-m="rapid" class="${mode === "rapid" ? "on" : ""}">⚡ Rapid fire</button>`}</div></div>
          <div class="s1-slots"></div><div class="s1-tiles"></div><div class="s1-fb"></div></div>`;
        box.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; render(); }));
        if (mode === "rapid") return rapid();
        const slots = box.querySelector(".s1-slots");
        a.items.forEach((it) => (it.h && slots.appendChild(el(`<p class="s1-slot-h">${esc(it.h)}</p>`)), slots.appendChild(el(
          `<div class="s1-slot"><b>${it.l}</b><span class="s1-slot-w">${mode === "type" ? `<input type="text" autocomplete="off" spellcheck="false" autocapitalize="off">` : ""}</span></div>`))));
        mode === "tiles" ? tiles() : typed();
      };

      const tiles = () => {
        let n = 0, miss = 0;
        const slotEls = box.querySelectorAll(".s1-slot");
        slotEls[0].classList.add("cur");
        const wrap = box.querySelector(".s1-tiles");
        shuffle(a.items.map((it, k) => ({ ...it, k }))).forEach((it) => {
          const b = el(`<button class="s1-tile">${esc(it.w)}</button>`);
          b.addEventListener("click", () => {
            // a repeated word (two A's) is fine in either tile; checklist items that
            // share a group (g) may go in any order, as in the emergency drill
            if (a.items[n].w === it.w || (it.g && a.items[n].g === it.g)) {
              b.disabled = true; b.classList.add("used");
              slotEls[n].querySelector(".s1-slot-w").textContent = it.w;
              slotEls[n].classList.remove("cur"); slotEls[n].classList.add("ok");
              hit(true); tick();
              n++;
              if (n < a.items.length) slotEls[n].classList.add("cur");
              else finish(a.items.length - Math.min(miss, a.items.length), miss ? `${miss} wrong pick${miss > 1 ? "s" : ""}.` : "Clean — no misses.");
            } else {
              miss++; hit(false);
              b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake");
            }
          });
          wrap.appendChild(b);
        });
      };

      const typed = () => {
        const inputs = [...box.querySelectorAll(".s1-slot input")];
        inputs[0].focus();
        inputs.forEach((inp, k) => inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); (inputs[k + 1] || check).focus(); if (!inputs[k + 1]) check.click(); }
        }));
        const check = el(`<button class="btn primary wide">Check</button>`);
        box.querySelector(".s1-acro").appendChild(check);
        check.addEventListener("click", () => {
          let right = 0;
          // a checklist step (with `all`) must name the control AND its position, strictly;
          // steps sharing a group may be typed in any order within it
          const used = new Set();
          const fits = (c, v) => c.all ? recallMatch({ all: c.all }, v) > 0 : accepts(c, v);
          inputs.forEach((inp, k) => {
            const it = a.items[k];
            const pool = a.items.map((c, j) => ({ c, j })).filter(({ c, j }) => !used.has(j) && (j === k || (it.g && c.g === it.g)));
            const m = pool.find(({ c }) => fits(c, inp.value)), ok = !!m;
            if (m) used.add(m.j);
            inp.disabled = true;
            inp.parentElement.parentElement.classList.add(ok ? "ok" : "bad");
            if (!ok) inp.parentElement.appendChild(el(`<em>${esc(it.w)}</em>`));
            if (ok) right++;
            hit(ok); tick();
          });
          check.remove();
          finish(right, `${right} of ${a.items.length} from memory.`);
        });
      };

      // timed: one letter at a time, SECS each; Enter to submit, a wrong word
      // can be retried until the clock runs out
      const SECS = 8;
      const rapid = () => {
        const best = (stats.rapid || {})[a.word];
        box.querySelector(".s1-slots").outerHTML = `<div class="s1-rapid">
          <p class="s1-muted">Each letter flashes up with ${SECS} seconds on the clock. Type the word and hit Enter.
          ${best ? `Your best clean run: <b>${best.toFixed(1)} s</b>.` : ""}</p>
          <button class="btn primary wide" data-act="go">⚡ Start</button></div>`;
        box.querySelector('[data-act="go"]').addEventListener("click", () => {
          const R = box.querySelector(".s1-rapid");
          R.innerHTML = `<div class="s1-rapid-trail">${a.items.map((it) => `<span>${it.l}</span>`).join("")}</div>
            <div class="s1-rapid-letter"></div>
            <div class="s1-clock"><i></i></div>
            <input class="s1-rapid-in" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="Type the word · Enter">
            <p class="s1-rapid-msg"></p>`;
          const L = R.querySelector(".s1-rapid-letter"), bar = R.querySelector(".s1-clock i"), inp = R.querySelector("input");
          const trail = R.querySelectorAll(".s1-rapid-trail span"), msg = R.querySelector(".s1-rapid-msg");
          let n = 0, right = 0, t0 = 0, timer = 0, busy = false;
          const start = performance.now();
          stop = () => clearInterval(timer);
          const show = () => {
            if (n >= a.items.length) {
              stop();
              const secs = (performance.now() - start) / 1000;
              inp.disabled = true;
              let note = `${right} of ${a.items.length} in ${secs.toFixed(1)} s.`;
              if (right === a.items.length) {
                stats.rapid = stats.rapid || {};
                if (!best || secs < best) { stats.rapid[a.word] = secs; save(STATS, stats); note += best ? " New best!" : ""; }
                award("quick");
              }
              return finish(right, note);
            }
            trail.forEach((x, j) => x.classList.toggle("cur", j === n));
            L.textContent = a.items[n].l;
            L.classList.remove("flash"); void L.offsetWidth; L.classList.add("flash");
            inp.value = ""; inp.focus(); msg.textContent = "";
            t0 = performance.now(); busy = false;
          };
          const resolve = (ok) => {
            busy = true;
            const it = a.items[n];
            trail[n].classList.remove("cur"); trail[n].classList.add(ok ? "ok" : "bad");
            trail[n].title = it.w;
            if (ok) right++;
            hit(ok); tick();
            msg.innerHTML = ok ? `<span class="s1-ok">✓ ${esc(it.w)}</span>` : `<span class="bad">⏱ ${esc(it.w)}</span>`;
            n++;
            setTimeout(() => { if (box.isConnected) show(); }, ok ? 350 : 1100);
          };
          inp.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || busy) return;
            e.preventDefault();
            if (accepts(a.items[n], inp.value)) resolve(true);
            else { inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); inp.select(); }
          });
          timer = setInterval(() => {
            if (!box.isConnected) return stop();
            if (busy) return;
            const left = 1 - (performance.now() - t0) / (SECS * 1000);
            bar.style.width = Math.max(0, left * 100) + "%";
            bar.classList.toggle("low", left < 0.3);
            if (left <= 0) resolve(false);
          }, 50);
          show();
        });
      };

      const finish = (right, msg) => {
        stop();
        box.querySelector(".s1-tiles").innerHTML = "";
        box.querySelector(".s1-fb").innerHTML = `<p class="s1-ok">✓ ${msg}</p>`;
        box.querySelector(".s1-seg").remove();
        box.querySelector(".s1-acro").appendChild(nextBtn("Next →", () => done(right, a.items.length)));
      };
      render();
    },

    /* ------------------------------- quiz ------------------------------- */
    quiz(a, box, done) {
      const qs = a.qs;
      let k = 0, right = 0;
      const show = () => {
        if (k >= qs.length) return done(right, qs.length);
        const q = qs[k];
        box.innerHTML = "";
        const dots = qs.length > 1 ? qs.map((_, j) => `<i class="${j < k ? "done" : j === k ? "cur" : ""}"></i>`).join("") : "";
        const card = el(`<div class="s1-block s1-quiz">
          ${dots ? `<div class="s1-dots">${dots}</div>` : ""}
          ${q.from ? `<p class="s1-muted">${esc(q.from)}</p>` : ""}
          <h3>${esc(q.q)}</h3>
          ${q.fig ? `<div class="s1-fig">${q.fig()}</div>` : ""}
          <div class="s1-opts"></div>${KEYS(q.o.length)}<div class="s1-why" hidden></div></div>`);
        const opts = card.querySelector(".s1-opts");
        shuffle(q.o.map((t, j) => ({ t, ok: j === 0 }))).forEach((o) => {
          const b = el(`<button class="s1-opt">${esc(o.t)}</button>`);
          b.addEventListener("click", () => {
            opts.querySelectorAll("button").forEach((x) => { x.disabled = true; });
            const correct = [...opts.children].find((x) => x.dataset.ok);
            correct.classList.add("ok");
            if (o.ok) { right++; b.classList.add("picked"); }
            else { b.classList.add("bad"); if (a.onMiss) a.onMiss(q); }
            hit(o.ok, cardKey.quiz(q)); tick();
            card.querySelector(".s1-keys")?.remove();
            const why = card.querySelector(".s1-why");
            why.hidden = false;
            why.innerHTML = `<b>${o.ok ? "✓ Correct." : "✗ Not quite."}</b> ${esc(q.why || "")}`;
            why.className = "s1-why " + (o.ok ? "good" : "badwhy");
            card.appendChild(nextBtn(k + 1 < qs.length || qs.length === 1 ? "Next →" : "Finish", () => { k++; show(); }));
          });
          if (o.ok) b.dataset.ok = "1";
          opts.appendChild(b);
        });
        box.appendChild(card);
      };
      show();
    },

    /* ------------------------------- match ------------------------------ */
    match(a, box, done) {
      let sel = null, matched = 0, miss = 0;
      box.innerHTML = `<div class="s1-block"><h3>${esc(a.title)}</h3>
        <div class="s1-match"><div class="s1-col L"></div><div class="s1-col R"></div></div><div class="s1-fb"></div></div>`;
      const L = box.querySelector(".L"), R = box.querySelector(".R");
      shuffle(a.pairs.map((p, k) => ({ t: p[0], k }))).forEach((p) => {
        const b = el(`<button class="s1-mi">${esc(p.t)}</button>`);
        b.addEventListener("click", () => {
          if (b.disabled) return;
          L.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
          b.classList.add("sel"); sel = { k: p.k, b };
        });
        L.appendChild(b);
      });
      shuffle(a.pairs.map((p, k) => ({ t: p[1], k }))).forEach((p) => {
        const b = el(`<button class="s1-mi">${esc(p.t)}</button>`);
        b.addEventListener("click", () => {
          if (!sel) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); return; }
          if (sel.k === p.k) {
            [sel.b, b].forEach((x) => { x.classList.remove("sel"); x.classList.add("ok"); x.disabled = true; });
            sel = null; matched++;
            hit(true); tick();
            if (matched === a.pairs.length) {
              box.querySelector(".s1-fb").innerHTML = `<p class="s1-ok">✓ All matched${miss ? ` · ${miss} miss${miss > 1 ? "es" : ""}` : " — no misses"}.</p>`;
              box.querySelector(".s1-block").appendChild(nextBtn("Next →", () => done(Math.max(0, a.pairs.length - miss), a.pairs.length)));
            }
          } else {
            miss++; hit(false);
            b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake", "badflash");
            setTimeout(() => b.classList.remove("badflash"), 500);
          }
        });
        R.appendChild(b);
      });
    },

    /* -------------------------------- sort ------------------------------ */
    sort(a, box, done) {
      const items = shuffle(a.items);
      let k = 0, right = 0;
      const show = () => {
        if (k >= items.length) return done(right, items.length);
        const it = items[k];
        box.innerHTML = `<div class="s1-block s1-sort"><h3>${esc(a.title)}</h3>
          ${items.length > 1 ? `<div class="s1-dots">${items.map((_, j) => `<i class="${j < k ? "done" : j === k ? "cur" : ""}"></i>`).join("")}</div>` : ""}
          <div class="s1-sort-card">${esc(it.t)}</div>
          <div class="s1-buckets">${a.buckets.map((b, j) => `<button class="s1-bucket" data-b="${j}">${esc(b)}</button>`).join("")}</div>
          ${KEYS(a.buckets.length)}<div class="s1-why" hidden></div></div>`;
        box.querySelectorAll("[data-b]").forEach((b) => b.addEventListener("click", () => {
          const ok = +b.dataset.b === it.b;
          box.querySelectorAll("[data-b]").forEach((x) => { x.disabled = true; });
          box.querySelector(`[data-b="${it.b}"]`).classList.add("ok");
          if (!ok) b.classList.add("bad"); else { right++; b.classList.add("picked"); }
          hit(ok, cardKey.sort(it, a)); tick();
          box.querySelector(".s1-keys")?.remove();
          const why = box.querySelector(".s1-why");
          why.hidden = false; why.className = "s1-why " + (ok ? "good" : "badwhy");
          why.innerHTML = `<b>${ok ? "✓" : "✗"} ${esc(a.buckets[it.b])}.</b> ${esc(it.why)}`;
          box.querySelector(".s1-sort").appendChild(nextBtn(k + 1 < items.length || items.length === 1 ? "Next →" : "Finish", () => { k++; show(); }));
        }));
      };
      show();
    },

    /* -------------------------------- inop ------------------------------ */
    inop(a, box, done) {
      const cases = shuffle(a.cases);
      let k = 0, right = 0;
      const show = () => {
        if (k >= cases.length) return done(right, cases.length);
        const c = cases[k];
        box.innerHTML = `<div class="s1-block s1-inop">
          ${cases.length > 1 ? `<div class="s1-dots">${cases.map((_, j) => `<i class="${j < k ? "done" : j === k ? "cur" : ""}"></i>`).join("")}</div>` : ""}
          <div class="s1-inop-item"><span class="s1-placard">INOP</span><div><b>${esc(c.item)}</b><br><span class="s1-muted">${esc(c.flight)}</span>
          ${c.given ? `<br><span class="s1-given">${esc(c.given)}</span>` : ""}</div></div>
          <div class="s1-flowwrap">${inopFlowHTML(null)}</div>
          <div class="s1-buckets">
            <button class="s1-bucket" data-go="0">⛔ No-go — it's required</button>
            <button class="s1-bucket" data-go="1">✅ Go — remove or deactivate, placard INOP, PIC decides</button>
          </div>${KEYS(2)}<div class="s1-why" hidden></div></div>`;
        box.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
          const go = b.dataset.go === "1", ok = go === !c.req;
          box.querySelectorAll("[data-go]").forEach((x) => { x.disabled = true; });
          box.querySelector(`[data-go="${c.req ? 0 : 1}"]`).classList.add("ok");
          if (!ok) b.classList.add("bad"); else { right++; b.classList.add("picked"); }
          hit(ok, cardKey.inop(c)); tick();
          box.querySelector(".s1-keys")?.remove();
          box.querySelector(".s1-flowwrap").innerHTML = inopFlowHTML(c.req ? "205" : "go");
          const why = box.querySelector(".s1-why");
          why.hidden = false; why.className = "s1-why " + (ok ? "good" : "badwhy");
          why.innerHTML = `<b>${ok ? "✓" : "✗"}</b> ${esc(c.why)}`;
          box.querySelector(".s1-inop").appendChild(nextBtn(k + 1 < cases.length || cases.length === 1 ? "Next item →" : "Finish", () => { k++; show(); }));
        }));
      };
      show();
    },

    /* ------------------------------ recall ------------------------------ */
    // Must-know prompts, typed from memory. a = { sys? | items?, lead?, rapid?, last? }
    // (items: [{ q, a, alt?, all?, sys }]) → done(right, total, note?). Graded with
    // recallMatch; the canonical answer is always shown afterwards. Wrong answers
    // can be self-graded ("I had it" — the matcher missed a wording) or "Missed it".
    // Only the first submission counts; each item is a misses-deck card.
    recall(a, box, done) {
      const items = a.items || ((sysById(a.sys) || {}).must || []).map((m) => ({ ...m, sys: a.sys }));
      let k = 0, right = 0;
      const sysName = (it) => (sysById(it.sys) || {}).name || "";
      const record = (it, ok) => { if (ok) right++; hit(ok, cardKey.must(it.sys, it)); tick(); };
      const shell = (it, extra) => `<div class="s1-block s1-recall"><p class="s1-rc-from"><b>★ Must know</b> · ${esc(sysName(it) || a.from || "")}${extra || ""}</p>`;
      const input = (ph) => `<div class="s1-rc-row"><input class="s1-rc-in" type="text" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="${ph}" aria-label="Your answer">
        <button class="btn primary" data-act="go">Check</button></div>`;

      const show = () => {
        if (k >= items.length) return done(right, items.length);
        const it = items[k];
        box.innerHTML = shell(it, items.length > 1 ? ` · ${k + 1} of ${items.length}` : "") +
          (a.lead ? `<p class="s1-rc-lead">${esc(a.lead)}</p>` : "") +
          `<h3 class="s1-rc-q">${esc(it.q)}</h3>${input("Type it from memory · Enter")}
          <button type="button" class="s1-linkbtn" data-act="show">I don't know — show me</button><div class="s1-fb"></div></div>`;
        const inp = box.querySelector("input"), fb = box.querySelector(".s1-fb"), blk = box.firstElementChild;
        let locked = false;
        const lockUI = () => { locked = true; inp.disabled = true; box.querySelectorAll("[data-act]").forEach((b) => b.remove()); };
        const next = () => nextBtn(k + 1 < items.length ? "Next →" : (a.last || "Next →"), () => { k++; show(); });
        const submit = () => {
          if (locked) return;
          const v = inp.value.trim();
          if (!v) { inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); return; }
          const lvl = recallMatch(it, v);
          lockUI();
          if (lvl) {
            record(it, true);
            inp.classList.add("ok");
            fb.innerHTML = `<p class="s1-ok">✓ ${esc(it.a)}</p>${lvl === 2 ? `<p class="s1-muted">Close enough — mind the spelling; the examiner wants it exactly.</p>` : ""}`;
            blk.appendChild(next());
          } else {
            inp.classList.add("bad");
            fb.innerHTML = `<p class="bad">✗ Not what I was looking for.</p><p class="s1-rc-ans">The answer: <b>${esc(it.a)}</b></p>
              <p class="s1-muted">Be honest — did you have it, just worded differently?</p>
              <div class="s1-rc-self"><button class="btn" data-self="1">I had it</button><button class="btn" data-self="0">Missed it</button></div>`;
            fb.querySelectorAll("[data-self]").forEach((b) => b.addEventListener("click", () => {
              record(it, b.dataset.self === "1");
              k++; show();
            }));
            fb.querySelector("[data-self]").focus();
          }
        };
        box.querySelector('[data-act="go"]').addEventListener("click", submit);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } });
        box.querySelector('[data-act="show"]').addEventListener("click", () => {
          if (locked) return;
          lockUI(); record(it, false);
          fb.innerHTML = `<p class="s1-rc-ans">The answer: <b>${esc(it.a)}</b></p><p class="s1-muted">It's in your review deck.</p>`;
          blk.appendChild(next());
        });
        inp.focus();
      };

      // timed: SECS per prompt; a wrong guess can be retried until the clock runs out
      const SECS = 15;
      const rapid = () => {
        const best = (stats.rapid || {}).mustknow;
        box.innerHTML = `<div class="s1-block s1-recall"><h3>⚡ Rapid fire — must-know</h3>
          <p class="s1-muted">${items.length} prompts, ${SECS} seconds each. Type the answer and hit Enter; a wrong guess can be retried until the clock runs out.
          ${best ? `Your best clean run: <b>${best.toFixed(1)} s</b>.` : ""}</p>
          <button class="btn primary wide" data-act="go">⚡ Start</button></div>`;
        box.querySelector('[data-act="go"]').addEventListener("click", () => {
          const R = box.firstElementChild;
          R.innerHTML = `<p class="s1-rc-from"><b>★ Must know</b> · <span data-r="sys"></span> · <span data-r="n"></span></p>
            <h3 class="s1-rc-q"></h3><div class="s1-clock"><i></i></div>${input("Type it · Enter")}<p class="s1-rapid-msg"></p>`;
          const inp = R.querySelector("input"), bar = R.querySelector(".s1-clock i"), msg = R.querySelector(".s1-rapid-msg"), qEl = R.querySelector(".s1-rc-q");
          R.querySelector('[data-act="go"]').addEventListener("click", () => attempt());
          let t0 = 0, timer = 0, busy = false;
          const start = performance.now();
          const stop = () => clearInterval(timer);
          const present = () => {
            if (k >= items.length) {
              stop(); inp.disabled = true;
              const secs = (performance.now() - start) / 1000;
              let note = `${right} of ${items.length} in ${secs.toFixed(1)} s`;
              if (right === items.length && (!best || secs < best)) {
                stats.rapid = stats.rapid || {}; stats.rapid.mustknow = secs; save(STATS, stats);
                note += best ? " — new best!" : "";
              }
              return done(right, items.length, note);
            }
            const it = items[k];
            R.querySelector('[data-r="sys"]').textContent = sysName(it);
            R.querySelector('[data-r="n"]').textContent = `${k + 1} of ${items.length}`;
            qEl.textContent = it.q;
            inp.value = ""; inp.disabled = false; inp.focus(); msg.textContent = "";
            t0 = performance.now(); busy = false;
          };
          const resolve = (ok) => {
            busy = true; inp.disabled = true;
            const it = items[k];
            record(it, ok);
            msg.innerHTML = ok ? `<span class="s1-ok">✓ ${esc(it.a)}</span>` : `<span class="bad">⏱ ${esc(it.a)}</span>`;
            k++;
            setTimeout(() => { if (box.isConnected) present(); }, ok ? 450 : 1500);
          };
          function attempt() {
            if (busy) return;
            if (recallMatch(items[k], inp.value)) resolve(true);
            else { inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake"); inp.select(); }
          }
          inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); attempt(); } });
          timer = setInterval(() => {
            if (!box.isConnected) return stop();
            if (busy) return;
            const left = 1 - (performance.now() - t0) / (SECS * 1000);
            bar.style.width = Math.max(0, left * 100) + "%";
            bar.classList.toggle("low", left < 0.3);
            if (left <= 0) resolve(false);
          }, 50);
          present();
        });
      };
      a.rapid ? rapid() : show();
    },

    /* ------------------------------ systask ----------------------------- */
    // a = { sys, tasks, tickOne?, last? } → done(points, units)
    systask(a, box, done) {
      const tasks = a.tasks.slice();
      let k = 0, right = 0, total = 0;
      const next = () => {
        if (k >= tasks.length) return done(right, total);
        const t = tasks[k++];
        runTask(a.sys, t, box, { k: k - 1, n: tasks.length, tickOne: a.tickOne, last: k >= tasks.length ? a.last : null },
          (p, u) => { right += p; total += u; next(); });
      };
      next();
    },

    /* ------------------------------ systems ----------------------------- */
    // The examiner picks three (one is always a core system). Each is worked on
    // the live diagram — 4 tasks for a core system, 2–3 for the lighter ones —
    // then two questions per system. A system with no tasks yet falls back to
    // the old say-it-then-tick flow.
    systems(a, box, done) {
      const ready = (s) => (s.tasks || []).length && hasDef(s.id);
      const pool = shuffle(STAGE1_SYSTEMS);
      const core = pool.find((s) => s.core);
      const pick = shuffle([...(core ? [core] : []), ...pool.filter((s) => s !== core)].slice(0, 3));
      const plan = pick.map((s) => {
        if (!ready(s)) return [];
        const n = s.core ? 4 : 2 + Math.floor(Math.random() * 2);
        const all = shuffle(s.tasks), must = all.find((t) => t.t === "order" || t.t === "set");
        const rest = all.filter((t) => t !== must);
        return shuffle([...(must ? [must] : []), ...rest].slice(0, n));
      });
      const qs = shuffle(pick.flatMap((s) => shuffle(s.qs || []).slice(0, 2).map((q) => ({ ...q, from: s.name }))));
      // 2–3 must-know prompts per system, typed from memory before the hands-on tasks
      const pre = pick.map((s) => shuffle(s.must || []).slice(0, 2 + Math.floor(Math.random() * 2)).map((m) => ({ ...m, sys: s.id })));
      // the bar starts at 3 units; make it the real count (one unit per recall prompt)
      grow(plan.reduce((n, ts) => n + (ts.length ? ts.reduce((m, t) => m + taskUnits(t), 0) : 1), 0) + qs.length + pre.reduce((n, p) => n + p.length, 0) - 3);
      let k = 0, got = 0, total = 0;
      const show = () => {
        if (k >= pick.length) {
          if (!qs.length) return done(got, total);
          return RUNNERS.quiz({ qs }, box, (r, t) => done(got + r, total + t));
        }
        const s = pick[k], tasks = plan[k];
        const intro = `<div class="s1-examiner"><span>🧑‍✈️</span><p>"Pick one — ${pick.map((p, j) => j === k ? `<b>${p.name}</b>` : p.name).join(" · ")}.<br>
          Walk me through the <b>${s.name.toLowerCase()}</b> system."</p></div>`;
        const hands = () => {
          if (!tasks.length) return sayIt(s, intro);
          box.innerHTML = `<div class="s1-block s1-sys">${intro}
            ${s.intro ? `<p class="s1-muted">${esc(s.intro)}</p>` : ""}
            <p class="s1-muted">${tasks.length} task${tasks.length > 1 ? "s" : ""} on the live diagram — operate it, don't just recite it.</p></div>`;
          box.firstElementChild.appendChild(nextBtn("Begin →", () => {
            RUNNERS.systask({ sys: s, tasks, last: k + 1 < pick.length ? "Next system →" : "Quiz on these three →" }, box, (r, t) => { got += r; total += t; k++; show(); });
          }));
        };
        if (!pre[k].length) return hands();
        // recall first: the examiner wants the numbers cold before you touch the diagram
        box.innerHTML = `<div class="s1-block s1-sys">${intro}
          <p class="s1-muted">Before you start — ${pre[k].length} thing${pre[k].length > 1 ? "s" : ""} you should know cold, typed from memory.</p></div>`;
        box.firstElementChild.appendChild(nextBtn("Begin →", () => {
          RUNNERS.recall({ items: pre[k], lead: `Before you start — the ${s.name.toLowerCase()}.`, last: tasks.length ? "On to the diagram →" : "Continue →" }, box,
            (r, t) => { got += r; total += t; hands(); });
        }));
      };
      const sayIt = (s, intro) => {
        box.innerHTML = `<div class="s1-block s1-sys">${intro}
          <p class="s1-muted">Say it out loud first. Then check yourself — tick what you covered.</p>
          <button class="btn primary wide" data-act="reveal">Show what to cover</button>
          <div class="s1-sys-pts" hidden></div></div>`;
        box.querySelector('[data-act="reveal"]').addEventListener("click", (e) => {
          e.target.remove();
          const pts = box.querySelector(".s1-sys-pts");
          pts.hidden = false;
          pts.innerHTML = (s.fig ? `<div class="s1-fig">${s.fig()}</div>` : "") +
            s.points.map((p, j) => `<label class="s1-check"><input type="checkbox" data-j="${j}"> ${esc(p)}</label>`).join("");
          pts.appendChild(nextBtn(k + 1 < pick.length ? "Next system →" : "Quiz on these three →", () => {
            got += pts.querySelectorAll("input:checked").length; total += s.points.length;
            tick(); k++; show();
          }));
        });
      };
      show();
    },
  };

  /* ============================== WIDGETS =============================== */
  // 91.213(d) flowchart; `stop` = "205" (grounded at the 91.205 box) | "go" | null
  function inopFlowHTML(stop) {
    const node = (cls, t, sub) => `<div class="s1-fn ${cls}"><b>${t}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    const lit = (n) => stop === "go" || (stop === "205" && n <= 2) ? "lit" : "";
    return `<div class="s1-flow">
      ${node("q " + lit(0), "MEL?", "We don't have one → 91.213(d)")}
      ${node("q " + lit(1), "Required by the TCDS or the KOEL (POH)?", "yes → NO-GO")}
      ${node("q " + lit(2) + (stop === "205" ? " stop" : ""), "Required by 91.205 / another rule for this flight?", "A TOMATO FLAMES · FLAPS at night · yes → NO-GO")}
      ${node("q " + (stop === "go" ? "lit" : ""), "Required by an AD?", "yes → NO-GO")}
      ${node("go " + (stop === "go" ? "lit" : ""), "GO", "Remove or deactivate · placard INOP · log it if it was maintenance (43.9) · PIC decides it's safe")}
      ${stop === "205" ? node("nogo lit", "NO-GO", "Fix it — or a special flight permit from the FSDO") : ""}
    </div>`;
  }

  const WIDGETS = {
    inopFlow(w) { w.innerHTML = inopFlowHTML(null); },

    aoaLab(w) {
      w.innerHTML = `<div class="s1-aoa"><div class="s1-fig a1"></div><div class="s1-fig a2"></div></div>
        <label class="s1-slider">Angle of attack <input type="range" min="0" max="22" value="4"><output></output></label>
        <p class="s1-aoa-msg"></p>`;
      const r = w.querySelector("input"), out = w.querySelector("output"), msg = w.querySelector(".s1-aoa-msg");
      const draw = () => {
        const v = +r.value;
        w.querySelector(".a1").innerHTML = Diagrams.airfoil(v);
        w.querySelector(".a2").innerHTML = Diagrams.clCurve(v);
        out.textContent = v + "°";
        msg.innerHTML = v > Diagrams.CRIT
          ? `<b class="bad">Stalled.</b> The flow has separated from the top of the wing and lift has fallen off. Recover by <b>lowering the AOA</b> — not by pulling.`
          : v >= Diagrams.CRIT - 3 ? `<b class="warn">Approaching critical AOA.</b> The stall horn would be sounding.`
          : `Attached flow. More AOA → more lift (and more drag).`;
      };
      r.addEventListener("input", draw);
      draw();
      w.appendChild(el(`<p class="s1-note">Critical AOA is drawn at ${Diagrams.CRIT}° for illustration — it's a property of the wing, not a number on any gauge in the 172.</p>`));
    },

    tendencies(w) {
      const T = [
        ["Torque", Diagrams.torque(), "Newton's third law: the engine turns the prop clockwise, so the airplane wants to roll the other way — left."],
        ["P-factor", Diagrams.pfactor(), "At high AOA the descending (right) blade meets the air at a bigger angle and makes more thrust than the ascending blade."],
        ["Spiraling slipstream", Diagrams.slipstream(), "The prop wash corkscrews around the fuselage and strikes the left side of the vertical fin."],
        ["Gyroscopic precession", Diagrams.precession(), "A force on a spinning disc acts 90° ahead in rotation. Pitch changes yaw the nose — mostly a tailwheel thing."],
      ];
      w.innerHTML = `<div class="s1-tt">${T.map(([n, f, d]) =>
        `<div class="s1-tt-card"><h4>${n}</h4><div class="s1-fig">${f}</div><p>${d}</p></div>`).join("")}</div>
        <p class="s1-callout">All four → nose LEFT → <b>right rudder</b></p>`;
    },

    approachGrid(w) {
      const C = {
        "high-fast": ["High & fast", "Too much energy. <b>Power back</b> (idle if needed), pitch to bleed speed toward target, add flaps if below Vfe. Not fixed by the gate → <b>go around</b>."],
        "high-slow": ["High & slow", "<b>Lower the nose</b> — trade the extra altitude for airspeed. Once on speed, set power for the glidepath."],
        "low-fast": ["Low & fast", "<b>Raise the nose</b> — trade the extra airspeed for altitude, back to the glidepath. Then set power to hold it."],
        "low-slow": ["Low & slow", "The dangerous one. <b>Add power AND raise the nose</b> to the glidepath. If it isn't fixed right away — <b>go around</b>."],
        "on-on": ["Stabilized", "On glidepath, on speed. Small corrections only."],
      };
      w.innerHTML = `<div class="s1-app">
        <div class="s1-app-grid">
          <span></span><span class="h">Fast</span><span class="h">Slow</span>
          <span class="h">High</span><button data-k="high-fast">High &amp; fast</button><button data-k="high-slow">High &amp; slow</button>
          <span class="h">Low</span><button data-k="low-fast">Low &amp; fast</button><button data-k="low-slow" class="danger">Low &amp; slow</button>
        </div>
        <div class="s1-app-right"><div class="s1-fig"></div><p class="s1-app-txt"></p></div></div>`;
      const pick = (k) => {
        const [v, s] = k.split("-");
        w.querySelector(".s1-fig").innerHTML = Diagrams.glidepath(v, s);
        w.querySelector(".s1-app-txt").innerHTML = `<b>${C[k][0]}.</b> ${C[k][1]}`;
        w.querySelectorAll("[data-k]").forEach((b) => b.classList.toggle("on", b.dataset.k === k));
      };
      w.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => pick(b.dataset.k)));
      pick("on-on");
    },

    riskMatrix(w) {
      const LIK = ["Probable", "Occasional", "Remote", "Improbable"];
      const SEV = ["Catastrophic", "Critical", "Marginal", "Negligible"];
      const level = (l, s) => { const v = (4 - l) * (4 - s); return v >= 12 ? "High" : v >= 8 ? "Serious" : v >= 4 ? "Medium" : "Low"; };
      const ADV = { High: "Don't go as planned — eliminate or transfer the hazard.", Serious: "Mitigate before you go, or don't.",
        Medium: "Acceptable with mitigation — brief it, plan an out.", Low: "Accept, and keep watching." };
      let html = `<table class="s1-matrix"><tr><th>Likelihood ↓ · Severity →</th>${SEV.map((s) => `<th>${s}</th>`).join("")}</tr>`;
      LIK.forEach((l, i) => {
        html += `<tr><th>${l}</th>${SEV.map((s, j) => { const v = level(i, j); return `<td class="rm-${v}" data-i="${i}" data-j="${j}">${v}</td>`; }).join("")}</tr>`;
      });
      w.innerHTML = html + `</table><p class="s1-rm-txt s1-muted">Tap a cell.</p>
        <p class="s1-note">Example matrix in the PHAK's style — the cell boundaries are illustrative.</p>`;
      w.querySelectorAll("td").forEach((td) => td.addEventListener("click", () => {
        w.querySelectorAll("td").forEach((x) => x.classList.remove("on")); td.classList.add("on");
        const v = td.textContent;
        w.querySelector(".s1-rm-txt").innerHTML = `<b>${LIK[td.dataset.i]} × ${SEV[td.dataset.j]} = ${v} risk.</b> ${ADV[v]}`;
      }));
    },

    frat(w) {
      const F = [
        ["Pilot", "Less than 8 hours of sleep", 3], ["Pilot", "More than 30 days since you last flew", 3],
        ["Pilot", "Any IMSAFE item not 100%", 4],
        ["Aircraft", "Open squawk or deferred (INOP) item", 2], ["Aircraft", "Fuel at the legal reserve, not more", 3],
        ["enVironment", "Crosswind near your personal limit", 4], ["enVironment", "Gusts more than 10 kt", 2],
        ["enVironment", "Ceiling under 3,000 ft or visibility under 5 sm", 3], ["enVironment", "Night", 3],
        ["enVironment", "Unfamiliar airport", 2],
        ["External", "Schedule pressure / someone waiting", 3], ["External", "No backup plan if you don't go", 2],
      ];
      w.innerHTML = `<div class="s1-frat">${F.map(([c, t, p], k) =>
        `<label class="s1-check"><input type="checkbox" data-p="${p}"> <span class="s1-muted">${c}</span> ${t} <em>+${p}</em></label>`).join("")}</div>
        <div class="s1-frat-out"></div>`;
      const upd = () => {
        const s = [...w.querySelectorAll("input:checked")].reduce((a, i) => a + +i.dataset.p, 0);
        const [cls, t] = s >= 12 ? ["bad", "High — change the plan or don't go. Talk to your CFI."] :
          s >= 7 ? ["warn", "Caution — mitigate the biggest items before you go."] : ["good", "Low — go, and keep re-assessing."];
        w.querySelector(".s1-frat-out").innerHTML = `<div class="s1-frat-score ${cls}"><b>${s}</b><span>${t}</span></div>`;
      };
      w.querySelectorAll("input").forEach((i) => i.addEventListener("change", upd));
      upd();
    },

    minimums(w) {
      const FIELDS = [
        ["ceilDay", "Ceiling — day (ft AGL)", 3000], ["ceilNight", "Ceiling — night (ft AGL)", 5000],
        ["visDay", "Visibility — day (sm)", 5], ["visNight", "Visibility — night (sm)", 7],
        ["wind", "Max surface wind (kt)", 15], ["xwind", "Max crosswind (kt)", 8], ["gust", "Max gust spread (kt)", 8],
        ["rwy", "Min runway length (ft)", 3000], ["sleep", "Min sleep the night before (hr)", 7],
        ["recent", "Max days since last flight before going dual", 30],
      ];
      const mine = load(MINS, {});
      w.innerHTML = `<div class="s1-mins">${FIELDS.map(([k, l, d]) =>
        `<label>${l}<input type="number" data-k="${k}" value="${mine[k] ?? d}"></label>`).join("")}</div>
        <h4 class="s1-sub">Today's conditions</h4>
        <div class="s1-mins today">
          <label>Ceiling (ft AGL)<input type="number" data-t="ceil" value="4500"></label>
          <label>Visibility (sm)<input type="number" data-t="vis" value="10"></label>
          <label>Wind (kt)<input type="number" data-t="wind" value="10"></label>
          <label>Crosswind (kt)<input type="number" data-t="xwind" value="6"></label>
          <label>Gust spread (kt)<input type="number" data-t="gust" value="0"></label>
          <label>Runway (ft)<input type="number" data-t="rwy" value="5000"></label>
          <label>Sleep (hr)<input type="number" data-t="sleep" value="8"></label>
          <label>Days since last flight<input type="number" data-t="recent" value="5"></label>
          <label class="s1-check"><input type="checkbox" data-t="night"> Night</label>
        </div>
        <div class="s1-gonogo"></div>
        <button class="btn small" data-act="print">🖨 Print my minimums</button>`;
      const v = (sel) => +w.querySelector(sel).value;
      const upd = () => {
        const m = {};
        w.querySelectorAll("[data-k]").forEach((i) => { m[i.dataset.k] = +i.value; });
        save(MINS, m);
        const night = w.querySelector('[data-t="night"]').checked;
        const fails = [];
        if (v('[data-t="ceil"]') < (night ? m.ceilNight : m.ceilDay)) fails.push("ceiling");
        if (v('[data-t="vis"]') < (night ? m.visNight : m.visDay)) fails.push("visibility");
        if (v('[data-t="wind"]') > m.wind) fails.push("wind");
        if (v('[data-t="xwind"]') > m.xwind) fails.push("crosswind");
        if (v('[data-t="gust"]') > m.gust) fails.push("gusts");
        if (v('[data-t="rwy"]') < m.rwy) fails.push("runway length");
        if (v('[data-t="sleep"]') < m.sleep) fails.push("sleep");
        if (v('[data-t="recent"]') > m.recent) fails.push("recency — fly dual first");
        w.querySelector(".s1-gonogo").innerHTML = fails.length
          ? `<div class="s1-frat-score bad"><b>NO-GO</b><span>Outside your minimums: ${fails.join(", ")}.</span></div>`
          : `<div class="s1-frat-score good"><b>GO</b><span>Within your personal minimums — still run PAVE.</span></div>`;
      };
      w.querySelectorAll("input").forEach((i) => i.addEventListener("input", upd));
      w.querySelector('[data-act="print"]').addEventListener("click", () => {
        const rows = FIELDS.map(([k, l]) => `<tr><td>${l}</td><td><b>${w.querySelector(`[data-k="${k}"]`).value}</b></td></tr>`).join("");
        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(`<title>Personal minimums</title><body style="font-family:sans-serif;padding:30px">
          <h2>My personal minimums</h2><table border="1" cellpadding="8" style="border-collapse:collapse">${rows}</table>
          <p>Signed: ____________________ Date: __________</p></body>`);
        win.document.close(); win.print();
      });
      upd();
    },

    /* Systems lab (Learn): airplane hero → system chips → live simulator with
       Explore / Scenarios / Key facts. Selection, explored parts and finished
       scenarios persist in STATS.sysSeen. */
    systemsLab(w) {
      const order = [...STAGE1_SYSTEMS.filter((s) => s.core), ...STAGE1_SYSTEMS.filter((s) => !s.core)];
      const seenOf = (id) => { stats.sysSeen = stats.sysSeen || {}; return stats.sysSeen[id] || (stats.sysSeen[id] = { p: [], l: [] }); };
      const partIds = (s) => { const k = Object.keys(s.parts || {}), d = hasDef(s.id) ? SD().get(s.id) : null; return d ? k.filter((x) => d.parts.includes(x)) : k; };
      const fullyDone = (s) => {
        const sn = seenOf(s.id), P = partIds(s), nl = (s.labs || []).length;
        return (P.length || nl) && P.every((p) => sn.p.includes(p)) && (!nl || sn.l.length >= nl);
      };
      w.innerHTML = `<div class="sx-lab">
        <div class="s1-sysnav">${order.map((s) => `<button class="s1-chip" data-s="${s.id}">${s.core ? `<i class="sx-core" title="core system"></i>` : ""}${esc(s.name)}<b class="sx-tick"></b></button>`).join("")}</div>
        <section class="sx-must" aria-label="Must know"></section>
        <section class="sx-hero" hidden><div class="sx-hero-view"></div>
          <details class="sx-picks"><summary>Pick a spot from a list instead</summary><div class="sx-pickbody">${pickListHTML()}</div></details></section>
        <div class="sx-cols">
          <div class="sx-main">
            <div class="sx-tools">
              <button class="btn small" data-act="labels" aria-pressed="false">Hide labels</button>
              <button class="btn small" data-act="reset">Reset</button>
              <span class="s1-seg sx-viewseg" hidden><button data-view="2d" class="on">Schematic</button><button data-view="3d">3D</button></span>
            </div>
            <div class="sx-host"></div>
          </div>
          <div class="sx-side">
            <div class="s1-seg sx-tabs"><button class="on" data-pane="explore">Explore</button><button data-pane="scen">Scenarios</button><button data-pane="facts">Key facts</button></div>
            <div class="sx-pane" data-p="explore"><p class="sx-count"></p><div class="sx-card"></div><div class="sx-plist"></div></div>
            <div class="sx-pane" data-p="scen" hidden></div>
            <div class="sx-pane" data-p="facts" hidden></div>
          </div></div>
        <p class="s1-note">Schematics and 3D shapes are illustrative. Numbers are from the C172S POH as quoted in training material — the airplane's own POH governs.</p></div>`;
      const q = (s) => w.querySelector(s), qa = (s) => [...w.querySelectorAll(s)];
      const host = q(".sx-main .sx-host"), hero = q(".sx-hero"), hv = q(".sx-hero-view");
      let cur = null, heroView = null, heroLab = null, hideLbl = false;
      const alive = () => w.isConnected;
      const seen = () => seenOf(cur.s.id);
      const store = () => save(STATS, stats);

      /* ---- airplane hero ---- */
      const heroSelect = (id) => { if (heroView) heroView.select(id); if (heroLab) heroLab.redraw({ sel: id }); };
      function openPart(id) {
        const i = id.indexOf("."), sid = id.slice(0, i), part = id.slice(i + 1);
        if (!sysById(sid)) return;
        if (!cur || cur.s.id !== sid) show(sid, part); else selectPart(part);
      }
      w.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
        if (heroView) heroView.pick(b.dataset.pick); else openPart(b.dataset.pick);
      }));
      function heroInit() {
        const t = S3(), twoD = (note) => {
          hero.hidden = !hasDef("airplane") && !hotspots().length;
          hv.innerHTML = "";
          if (hasDef("airplane")) {
            heroLab = mountLab(hv, "airplane", { controls: false, readout: false });
            heroLab.onPart(openPart);
            if (note) hv.insertAdjacentHTML("afterbegin", `<p class="s3-note">3D unavailable — showing schematic</p>`);
          } else hv.hidden = true;
        };
        if (!t) return twoD(false);
        hero.hidden = false;
        hv.innerHTML = `<p class="s3-hint s3-loading">Loading the 3D airplane…</p>`;
        ready3d().then((ok) => { if (!ok || !alive()) return null; hv.innerHTML = ""; return t.mount(hv, { scene: "airplane", labels: true, focus: cur && cur.s.id, onPick: (p) => openPart(p.id) }); })
          .catch(() => null).then((v) => {
            if (!alive()) return dropView(v);
            if (v) { heroView = track(v); if (cur) { v.setFocus(cur.s.id); if (cur.sel) v.select(cur.s.id + "." + cur.sel); } } else twoD(true);
          });
      }

      /* ---- Explore pane ---- */
      const exploredMarks = () => Object.fromEntries(seen().p.map((p) => [p, "done"]));
      function renderExplore() {
        const s = cur.s, P = partIds(s), sn = seen();
        q(".sx-count").innerHTML = P.length ? `Explored <b>${P.filter((p) => sn.p.includes(p)).length} / ${P.length}</b> parts` : "";
        const info = cur.sel && s.parts && s.parts[cur.sel];
        q(".sx-card").innerHTML = info
          ? `<h4>${esc(info.n)}</h4><p>${info.d}</p>${info.tip ? `<p class="sx-tip"><b>Examiner:</b> ${info.tip}</p>` : ""}`
          : `<p class="s1-muted">${s.intro ? esc(s.intro) + " " : ""}${P.length ? "Click any part on the diagram — or pick one below — to see what it does." : "Part notes aren't loaded for this system yet; the Key facts tab has the essentials."}</p>`;
        q(".sx-plist").innerHTML = P.map((p) => `<button type="button" class="sx-pchip ${sn.p.includes(p) ? "seen" : ""} ${cur.sel === p ? "on" : ""}" data-p="${p}">${esc(s.parts[p].n)}</button>`).join("");
        qa(".sx-pchip").forEach((b) => b.addEventListener("click", () => selectPart(b.dataset.p)));
      }
      function selectPart(part) {
        if (!cur) return;
        cur.sel = part;
        if (cur.s.parts && cur.s.parts[part] && !seen().p.includes(part)) { seen().p.push(part); store(); }
        if (cur.lab) cur.lab.redraw({ sel: part, marks: exploredMarks() });
        if (cur.view3) cur.view3.select(cur.s.id + "." + part);
        heroSelect(cur.s.id + "." + part);
        setPane("explore");
        renderExplore(); chipState();
      }
      function chipState() {
        qa(".s1-chip").forEach((b) => {
          const s = sysById(b.dataset.s);
          b.classList.toggle("on", !!cur && s.id === cur.s.id);
          b.querySelector(".sx-tick").textContent = fullyDone(s) ? " ✓" : "";
        });
      }

      /* ---- ★ Must know: flashcards above the lab (tap to reveal, show all, test me) ---- */
      function renderMust() {
        const s = cur.s, M = s.must || [], box = q(".sx-must");
        box.hidden = !M.length;
        if (!M.length) { box.innerHTML = ""; return; }
        box.innerHTML = `<div class="sx-must-head"><h3><span class="sx-must-star">★</span> Must know <small>${esc(s.name)} — say it from memory, word for word</small></h3>
          <div class="sx-must-acts"><button type="button" class="btn small" data-act="mk-all" aria-pressed="false">Show all</button>
          <button type="button" class="btn small primary" data-act="mk-test">Test me ▸</button></div></div>
          <div class="sx-must-grid">${M.map((m, i) => `<button type="button" class="sx-mk" data-i="${i}" aria-pressed="false">
            <span class="sx-mk-q">${esc(m.q)}</span><span class="sx-mk-a">${esc(m.a)}</span><i class="sx-mk-hint">tap to reveal</i></button>`).join("")}</div>`;
        const grid = box.querySelector(".sx-must-grid"), allBtn = box.querySelector('[data-act="mk-all"]');
        grid.addEventListener("click", (e) => {
          const c = e.target.closest(".sx-mk");
          if (c) c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true");
        });
        allBtn.addEventListener("click", () => {
          const on = allBtn.getAttribute("aria-pressed") !== "true";
          allBtn.setAttribute("aria-pressed", on); allBtn.textContent = on ? "Hide all" : "Show all";
          grid.querySelectorAll(".sx-mk").forEach((c) => c.setAttribute("aria-pressed", on));
        });
        box.querySelector('[data-act="mk-test"]').addEventListener("click", () => topic("systems", "recall", { sys: s.id, go: true }));
      }

      /* ---- Scenarios pane ---- */
      const labsOf = () => cur.s.labs || [];
      function renderScen() {
        const P = q('[data-p="scen"]'), labs = labsOf();
        if (!labs.length) { P.innerHTML = `<p class="s1-muted">No guided scenarios for this system yet.</p>`; return; }
        if (!cur.lab || cur.lab.fallback) { P.innerHTML = `<p class="s1-muted">Scenarios run on the interactive schematic.</p>${cur.mode === "3d" ? `<button class="btn small" data-act="to2d">Switch to schematic</button>` : ""}`; P.querySelector("[data-act]")?.addEventListener("click", () => setMode("2d")); return; }
        const done = seen().l;
        let html = `<div class="sx-labs">${labs.map((l, i) => `<button type="button" class="sx-labbtn ${i === cur.li ? "on" : ""} ${done.includes(i) ? "done" : ""}" data-lab="${i}">${done.includes(i) ? "✓ " : ""}${esc(l.h)}</button>`).join("")}</div>`;
        const lb = labs[cur.li];
        if (lb) {
          html += `<ol class="sx-steps">${lb.steps.map((st, j) => `<li class="${j < cur.k ? "ok" : j === cur.k ? "cur" : ""}">
            <span class="sx-do">${st.do}</span>${j < cur.k && st.see ? `<span class="sx-see">${st.see}</span>` : ""}</li>`).join("")}</ol>`;
          if (cur.k >= lb.steps.length) html += `<p class="s1-ok">✓ Scenario complete.</p>`;
        } else html += `<p class="s1-muted">Pick a scenario — the diagram resets to its starting point, then you operate the controls yourself.</p>`;
        P.innerHTML = html;
        P.querySelectorAll("[data-lab]").forEach((b) => b.addEventListener("click", () => startLab(+b.dataset.lab)));
      }
      function startLab(i) {
        cur.li = -1; cur.k = 0;   // reset() fires onChange; don't tick off steps while arming
        cur.lab.reset(labsOf()[i].start || {});
        cur.lab.redraw({ sel: null, marks: {} });
        cur.li = i;
        renderScen();
      }
      // every manipulation: tick off steps whose `when` the live state now meets, in order
      function onState() {
        const lb = labsOf()[cur.li];
        if (!lb) return;
        const before = cur.k;
        while (cur.k < lb.steps.length && SD().match(cur.lab.def, cur.lab.state, lb.steps[cur.k].when)) cur.k++;
        if (cur.k === before) return;
        if (cur.k >= lb.steps.length && !seen().l.includes(cur.li)) { seen().l.push(cur.li); store(); chipState(); }
        renderScen();
      }

      /* ---- panes & modes ---- */
      function setPane(p) {
        cur.pane = p;
        qa(".sx-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.pane === p));
        qa(".sx-pane").forEach((x) => { x.hidden = x.dataset.p !== p; });
        if (cur.lab) cur.lab.redraw({ marks: p === "explore" ? exploredMarks() : {} });
        if (p === "scen") renderScen();
      }
      qa(".sx-tabs button").forEach((b) => b.addEventListener("click", () => setPane(b.dataset.pane)));

      function mount2d() {
        cur.mode = "2d";
        cur.lab = mountLab(host, cur.s.id, { labels: !hideLbl });
        cur.lab.onPart(selectPart).onChange(onState);
        if (cur.sel) cur.lab.redraw({ sel: cur.sel, marks: exploredMarks() });
        qa("[data-act=labels],[data-act=reset]").forEach((b) => { b.hidden = !!cur.lab.fallback; });
      }
      // engine only: the exploded 3D IO-360 in place of the 2D schematic
      async function mount3d() {
        const tok = ++cur.tok;
        cur.mode = "3d"; cur.lab = null;
        host.innerHTML = `<div class="sx-stage"><div class="sx-fig sx-3d"></div>
          <div class="sx-strip sx-strip3">
            <label class="sx-cg sx-rg"><span class="sx-cl">Explode</span><input type="range" data-e="explode" min="0" max="1" step="0.05" value="0"><output>0</output></label>
            <div class="sx-cg"><button type="button" class="sx-tg" data-e="cut" aria-pressed="false">Cutaway</button></div>
            <label class="sx-cg sx-rg"><span class="sx-cl">Crank</span><input type="range" data-e="crank" min="0" max="720" step="5" value="0"><output>0°</output></label>
            <div class="sx-cg"><button type="button" class="sx-tg" data-e="play" aria-pressed="false">Play</button></div></div></div>`;
        qa("[data-act=labels],[data-act=reset]").forEach((b) => { b.hidden = true; });
        qa(".sx-viewseg button").forEach((b) => b.classList.toggle("on", b.dataset.view === "3d"));
        let v = null;
        try { v = await S3().mount(host.querySelector(".sx-3d"), { scene: "engine", labels: true, onPick: (p) => selectPart(p.part) }); } catch (e) { v = null; }
        if (tok !== cur.tok || !alive()) return dropView(v);
        if (!v) { setMode("2d"); host.insertAdjacentHTML("afterbegin", `<p class="s3-note">3D unavailable — showing schematic</p>`); return; }
        cur.view3 = track(v);
        if (cur.sel) v.select("engine." + cur.sel);
        const strip = host.querySelector(".sx-strip3");
        const on = (e) => {
          const n = e.target.closest("[data-e]");
          if (!n) return;
          const key = n.dataset.e;
          if (n.type === "range") { v.set(key, +n.value); n.nextElementSibling.textContent = key === "crank" ? n.value + "°" : n.value; }
          else { const p = n.getAttribute("aria-pressed") !== "true"; n.setAttribute("aria-pressed", p); n.classList.toggle("on", p); v.set(key, p); }
        };
        strip.addEventListener("input", on);
        strip.addEventListener("click", (e) => { if (e.target.closest("button[data-e]")) on(e); });
        if (cur.pane === "scen") renderScen();
      }
      function setMode(m) {
        dropView(cur.view3); cur.view3 = null;
        qa(".sx-viewseg button").forEach((b) => b.classList.toggle("on", b.dataset.view === m));
        cur.tok++;
        if (m === "3d") mount3d(); else { mount2d(); if (cur.pane === "scen") renderScen(); }
      }
      qa(".sx-viewseg button").forEach((b) => b.addEventListener("click", () => { if (cur.mode !== b.dataset.view) setMode(b.dataset.view); }));
      q("[data-act=labels]").addEventListener("click", (e) => {
        hideLbl = !hideLbl;
        e.target.setAttribute("aria-pressed", hideLbl);
        e.target.textContent = hideLbl ? "Show labels" : "Hide labels";
        if (cur.lab) cur.lab.redraw({ labels: !hideLbl });
      });
      q("[data-act=reset]").addEventListener("click", () => {
        if (!cur.lab) return;
        cur.li = -1; cur.k = 0;
        cur.lab.reset({}); cur.sel = null;
        cur.lab.redraw({ marks: cur.pane === "explore" ? exploredMarks() : {} });
        renderExplore(); if (cur.pane === "scen") renderScen();
      });

      function show(id, part) {
        const s = sysById(id);
        if (cur) { dropView(cur.view3); cur.tok++; }
        cur = { s, lab: null, mode: "2d", pane: (cur && cur.pane) || "explore", sel: null, li: -1, k: 0, tok: cur ? cur.tok + 1 : 0, view3: null };
        if (heroView) { heroView.setFocus(id); heroView.select(null); }
        if (heroLab) heroLab.redraw({ sel: null });
        mount2d();
        q('[data-p="facts"]').innerHTML = `<ul class="s1-list">${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          <p class="s1-note">Say these aloud — the examiner wants the sentence, not just the click.</p>`;
        // engine: offer the 3D view once three.js is known to work
        const vs = q(".sx-viewseg"); vs.hidden = true;
        qa(".sx-viewseg button").forEach((b) => b.classList.toggle("on", b.dataset.view === "2d"));
        if (id === "engine" && S3()) ready3d().then((ok) => { if (ok && alive() && cur.s.id === "engine") vs.hidden = false; });
        setPane(cur.pane);
        renderMust();
        renderExplore(); chipState();
        if (part) selectPart(part);
      }
      qa("[data-s]").forEach((b) => b.addEventListener("click", () => show(b.dataset.s)));
      heroInit();
      show(order[0].id);
    },
  };
  WIDGETS.systemsBrowser = WIDGETS.systemsLab;   // old name, same lab

  /* ============================ activation ============================= */
  function activate() {
    $("studyApp").hidden = false;
    ["startBtn", "restartBtn", "scenarioBtn"].forEach((x) => { $(x).hidden = true; });
    UI.closePopover();
    home();
  }
  function deactivate() {
    stopVoice(); killViews();
    run = null;
    root.innerHTML = "";   // stops any rapid-fire clock and pending examiner line
    $("studyApp").hidden = true;
    $("progressText").textContent = "";
  }

  // 1–9 pick the nth answer, Enter / → press the Next button. Typing in a
  // field is left alone (the acronym inputs have their own Enter handling).
  function onKey(e) {
    if (!root || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (/^(TEXTAREA|SELECT)$/.test(t.tagName) || t.tagName === "INPUT" && !/^(checkbox|radio)$/.test(t.type)) return;
    if (/^[1-9]$/.test(e.key)) {
      const b = root.querySelectorAll(".s1-opt:not(:disabled), .s1-bucket:not(:disabled)")[+e.key - 1];
      if (b) { e.preventDefault(); b.focus({ preventScroll: true }); b.click(); }
    } else if (e.key === "Enter" || e.key === "ArrowRight") {
      const n = [...root.querySelectorAll(".s1-next")].pop();
      if (n) { e.preventDefault(); n.click(); }
    }
  }
  function init() {
    root = $("studyApp");
    document.addEventListener("keydown", onKey);
  }

  const noop = () => {};
  return { init, activate, deactivate, start: noop, restart: noop, showHint: noop };
})();

window.StudyDrill = StudyDrill;
