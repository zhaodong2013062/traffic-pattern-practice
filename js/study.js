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
   flow), systems (the examiner picks three — say what you know, then check
   yourself against the list).

   Drills show a progress bar and a combo counter. Every missed quiz, sort and
   inop card lands in a Leitner review deck ("Review my misses") and comes
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

  /* ============================ review deck ============================= */
  // Leitner boxes: a miss goes to box 0 (due now); each right answer when it
  // is due moves it up a box; right out of the last box and it is retired.
  const BOX_DAYS = [0, 1, 3, 7, 14];
  const cardKey = {
    quiz: (q) => "q:" + q.q,
    sort: (it, a) => "s:" + a.title + "|" + it.t,
    inop: (c) => "i:" + c.item + "|" + c.flight,
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
    STAGE1_SYSTEMS.forEach((s) => (s.qs || []).forEach((q) => add(cardKey.quiz(q), { kind: "quiz", topic: "Systems · " + s.name, q })));
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
        setTimeout(() => { pill.classList.remove("broke"); if (run.combo < 2) pill.hidden = true; }, 450);
      }
      run.combo = 0;
    }
  }

  /* ================================ HOME ================================ */
  function home() {
    stopVoice();
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
  function topic(id, tab = "learn") {
    stopVoice();
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
      </div>
      <div class="s1-body"></div>
    </div>`;
    root.querySelector('[data-act="back"]').addEventListener("click", home);
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => topic(id, b.dataset.tab)));
    const body = root.querySelector(".s1-body");
    if (tab === "learn") renderLearn(t, body, id);
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
    const order = Object.keys(STAGE1_TOPICS);
    const pool = [];
    Object.entries(STAGE1_TOPICS).forEach(([id, t]) => t.drill.forEach((a) => {
      if (a.type === "quiz") a.qs.forEach((q) => pool.push({ ...q, from: t.name, ord: order.indexOf(id) }));
    }));
    const sysOrd = Math.max(0, order.indexOf("systems"));
    STAGE1_SYSTEMS.forEach((s) => (s.qs || []).forEach((q) => pool.push({ ...q, from: "Systems · " + s.name, ord: sysOrd })));
    // a random fifteen, then asked topic by topic the way the oral flows
    const qs = shuffle(pool).slice(0, 15).sort((x, y) => x.ord - y.ord || (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
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
            el(`<li><span class="s1-muted">${esc(q.from)}</span><br>${esc(q.q)} — <b>${esc(q.o[0])}</b></li>`)));
          body.appendChild(list);
        }
      }));
    };

    examiner(`Good morning. I'll ask you about ${qs.length} questions from across the stage — PAVE, systems, ADM, aerodynamics, approaches and airport ops. Take your time; it's fine to think out loud. Ready?`,
      () => button("Ready →", ask));
  }

  /* ============================ REVIEW DECK ============================= */
  function review() {
    run = null;
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
      const act = c.kind === "quiz" ? { type: "quiz", qs: [c.q] }
        : c.kind === "sort" ? { type: "sort", title: c.a.title, buckets: c.a.buckets, items: [c.it] }
        : { type: "inop", cases: [c.c] };
      // a miss comes round once more at the end; only the first try is scored
      const wasAgain = again.has(key);
      RUNNERS[c.kind](act, box, (r) => {
        if (!wasAgain) { first++; right += r; }
        if (!r && !wasAgain) { again.add(key); queue.push(key); grow(1); }
        next();
      });
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
    sort: (a) => a.items.length, inop: (a) => a.cases.length, systems: () => 3 };
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

  const RUNNERS = {
    /* ----------------------------- acronym ------------------------------ */
    acronym(a, box, done) {
      let mode = "tiles", stop = () => {};
      const render = () => {
        stop();
        // switching modes restarts this part's share of the progress bar
        if (live()) { run.done = run.partStart; paint(); }
        box.innerHTML = `<div class="s1-block s1-acro">
          <div class="s1-acro-top"><h3>Spell out <b>${a.word}</b></h3>
            <div class="s1-seg"><button data-m="tiles" class="${mode === "tiles" ? "on" : ""}">Tiles</button>
            <button data-m="type" class="${mode === "type" ? "on" : ""}">Type it</button>
            <button data-m="rapid" class="${mode === "rapid" ? "on" : ""}">⚡ Rapid fire</button></div></div>
          <div class="s1-slots"></div><div class="s1-tiles"></div><div class="s1-fb"></div></div>`;
        box.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; render(); }));
        if (mode === "rapid") return rapid();
        const slots = box.querySelector(".s1-slots");
        a.items.forEach((it) => slots.appendChild(el(
          `<div class="s1-slot"><b>${it.l}</b><span class="s1-slot-w">${mode === "type" ? `<input type="text" autocomplete="off" spellcheck="false" autocapitalize="off">` : ""}</span></div>`)));
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
            // a repeated word (two A's) is fine in either tile
            if (a.items[n].w === it.w) {
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

      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const accepts = (it, raw) => {
        const v = norm(raw), cands = [it.w, ...(it.alt || [])].map(norm);
        return v.length >= 2 && cands.some((c) => c.startsWith(v.slice(0, Math.max(3, Math.min(v.length, 5)))) && v.length >= 3 || v.includes(c));
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
          inputs.forEach((inp, k) => {
            const it = a.items[k], ok = accepts(it, inp.value);
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
          <div class="s1-dots">${dots}</div>
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
            <button class="s1-bucket" data-go="1">✅ Go — deactivate, placard, record, PIC decides</button>
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

    /* ------------------------------ systems ----------------------------- */
    systems(a, box, done) {
      const pick = shuffle(STAGE1_SYSTEMS).slice(0, 3);
      let k = 0, got = 0, total = 0;
      const show = () => {
        if (k >= pick.length) {
          // then a quick quiz on the same three
          const qs = shuffle(pick.flatMap((s) => (s.qs || []).map((q) => ({ ...q, from: s.name }))));
          if (!qs.length) return done(got, total);
          grow(qs.length);
          return RUNNERS.quiz({ qs }, box, (r, t) => done(got + r, total + t));
        }
        const s = pick[k];
        box.innerHTML = `<div class="s1-block s1-sys">
          <div class="s1-examiner"><span>🧑‍✈️</span><p>"Pick one — ${pick.map((p, j) => j === k ? `<b>${p.name}</b>` : p.name).join(" · ")}.<br>
          Walk me through the <b>${s.name.toLowerCase()}</b> system."</p></div>
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
            tick();
            k++; show();
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
      ${node("go " + (stop === "go" ? "lit" : ""), "GO", "Remove or deactivate · placard INOP · record it · PIC decides it's safe")}
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

    systemsBrowser(w) {
      w.innerHTML = `<div class="s1-sysnav">${STAGE1_SYSTEMS.map((s) => `<button class="s1-chip" data-s="${s.id}">${s.name}</button>`).join("")}</div>
        <div class="s1-sysview"></div>`;
      const pick = (id) => {
        const s = STAGE1_SYSTEMS.find((x) => x.id === id);
        w.querySelectorAll("[data-s]").forEach((b) => b.classList.toggle("on", b.dataset.s === id));
        w.querySelector(".s1-sysview").innerHTML = `<div class="s1-sysgrid"><ul class="s1-list">${s.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          ${s.fig ? `<div class="s1-fig">${s.fig()}</div>` : ""}</div>`;
      };
      w.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => pick(b.dataset.s)));
      pick(STAGE1_SYSTEMS[0].id);
      w.appendChild(el(`<p class="s1-note">Numbers are from the C172S POH as quoted in training material — the airplane's own POH governs.</p>`));
    },
  };

  /* ============================ activation ============================= */
  function activate() {
    $("studyApp").hidden = false;
    ["startBtn", "restartBtn", "scenarioBtn"].forEach((x) => { $(x).hidden = true; });
    UI.closePopover();
    home();
  }
  function deactivate() {
    stopVoice();
    run = null;
    root.innerHTML = "";   // stops any rapid-fire clock and pending examiner line
    $("studyApp").hidden = true;
    $("progressText").textContent = "";
  }

  // 1–9 pick the nth answer, Enter / → press the Next button. Typing in a
  // field is left alone (the acronym inputs have their own Enter handling).
  function onKey(e) {
    if (!root || root.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
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
