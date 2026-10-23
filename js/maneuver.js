/* ============================================================================
   maneuver.js  —  Controller for the PHASE-CHECK MANEUVERS drill.

   The evaluator names the maneuver, so unlike the emergencies there is no
   secret to keep: the pilot picks one from the menu (or "Surprise me"), reads
   the setup card — what it is, the airplane's state, the ACS standards — and
   presses Begin. From there it is the pattern's loop: conditions only, click
   a control, pick its setting, nothing shown until "Show hint".

   Two things the pattern doesn't have:
     - The PRE-MANEUVER FLOW (height · area · engine check · radio · clearing
       turns · references) runs ahead of every maneuver unless it is switched
       off in the menu; it is the same every time, and skipping it is the most
       common phase-check deduction.
     - DEDUCTIONS. Where a wrong click is a classic evaluator write-up (power
       before the nose comes down, all the flaps at once, chasing altitude)
       the act carries a `why`; the pilot gets the reason instead of a bare ✗,
       and the debrief lists it.

   API on window.ManeuverDrill: init() / activate() / deactivate() / start() /
   restart() / showHint()
   ========================================================================== */

const ManeuverDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "c172-maneuver-preflow";
  // which controls print the chosen value on the panel
  const SHOW_LABEL = new Set(["fuel", "mixture", "seatbelt", "call", "outside", "trim"]);

  let man = null, steps = [], i = 0;
  let pending = [];                 // act indices still open in this step
  let openAct = -1;                 // act whose menu is open
  let running = false, finished = false;
  let stats = null;
  let withPre = loadPre();

  function loadPre() {
    try { return localStorage.getItem(STORE_KEY) !== "off"; } catch (e) { return true; }
  }
  function savePre() {
    try { localStorage.setItem(STORE_KEY, withPre ? "on" : "off"); } catch (e) { /* ignore */ }
  }

  /* ------------------------------- menu --------------------------------- */
  function renderIdle() {
    running = false; finished = false; man = null;
    UI.setBanner("MANEUVERS", "#706fd3");
    $("conditionsLabel").textContent = "PHASE CHECK";
    $("conditions").textContent =
      "Pick the maneuver the evaluator asks for. Each one starts with the pre-maneuver flow, " +
      "then you fly it: conditions only — click the control, pick the setting.";
    $("stateLine").hidden = true;
    $("prompt").textContent = "";
    $("prompt").className = "prompt";
    UI.hideFeedback();
    UI.closePopover();
    Cockpit.clearHighlight();
    hideStepUI();
    $("debriefBox").hidden = true;
    $("manBox").hidden = true;
    $("manActions").hidden = true;
    $("beginManBtn").hidden = true;
    $("progressText").textContent = "";
    $("startBtn").hidden = true;
    $("restartBtn").hidden = true;
    buildMenu();
  }

  function buildMenu() {
    const box = $("manMenu");
    box.hidden = false;
    box.innerHTML = "";
    MANEUVERS.forEach((m) => {
      const b = document.createElement("button");
      b.className = "btn man-opt";
      b.innerHTML = `<span class="man-swatch" style="background:${m.color}"></span>${m.name}<em>${m.acs}</em>`;
      b.addEventListener("click", () => setup(m));
      box.appendChild(b);
    });
    const rnd = document.createElement("button");
    rnd.className = "btn primary man-random";
    rnd.textContent = "Surprise me";
    rnd.addEventListener("click", () => setup(MANEUVERS[Math.floor(Math.random() * MANEUVERS.length)]));
    box.appendChild(rnd);

    const lab = document.createElement("label");
    lab.className = "man-pre";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = withPre;
    cb.addEventListener("change", () => { withPre = cb.checked; savePre(); });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(" Include the pre-maneuver flow (height · area · checks · radio · clearing turns)"));
    box.appendChild(lab);

    const note = document.createElement("p");
    note.className = "man-note";
    note.textContent = "Simulated engine failure and the other checklists live in the Emergencies tab.";
    box.appendChild(note);
  }

  /* ---------------------------- setup card ------------------------------ */
  function setup(m) {
    man = m;
    steps = (withPre ? preManeuver(m.pre) : []).concat(m.steps);
    i = 0; running = false; finished = false;
    stats = { acts: 0, misses: 0, hints: 0, deductions: [], log: [] };

    $("manMenu").hidden = true;
    UI.setBanner(m.name.toUpperCase(), m.color);
    $("conditionsLabel").textContent = "BRIEFING · ACS " + m.acs;
    $("conditions").textContent = m.brief;
    $("stateLine").hidden = false;
    $("stateLine").textContent = m.state;
    $("prompt").textContent = "";
    $("debriefBox").hidden = true;
    $("manActions").hidden = true;
    $("beginManBtn").hidden = false;
    $("restartBtn").hidden = false;
    hideStepUI();
    resetLabels();
    Cockpit.setValues(m.values, false);
    renderStandards();
    renderLog();
    $("manBox").hidden = false;
    $("progressText").textContent = "";
  }

  function begin() {
    $("beginManBtn").hidden = true;
    $("stateLine").hidden = true;
    running = true;
    loadStep();
  }

  /* ------------------------------ a step -------------------------------- */
  function loadStep() {
    const s = steps[i];
    pending = s.anyOrder ? s.acts.map((_, k) => k) : [0];
    openAct = -1;
    Cockpit.clearHighlight();
    UI.closePopover();
    UI.hideFeedback();

    const ph = MANEUVER_PHASES[s.phase];
    $("conditionsLabel").innerHTML = `CONDITIONS · <span style="color:${ph.color}">${ph.name}</span>`;
    $("conditions").textContent = s.condition;
    setPrompt();
    $("hintBtn").hidden = false;
    $("hintBtn").textContent = "Show hint";
    $("hintBox").hidden = true;
    $("whyBox").hidden = true;
    $("progressText").textContent = `Step ${i + 1} of ${steps.length}`;
  }

  function setPrompt() {
    const s = steps[i];
    const n = s.acts.length;
    const left = s.anyOrder ? pending.length : n - pending[0];
    $("prompt").textContent = n === 1 ? "What do you do?"
      : s.anyOrder ? `What do you do? (${left} of ${n} left, any order)`
      : `What do you do? (${n} actions, in order${left < n ? ` — ${left} left` : ""})`;
  }

  /* --------------------------- cockpit clicks --------------------------- */
  function onCockpitClick(id) {
    if (!running || finished) return;
    const s = steps[i];
    const k = pending.find((p) => s.acts[p].target === id);
    if (k === undefined) {
      Cockpit.flash(id, false);
      stats.misses++;
      const why = pending.map((p) => s.acts[p].why && s.acts[p].why[id]).find(Boolean);
      if (why) return deduction(why);
      UI.feedback("✗ Not that one — try another control.", false);
      return;
    }
    UI.hideFeedback();
    openAct = k;
    const act = s.acts[k];
    const options = act.options || MAN_CONTROL_OPTIONS[id] || CONTROL_OPTIONS[id] || [];
    UI.openPopover(id, options, (opt, btn) => onValue(k, opt, btn), () => { openAct = -1; });
  }

  function onValue(k, opt, btn) {
    if (openAct !== k) return;
    const act = steps[i].acts[k];
    if (opt !== act.correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      stats.misses++;
      if (act.why && act.why[opt]) return deduction(act.why[opt]);
      UI.feedback("✗ Not the right setting.", false);
      return;
    }
    Cockpit.flash(act.target, true);
    if (SHOW_LABEL.has(act.target)) Cockpit.setControlLabel(act.target, shortLabel(act.target, opt));
    if (act.values) Cockpit.setValues(act.values, true);
    UI.closePopover();
    Cockpit.clearHighlight();
    $("whyBox").hidden = true;
    stats.acts++;
    stats.log.push(opt);
    renderLog();

    const s = steps[i];
    pending = s.anyOrder ? pending.filter((p) => p !== k) : (k + 1 < s.acts.length ? [k + 1] : []);
    if (pending.length) {
      UI.feedback("✓ " + opt, true);
      setPrompt();
      $("hintBtn").textContent = "Show hint";
      $("hintBox").hidden = true;
      return;
    }
    UI.feedback("✓ " + opt, true);
    i++;
    if (i < steps.length) setTimeout(() => { if (running) loadStep(); }, 450);
    else setTimeout(finish, 500);
  }

  // A classic write-up: say why, keep it on screen, and remember it.
  function deduction(text) {
    UI.hideFeedback();
    const box = $("whyBox");
    box.hidden = false;
    box.textContent = "✗ " + text;
    if (!stats.deductions.includes(text)) stats.deductions.push(text);
  }

  // switch faces are small; the windscreen strip is not
  function shortLabel(id, opt) {
    const t = opt.split(" — ")[0].split(" (")[0].replace(/"/g, "");
    const max = id === "outside" ? 60 : 17;
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /* -------------------------------- hint -------------------------------- */
  function showHint() {
    if (!running || finished) return;
    const s = steps[i];
    const box = $("hintBox");
    box.hidden = false;
    stats.hints++;
    if (openAct >= 0) {
      const act = s.acts[openAct];
      box.textContent = `Set the ${Cockpit.NAMES[act.target]} to: ${act.correct}`;
      UI.markPopoverOption(act.correct);
    } else {
      const names = pending.map((p) => Cockpit.NAMES[s.acts[p].target]);
      box.textContent = names.length > 1
        ? `Any of these, in any order: ${names.join(", ")}.`
        : `Click the ${names[0]}.`;
      Cockpit.highlight(pending.map((p) => s.acts[p].target));
    }
    $("hintBtn").textContent = "Hint shown";
  }

  /* ------------------------------ debrief ------------------------------- */
  function finish() {
    finished = true; running = false;
    Cockpit.clearHighlight();
    hideStepUI();
    UI.setBanner("MANEUVER COMPLETE", "#2ed573");
    $("conditionsLabel").textContent = "DEBRIEF";
    $("conditions").textContent = `${man.name} — done.`;
    $("prompt").textContent = "";
    $("progressText").textContent = "Complete";
    const clean = stats.misses === 0 && stats.hints === 0;
    const box = $("debriefBox");
    box.hidden = false;
    box.innerHTML =
      `<p class="debrief-title">${man.name}</p>` +
      `<p class="debrief-line">${stats.acts} actions · ${stats.misses} wrong click${stats.misses === 1 ? "" : "s"} · ` +
      `${stats.hints} hint${stats.hints === 1 ? "" : "s"}</p>` +
      (clean ? `<p class="debrief-line good">Flown clean — no hints, no misses.</p>` : "") +
      (stats.deductions.length
        ? `<p class="debrief-line warn">An evaluator would have noted:</p>` +
          stats.deductions.map((d) => `<p class="debrief-line warn">· ${d}</p>`).join("")
        : "") +
      `<p class="debrief-line">Standards: ${man.standards.join(" · ")}</p>`;
    $("manActions").hidden = false;
  }

  /* --------------------------- right column ----------------------------- */
  function renderStandards() {
    $("manStdTitle").textContent = `ACS ${man.acs} — STANDARDS`;
    const ul = $("manStandards");
    ul.innerHTML = "";
    man.standards.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function renderLog() {
    const ol = $("manLog");
    ol.innerHTML = "";
    (stats ? stats.log : []).forEach((t) => {
      const li = document.createElement("li");
      li.className = "done";
      li.textContent = t;
      ol.appendChild(li);
    });
    ol.scrollTop = ol.scrollHeight;
  }

  /* ------------------------------ plumbing ------------------------------ */
  function hideStepUI() {
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("whyBox").hidden = true;
  }

  function resetLabels() {
    SHOW_LABEL.forEach((id) => Cockpit.hasLabel(id) && Cockpit.setControlLabel(id, "—"));
  }

  function start() { /* the menu is the start */ }
  function restart() { renderIdle(); }

  function activate() {
    Cockpit.render($("cockpit"), "maneuver");
    Cockpit.onClick(onCockpitClick);
    Cockpit.setValues(MANEUVERS[0].values, false);
    $("minimapBox").hidden = true;
    $("goaroundBtn").hidden = true;
    $("goaroundHint").hidden = true;
    renderIdle();
  }

  function deactivate() {
    running = false; finished = true; man = null;
    UI.closePopover();
    hideStepUI();
    ["manMenu", "manBox", "manActions", "beginManBtn", "debriefBox", "stateLine"]
      .forEach((id) => { $(id).hidden = true; });
    $("conditionsLabel").textContent = "CONDITIONS";
  }

  function init() {
    $("beginManBtn").addEventListener("click", begin);
    $("manAgainBtn").addEventListener("click", () => setup(man));
    $("manMenuBtn").addEventListener("click", renderIdle);
  }

  return { init, activate, deactivate, start, restart, showHint };
})();

window.ManeuverDrill = ManeuverDrill;
