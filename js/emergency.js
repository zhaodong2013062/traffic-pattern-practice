/* ============================================================================
   emergency.js  —  Controller for the EMERGENCY PROCEDURES drill.

   A session is a shuffled deck of the scenarios the pilot selected; each
   scenario is a checklist walked in strict QRH order through the same
   click-a-control / pick-a-value loop the pattern trainer uses.

   The one rule that shapes the whole screen: MEMORY ITEMS ARE CLOSED-BOOK.
   While the current item is a memory item nothing ahead of it is shown and
   there is no hint — only a "Read the checklist" button, which opens the card
   and is recorded in the debrief. Reference items show their lines as you
   work them, the way you would have the QRH open in the airplane.

   API on window.EmergencyDrill: activate() / deactivate() / start() / restart()
   ========================================================================== */

const EmergencyDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "c172-emergency-selection";

  let selected = null;            // Set of scenario ids
  let deck = [];                  // remaining scenario ids this session
  let loopOne = null;             // id when drilling a single scenario on repeat
  let sessionTotal = 0, sessionDone = 0;
  let results = [];               // per-scenario debrief rows

  let scen = null, ptr = 0, node = null;
  let stats = null;
  let active = false, running = false, awaitingValue = false, revealed = false;

  /* ---------------------------- selection ------------------------------- */
  function allIds() { return EMERGENCIES.map((s) => s.id); }

  function loadSelection() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const ids = JSON.parse(raw).filter((id) => EMERGENCIES.some((s) => s.id === id));
        if (ids.length) return new Set(ids);
      }
    } catch (e) { /* private mode / disabled storage — fall through to all */ }
    return new Set(allIds());
  }
  function saveSelection() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...selected])); } catch (e) { /* ignore */ }
  }

  /* ------------------------------ picker -------------------------------- */
  function buildPicker() {
    const wrap = $("pickerGroups");
    wrap.innerHTML = "";
    Object.entries(EMERGENCY_GROUPS).forEach(([key, grp]) => {
      const list = EMERGENCIES.filter((s) => s.group === key);
      if (!list.length) return;
      const box = document.createElement("div");
      box.className = "picker-group";

      const head = document.createElement("label");
      head.className = "picker-head-row";
      const all = document.createElement("input");
      all.type = "checkbox";
      all.checked = list.every((s) => selected.has(s.id));
      all.addEventListener("change", () => {
        list.forEach((s) => (all.checked ? selected.add(s.id) : selected.delete(s.id)));
        saveSelection(); buildPicker(); syncPickerCount();
      });
      head.appendChild(all);
      const title = document.createElement("span");
      title.textContent = grp.name;
      title.style.color = grp.color;
      head.appendChild(title);
      box.appendChild(head);

      list.forEach((s) => {
        const memCount = s.nodes.filter((n) => n.t === "item" && n.memory).length;
        const row = document.createElement("div");
        row.className = "picker-row";
        const lab = document.createElement("label");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = selected.has(s.id);
        cb.addEventListener("change", () => {
          cb.checked ? selected.add(s.id) : selected.delete(s.id);
          saveSelection(); buildPicker(); syncPickerCount();
        });
        lab.appendChild(cb);
        const name = document.createElement("span");
        name.innerHTML = `${s.title}<em>${memCount ? memCount + " memory items" : "reference only"}</em>`;
        lab.appendChild(name);
        row.appendChild(lab);

        const only = document.createElement("button");
        only.className = "btn small ghost";
        only.textContent = "Drill this one";
        only.addEventListener("click", () => { closePicker(); startLoop(s.id); });
        row.appendChild(only);
        box.appendChild(row);
      });
      wrap.appendChild(box);
    });
    syncPickerCount();
  }

  function syncPickerCount() {
    const n = selected.size, total = EMERGENCIES.length;
    $("pickCount").textContent = `${n} of ${total} selected`;
    $("scenarioBtn").textContent = `Scenarios · ${n} of ${total}`;
    // nothing selected -> nothing to fly
    $("startBtn").disabled = active && n === 0;
  }

  function openPicker() { buildPicker(); $("pickerOverlay").hidden = false; }
  function closePicker() {
    $("pickerOverlay").hidden = true;
    // a changed selection reshuffles what is LEFT, it does not restart the run
    if (running) {
      deck = deck.filter((id) => selected.has(id));
      sessionTotal = sessionDone + deck.length + (scen ? 1 : 0);
      syncProgress();
    }
  }

  /* ------------------------------ session ------------------------------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function start() {
    if (!selected.size) return;
    loopOne = null;
    deck = shuffle([...selected]);
    sessionTotal = deck.length; sessionDone = 0; results = [];
    running = true;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    nextScenario();
  }

  function startLoop(id) {
    loopOne = id;
    deck = [id];
    sessionTotal = 1; sessionDone = 0; results = [];
    running = true;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    nextScenario();
  }

  function restart() {
    running = false; scen = null; node = null;
    Cockpit.clearHighlight();
    UI.closePopover();
    $("startBtn").hidden = false;
    $("startBtn").disabled = !selected.size;
    $("restartBtn").hidden = true;
    renderIdle();
  }

  function nextScenario() {
    const id = deck.shift();
    if (!id) return finishSession();
    scen = EMERGENCIES.find((s) => s.id === id);
    ptr = 0; revealed = false; awaitingValue = false;
    stats = { items: 0, misses: 0, revealedAt: null, memory: scen.nodes.filter((n) => n.t === "item" && n.memory).length };

    const grp = EMERGENCY_GROUPS[scen.group];
    UI.setBanner(grp.name, grp.color);
    Cockpit.clearHighlight();
    Cockpit.setValues(scen.values, false);
    resetTileLabels();

    $("conditionsLabel").textContent = "SITUATION";
    $("conditions").textContent = scen.situation;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("emergencyBox").hidden = false;
    renderChecklist();
    syncProgress();
    runNode();
  }

  function finishSession() {
    running = false; scen = null; node = null;
    UI.setBanner("SESSION COMPLETE", "#2ed573");
    $("conditionsLabel").textContent = "DEBRIEF";
    $("conditions").textContent = results.length
      ? `${results.length} emergenc${results.length === 1 ? "y" : "ies"} flown.`
      : "Nothing flown.";
    $("prompt").textContent = "";
    hideActionButtons();
    $("decisionBox").hidden = true;
    $("nextBtn").hidden = true;
    $("startBtn").hidden = false;
    $("restartBtn").hidden = true;
    renderSessionDebrief();
  }

  /* ------------------------------- nodes -------------------------------- */
  function runNode() {
    node = scen.nodes[ptr];
    if (!node) return endScenario();
    UI.hideFeedback();
    UI.closePopover();
    $("hintBox").hidden = true;
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    awaitingValue = false;

    if (node.t === "item") return runItem();
    if (node.t === "decision") return runDecision();
    if (node.t === "handoff") return runHandoff();
  }

  function runItem() {
    $("prompt").textContent = isClosedBook()
      ? "Memory item — what do you do?"
      : "What do you do?";
    $("prompt").className = "prompt" + (isClosedBook() ? " memory" : "");
    $("hintBtn").hidden = isClosedBook();
    $("hintBtn").textContent = "Show hint";
    $("revealBtn").hidden = !isClosedBook();
    renderChecklist();
  }

  function runDecision() {
    $("prompt").textContent = "Decision.";
    $("prompt").className = "prompt";
    hideActionButtons();
    const box = $("decisionBox");
    box.hidden = false;
    box.innerHTML = "";
    const q = document.createElement("p");
    q.className = "decision-q";
    q.textContent = node.prompt;
    box.appendChild(q);
    node.options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "btn decision-opt";
      b.textContent = opt.label;
      b.addEventListener("click", () => {
        if (!opt.correct && node.options.some((o) => o.correct)) {
          b.classList.add("wrong");
          b.disabled = true;
          stats.misses++;
          UI.feedback("✗ That is not what this situation calls for.", false);
          return;
        }
        UI.feedback("✓ " + opt.label, true);
        jump(opt.goto);
      });
      box.appendChild(b);
    });
  }

  function runHandoff() {
    $("prompt").textContent = "";
    hideActionButtons();
    const box = $("handoffBox");
    box.hidden = false;
    box.innerHTML = "";
    const t = document.createElement("p");
    t.className = "handoff-line";
    t.textContent = node.line;
    box.appendChild(t);
    const p = document.createElement("p");
    p.className = "handoff-text";
    p.textContent = node.text;
    box.appendChild(p);
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = "Continue";
    b.addEventListener("click", () => { markDone(node.line, "handoff"); advance(); });
    box.appendChild(b);
    renderChecklist();
  }

  /* --------------------------- cockpit clicks --------------------------- */
  function onCockpitClick(id) {
    if (!running || !node || node.t !== "item") return;
    if (id !== node.control) {
      Cockpit.flash(id, false);
      stats.misses++;
      UI.feedback("✗ Not that one.", false);
      return;
    }
    UI.hideFeedback();
    awaitingValue = true;
    const options = node.options || EMER_CONTROL_OPTIONS[node.control] || [];
    UI.openPopover(id, options, onValue, () => { awaitingValue = false; });
  }

  function onValue(opt, btn) {
    if (!awaitingValue || !node) return;
    if (opt !== node.correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      stats.misses++;
      UI.feedback("✗ Not that setting.", false);
      return;
    }
    Cockpit.flash(node.control, true);
    if (Cockpit.hasLabel(node.control)) Cockpit.setControlLabel(node.control, tileLabel(opt));
    if (node.values) Cockpit.setValues(node.values, true);
    UI.closePopover();
    UI.feedback("✓ " + opt, true);
    stats.items++;
    markDone(node.line, node.memory ? "memory" : "reference");
    if (node.note) showNote(node.note);
    advance();
  }

  function tileLabel(opt) {
    const t = opt.split(" (")[0].split(" — ")[0];
    return t.length > 17 ? t.slice(0, 16) + "…" : t;
  }

  /* --------------------------- flow control ----------------------------- */
  function advance() {
    if (node && node.goto) return jump(node.goto);
    ptr++;
    runNode();
  }
  function jump(label) {
    if (label === "end") return endScenario();
    const i = scen.nodes.findIndex((n) => n.label === label);
    ptr = i < 0 ? scen.nodes.length : i;
    runNode();
  }

  function endScenario() {
    node = null;
    sessionDone++;
    results.push({
      title: scen.title, card: scen.card,
      items: stats.items, misses: stats.misses,
      memory: stats.memory, revealedAt: stats.revealedAt,
    });
    UI.setBanner("CHECKLIST COMPLETE", "#2ed573");
    $("prompt").textContent = "";
    hideActionButtons();
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    renderChecklist(true);
    renderScenarioDebrief();
    syncProgress();

    const more = deck.length > 0 || loopOne;
    $("nextBtn").hidden = false;
    $("nextBtn").textContent = more ? "Next emergency" : "Finish session";
    $("nextBtn").onclick = () => {
      $("nextBtn").hidden = true;
      if (loopOne) { deck = [loopOne]; sessionTotal++; }
      nextScenario();
    };
  }

  /* ------------------------------ debrief ------------------------------- */
  function renderScenarioDebrief() {
    const box = $("debriefBox");
    box.hidden = false;
    const flown = stats.memory === 0
      ? "reference checklist"
      : stats.revealedAt
        ? `checklist opened at “${stats.revealedAt}”`
        : `${stats.memory} memory item${stats.memory === 1 ? "" : "s"} flown from memory`;
    box.innerHTML =
      `<p class="debrief-title">${scen.title}</p>` +
      `<p class="debrief-line">${stats.items} item${stats.items === 1 ? "" : "s"} · ` +
      `${stats.misses} wrong click${stats.misses === 1 ? "" : "s"}</p>` +
      `<p class="debrief-line ${stats.revealedAt ? "warn" : "good"}">${flown}</p>`;
  }

  function renderSessionDebrief() {
    const box = $("debriefBox");
    box.hidden = false;
    const rows = results.map((r) => {
      const memo = r.memory === 0 ? "reference"
        : r.revealedAt ? "checklist opened" : "from memory";
      const cls = r.misses === 0 && !r.revealedAt ? "good" : "warn";
      return `<p class="debrief-line ${cls}">${r.title} — ${r.misses} miss${r.misses === 1 ? "" : "es"} · ${memo}</p>`;
    }).join("");
    const misses = results.reduce((n, r) => n + r.misses, 0);
    box.innerHTML = `<p class="debrief-title">Session debrief — ${misses} wrong click${misses === 1 ? "" : "s"}</p>` + rows;
    $("emergencyBox").hidden = true;
  }

  /* --------------------------- checklist card --------------------------- */
  function markDone(line, kind) {
    if (!scen._done) scen._done = [];
    scen._done.push({ line, kind });
    renderChecklist();
  }

  function isClosedBook() { return node && node.t === "item" && node.memory && !revealed; }

  function renderChecklist(complete = false) {
    const list = $("checklist");
    list.innerHTML = "";
    const done = scen._done || [];
    done.forEach((d) => {
      const li = document.createElement("li");
      li.className = "done " + d.kind;
      li.textContent = d.line;
      list.appendChild(li);
    });

    if (complete) { $("checklistNote").hidden = true; return; }

    // Ahead of the cursor: hidden while the current item is closed-book,
    // otherwise shown greyed so reference items read like the card.
    if (isClosedBook()) {
      const li = document.createElement("li");
      li.className = "hidden-item";
      li.textContent = "memory items — closed book";
      list.appendChild(li);
      return;
    }
    scen.nodes.slice(ptr).forEach((n) => {
      if (n.t === "decision") return;
      const li = document.createElement("li");
      li.className = "ahead" + (n === node ? " current" : "");
      li.textContent = n.line;
      list.appendChild(li);
    });
  }

  function showNote(text) {
    const n = $("checklistNote");
    n.hidden = false;
    n.textContent = text;
  }

  /* -------------------------------- hint -------------------------------- */
  function showHint() {
    if (!node || node.t !== "item") return;
    const box = $("hintBox");
    box.hidden = false;
    if (awaitingValue) {
      box.textContent = `Set the ${Cockpit.NAMES[node.control]} to: ${node.correct}`;
      UI.markPopoverOption(node.correct);
    } else {
      box.textContent = `Click the ${Cockpit.NAMES[node.control]}.`;
      Cockpit.highlight([node.control]);
    }
    $("hintBtn").textContent = "Hint shown";
  }

  function revealChecklist() {
    if (!node) return;
    revealed = true;
    if (!stats.revealedAt) stats.revealedAt = node.line || "the checklist";
    $("revealBtn").hidden = true;
    $("hintBtn").hidden = false;
    renderChecklist();
    UI.feedback("Checklist open — this is recorded in the debrief.", false);
  }

  /* ------------------------------ plumbing ------------------------------ */
  function hideActionButtons() {
    $("hintBtn").hidden = true;
    $("revealBtn").hidden = true;
    $("hintBox").hidden = true;
  }

  function resetTileLabels() {
    Object.keys(Cockpit.NAMES).forEach((id) => {
      if (Cockpit.hasLabel(id)) Cockpit.setControlLabel(id, "—");
    });
  }

  function syncProgress() {
    $("progressText").textContent = running
      ? `Emergency ${Math.min(sessionDone + 1, sessionTotal)} of ${sessionTotal}`
      : "";
  }

  function renderIdle() {
    UI.setBanner("EMERGENCIES", "#c0392b");
    $("conditionsLabel").textContent = "BRIEFING";
    $("conditions").textContent =
      "Random emergencies, one at a time. You get the situation and nothing else — " +
      "work the checklist in order. Memory items are closed-book.";
    $("prompt").textContent = "";
    $("prompt").className = "prompt";
    hideActionButtons();
    UI.hideFeedback();
    UI.closePopover();
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("emergencyBox").hidden = true;
    $("progressText").textContent = "";
    EMERGENCIES.forEach((s) => { s._done = []; });
  }

  /* ---------------------------- activation ------------------------------ */
  function activate() {
    active = true;
    if (!selected) selected = loadSelection();
    Cockpit.render($("cockpit"), "emergency");
    Cockpit.onClick(onCockpitClick);
    $("minimapBox").hidden = true;
    $("goaroundBtn").hidden = true;
    $("goaroundHint").hidden = true;
    $("scenarioBtn").hidden = false;
    $("startBtn").hidden = false;
    $("startBtn").disabled = !selected.size;
    $("restartBtn").hidden = true;
    running = false; scen = null; node = null;
    syncPickerCount();
    renderIdle();
  }

  function deactivate() {
    active = false; running = false; scen = null; node = null;
    UI.closePopover();
    $("scenarioBtn").hidden = true;
    $("pickerOverlay").hidden = true;
    $("emergencyBox").hidden = true;
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("startBtn").disabled = false;
    $("conditionsLabel").textContent = "CONDITIONS";
  }

  function init() {
    $("scenarioBtn").addEventListener("click", openPicker);
    $("pickerClose").addEventListener("click", closePicker);
    $("pickerOverlay").addEventListener("click", (e) => {
      if (e.target === $("pickerOverlay")) closePicker();
    });
    $("pickAll").addEventListener("click", () => {
      selected = new Set(allIds()); saveSelection(); buildPicker();
      $("startBtn").disabled = false;
    });
    $("pickNone").addEventListener("click", () => {
      selected = new Set(); saveSelection(); buildPicker();
    });
    $("revealBtn").addEventListener("click", revealChecklist);
  }

  return { activate, deactivate, start, restart, init, showHint,
           isRunning: () => running };
})();

window.EmergencyDrill = EmergencyDrill;
