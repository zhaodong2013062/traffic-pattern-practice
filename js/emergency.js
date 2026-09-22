/* ============================================================================
   emergency.js  —  Controller for the EMERGENCY PROCEDURES drill.

   A session is a shuffled deck of the scenarios the pilot selected; each
   scenario is a checklist walked in strict QRH order through the same
   click-a-control / pick-a-value loop the pattern trainer uses.

   Shape of a run:
     SETUP CARD   the situation and the aircraft state, with a Begin button.
                  Nothing is armed until Begin — you are never dropped into
                  the middle of a checklist.
     THE DRILL    items in order; memory items closed-book (see below).
     HANDOFF      where the card points at another checklist, the drill can
                  roll straight on into it (engine failure -> forced landing)
                  and that scenario drops out of the rest of the deck.
     DEBRIEF      items, wrong clicks, and whether the memory items were flown
                  from memory or the checklist was opened.

   Items run in QRH order, except within a GROUP: consecutive items sharing a
   `g` are accepted in any order, because killing the fuel, the spark and the
   master is one action in the pilot's head rather than three ordered ones. All
   of a group must be done before the checklist moves on. A group is
   closed-book if ANY of its items is a memory item — half-hiding a group would
   reveal the rest of it.

   The rule that shapes the screen: MEMORY ITEMS ARE CLOSED-BOOK. While the
   current item is a memory item nothing ahead of it is shown and there is no
   hint — only "Read the checklist", which is recorded in the debrief.
   Reference items show their lines as you work them, the way you would have
   the QRH open in the airplane.

   API on window.EmergencyDrill: activate() / deactivate() / start() / restart()
   ========================================================================== */

const EmergencyDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "c172-emergency-selection";
  const IDLE_VALUES = { rpm: 1000, ias: 0, alt: 0, flaps: 0, vsi: 0, pitch: 0, bank: 0, hdg: 140 };

  let selected = null;            // Set of scenario ids
  let deck = [];                  // remaining scenario ids this session
  let loopOne = null;             // id when drilling a single scenario on repeat
  let sessionDone = 0;
  let results = [];               // per-scenario debrief rows
  let sessionFlown = [];          // scenario ids already flown this session

  let scen = null, ptr = 0, node = null;
  let pending = [], groupEnd = 0, openIdx = -1;   // the item(s) accepted right now
  let doneList = [];              // checklist lines completed THIS RUN
  let runIds = [], runTitles = [];  // scenario(s) flown this run (chained)
  let stats = null;
  let active = false, running = false, awaitingValue = false;
  let revealed = false, awaitingNext = false;

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
        saveSelection(); buildPicker();
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
          saveSelection(); buildPicker();
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
    $("startBtn").disabled = active && n === 0;   // nothing selected, nothing to fly
  }

  function openPicker() { buildPicker(); $("pickerOverlay").hidden = false; }
  function closePicker() {
    $("pickerOverlay").hidden = true;
    // a changed selection reshapes what is LEFT, it does not restart the run
    if (running) { deck = deck.filter((id) => selected.has(id)); syncProgress(); }
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
    beginSession();
  }

  function startLoop(id) {
    loopOne = id;
    deck = [id];
    beginSession();
  }

  function beginSession() {
    sessionDone = 0; results = []; sessionFlown = [];
    running = true;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    nextScenario();
  }

  function restart() {
    running = false; scen = null; node = null; awaitingNext = false;
    Cockpit.clearHighlight();
    UI.closePopover();
    $("startBtn").hidden = false;
    $("startBtn").disabled = !selected.size;
    $("restartBtn").hidden = true;
    renderIdle();
  }

  /* -------------------------- one scenario ------------------------------ */
  // The setup card: situation + aircraft state, nothing armed until "Begin".
  function nextScenario() {
    const id = deck.shift();
    if (!id) return finishSession();
    scen = EMERGENCIES.find((s) => s.id === id);
    ptr = 0; revealed = false; awaitingValue = false; awaitingNext = false;
    node = null; pending = []; groupEnd = 0; openIdx = -1;
    doneList = [];
    runIds = [scen.id]; runTitles = [scen.title];
    stats = {
      items: 0, misses: 0, revealedAt: null,
      memory: scen.nodes.filter((n) => n.t === "item" && n.memory).length,
    };

    // The banner stays generic while you fly: naming the group would answer
    // the first question the drill asks — which emergency is this? The
    // checklist is named in the debrief once it is done.
    UI.setBanner("EMERGENCY", "#c0392b");
    UI.hideFeedback();
    UI.closePopover();
    Cockpit.clearHighlight();
    Cockpit.setValues(scen.values, false);
    resetTileLabels();

    $("conditionsLabel").textContent = "SITUATION";
    $("conditions").textContent = scen.situation;
    $("stateLine").hidden = false;
    $("stateLine").textContent = scen.state || "";
    $("prompt").textContent = "";
    $("prompt").className = "prompt";
    hideActionButtons();
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("checklistNote").hidden = true;
    $("emergencyBox").hidden = true;      // no checklist until the drill arms
    $("beginBtn").hidden = false;
    syncProgress();
  }

  function beginScenario() {
    $("beginBtn").hidden = true;
    $("stateLine").hidden = true;
    $("emergencyBox").hidden = false;
    runNode();
  }

  function finishSession() {
    running = false; scen = null; node = null; awaitingNext = false;
    UI.setBanner("SESSION COMPLETE", "#2ed573");
    $("conditionsLabel").textContent = "DEBRIEF";
    $("conditions").textContent = results.length
      ? `${results.length} emergenc${results.length === 1 ? "y" : "ies"} flown.`
      : "Nothing flown.";
    $("stateLine").hidden = true;
    $("prompt").textContent = "";
    hideActionButtons();
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("nextBtn").hidden = true;
    $("beginBtn").hidden = true;
    $("startBtn").hidden = false;
    $("restartBtn").hidden = true;
    $("progressText").textContent = "";
    renderSessionDebrief();
  }

  /* ------------------------------- nodes -------------------------------- */
  // The indices accepted right now: a whole group, or a single item.
  function armFrom(i) {
    const n = scen.nodes[i];
    pending = [i];
    groupEnd = i + 1;
    if (!n.g) return;
    while (groupEnd < scen.nodes.length) {
      const m = scen.nodes[groupEnd];
      if (m.t !== "item" || m.g !== n.g) break;
      pending.push(groupEnd);
      groupEnd++;
    }
  }
  const pendingNodes = () => pending.map((i) => scen.nodes[i]);

  function runNode() {
    node = scen.nodes[ptr];
    if (!node) return endScenario();
    UI.closePopover();
    $("hintBox").hidden = true;
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    awaitingValue = false;
    openIdx = -1;

    if (node.t === "item") { armFrom(ptr); return runItem(); }
    if (node.t === "decision") return runDecision();
    if (node.t === "handoff") return runHandoff();
  }

  function runItem() {
    const closed = isClosedBook();
    const n = pending.length;
    const many = n > 1 ? `${n} actions, any order` : "what do you do?";
    $("prompt").textContent = (closed ? (n > 1 ? "Memory items — " : "Memory item — ") : "")
      + (closed || n > 1 ? many : "What do you do?");
    $("prompt").className = "prompt" + (closed ? " memory" : "");
    $("hintBtn").hidden = closed;
    $("hintBtn").textContent = "Show hint";
    $("revealBtn").hidden = !closed;
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
    renderChecklist();
  }

  // A pointer to another checklist. Where the card continues into one we
  // actually have (forced landing), offer to fly it rather than dead-end.
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

    // Offer to fly the checklist the card points at — unless this session has
    // already flown it, in which case repeating eleven identical items is just
    // busywork and the pointer alone is the lesson.
    const nextScen = node.continues && !sessionFlown.includes(node.continues) &&
      EMERGENCIES.find((s) => s.id === node.continues);
    if (nextScen) {
      const go = document.createElement("button");
      go.className = "btn primary";
      go.textContent = "Run that checklist";
      go.addEventListener("click", () => { markDone(node.line, "handoff"); chainInto(nextScen); });
      box.appendChild(go);
      const stop = document.createElement("button");
      stop.className = "btn ghost";
      stop.textContent = "Stop here";
      stop.addEventListener("click", () => { markDone(node.line, "handoff"); endScenario(); });
      box.appendChild(stop);
    } else {
      const b = document.createElement("button");
      b.className = "btn primary";
      b.textContent = "Continue";
      b.addEventListener("click", () => { markDone(node.line, "handoff"); advance(); });
      box.appendChild(b);
    }
    renderChecklist();
  }

  // Roll on into the checklist the card pointed at, keeping the same run: the
  // airplane state carries over untouched, and that scenario drops out of the
  // rest of the deck so the session does not fly it twice.
  function chainInto(next) {
    deck = deck.filter((id) => id !== next.id);
    scen = next; ptr = 0; revealed = false; awaitingValue = false;
    pending = []; groupEnd = 0; openIdx = -1;
    runIds.push(next.id); runTitles.push(next.title);
    stats.memory += next.nodes.filter((n) => n.t === "item" && n.memory).length;
    $("conditions").textContent = next.situation;
    syncProgress();
    runNode();
  }

  /* --------------------------- cockpit clicks --------------------------- */
  function onCockpitClick(id) {
    if (!running || !node || node.t !== "item") return;
    // any pending item may be actioned — that is what a group means
    const idx = pending.find((i) => scen.nodes[i].control === id);
    if (idx === undefined) {
      Cockpit.flash(id, false);
      stats.misses++;
      UI.feedback("✗ Not that one.", false);
      return;
    }
    UI.hideFeedback();
    awaitingValue = true;
    openIdx = idx;
    const target = scen.nodes[idx];
    const options = target.options || EMER_CONTROL_OPTIONS[target.control] || [];
    UI.openPopover(id, options, (opt, btn) => onValue(idx, opt, btn),
      () => { awaitingValue = false; openIdx = -1; });
  }

  function onValue(idx, opt, btn) {
    if (!awaitingValue) return;
    const done = scen.nodes[idx];
    if (opt !== done.correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      stats.misses++;
      UI.feedback("✗ Not that setting.", false);
      return;
    }
    Cockpit.flash(done.control, true);
    if (Cockpit.hasLabel(done.control)) Cockpit.setControlLabel(done.control, tileLabel(done.control, opt));
    if (done.values) Cockpit.setValues(done.values, true);
    UI.closePopover();
    awaitingValue = false; openIdx = -1;
    stats.items++;
    pending = pending.filter((i) => i !== idx);
    markDone(done.line, done.memory ? "memory" : "reference");
    showNote(done.note);

    if (pending.length) {                       // rest of the group still open
      UI.feedback(`✓ ${opt} · ${pending.length} to go`, true);
      runItem();
      return;
    }
    UI.feedback("✓ " + opt, true);
    if (done.goto) return jump(done.goto);
    ptr = groupEnd;
    runNode();
  }

  // Switch faces are small; the windscreen strip and the placards are not.
  const WIDE_FACES = new Set(["outside", "action", "allswitches", "breakers"]);
  function tileLabel(id, opt) {
    const t = opt.split(" (")[0].split(" — ")[0];
    const max = WIDE_FACES.has(id) ? 30 : 17;
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /* --------------------------- flow control ----------------------------- */
  // only decisions and handoffs land here now; items advance in onValue
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
    awaitingNext = true;
    sessionDone++;
    sessionFlown.push(...runIds);
    results.push({
      title: runTitles.join(" → "),
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
      if (loopOne && !deck.length) deck = [loopOne];
      nextScenario();
    };
  }

  /* ------------------------------ debrief ------------------------------- */
  function renderScenarioDebrief() {
    const r = results[results.length - 1];
    const box = $("debriefBox");
    box.hidden = false;
    const grp = EMERGENCY_GROUPS[scen.group];
    UI.setBanner("CHECKLIST COMPLETE", grp.color);
    const flown = r.memory === 0
      ? "reference checklist"
      : r.revealedAt
        ? `checklist opened at “${r.revealedAt}”`
        : `${r.memory} memory item${r.memory === 1 ? "" : "s"} flown from memory`;
    box.innerHTML =
      `<p class="debrief-title">${r.title}</p>` +
      `<p class="debrief-line">${r.items} item${r.items === 1 ? "" : "s"} · ` +
      `${r.misses} wrong click${r.misses === 1 ? "" : "s"}</p>` +
      `<p class="debrief-line ${r.revealedAt ? "warn" : "good"}">${flown}</p>`;
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
    doneList.push({ line, kind });
    renderChecklist();
  }

  // A group is closed-book if ANY of its items is a memory item: showing the
  // reference half of a group would give away the memory half sitting with it.
  function isClosedBook() {
    if (revealed || !node || node.t !== "item") return false;
    return pendingNodes().some((n) => n.memory);
  }

  function renderChecklist(complete = false) {
    const list = $("checklist");
    list.innerHTML = "";
    doneList.forEach((d) => {
      const li = document.createElement("li");
      li.className = "done " + d.kind;
      li.textContent = d.line;
      list.appendChild(li);
    });

    if (complete) return;

    // Ahead of the cursor: hidden while the current item is closed-book,
    // otherwise shown greyed so reference items read like the card.
    if (isClosedBook()) {
      const li = document.createElement("li");
      li.className = "hidden-item";
      li.textContent = "memory items — closed book";
      list.appendChild(li);
      return;
    }
    let taggedGroup = null;
    for (let i = ptr; i < scen.nodes.length; i++) {
      const n = scen.nodes[i];
      if (n.t === "decision") continue;
      if (i < groupEnd && !pending.includes(i)) continue;   // already actioned
      // head the group with its "any order" tag
      if (n.t === "item" && n.g && n.g !== taggedGroup) {
        taggedGroup = n.g;
        const tag = document.createElement("li");
        tag.className = "group-tag";
        tag.textContent = `any order — ${n.g}`;
        list.appendChild(tag);
      } else if (!(n.t === "item" && n.g)) {
        taggedGroup = null;
      }
      const li = document.createElement("li");
      li.className = "ahead" + (pending.includes(i) ? " current" : "") +
        (n.t === "item" && n.g ? " grouped" : "");
      li.textContent = n.line;
      list.appendChild(li);
    }
  }

  // Notes belong to the item just completed; clear when the next item has none.
  function showNote(text) {
    const n = $("checklistNote");
    n.hidden = !text;
    n.textContent = text || "";
  }

  /* -------------------------------- hint -------------------------------- */
  function showHint() {
    if (!node || node.t !== "item") return;
    const box = $("hintBox");
    box.hidden = false;
    if (awaitingValue && openIdx >= 0) {
      const open = scen.nodes[openIdx];
      box.textContent = `Set the ${Cockpit.NAMES[open.control]} to: ${open.correct}`;
      UI.markPopoverOption(open.correct);
    } else {
      const names = pendingNodes().map((n) => Cockpit.NAMES[n.control]);
      box.textContent = names.length > 1
        ? `Any of these, in any order: ${names.join(", ")}.`
        : `Click the ${names[0]}.`;
      Cockpit.highlight(pendingNodes().map((n) => n.control));
    }
    $("hintBtn").textContent = "Hint shown";
  }

  function revealChecklist() {
    if (!node) return;
    revealed = true;
    if (!stats.revealedAt) stats.revealedAt = (pendingNodes()[0] || node).line || "the checklist";
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

  // The deck can grow (a chain removes one) or shrink (the picker), so the
  // total is recomputed rather than remembered.
  function syncProgress() {
    if (!running) { $("progressText").textContent = ""; return; }
    const pending = awaitingNext ? 0 : 1;
    const total = sessionDone + deck.length + pending;
    $("progressText").textContent = `Emergency ${sessionDone + pending} of ${total}`;
  }

  function renderIdle() {
    UI.setBanner("EMERGENCIES", "#c0392b");
    $("conditionsLabel").textContent = "BRIEFING";
    $("conditions").textContent =
      "Random emergencies, one at a time. You get the situation and nothing else — " +
      "work the checklist in order. Memory items are closed-book.";
    $("stateLine").hidden = true;
    $("prompt").textContent = "";
    $("prompt").className = "prompt";
    hideActionButtons();
    UI.hideFeedback();
    UI.closePopover();
    Cockpit.setValues(IDLE_VALUES, false);
    resetTileLabels();
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("beginBtn").hidden = true;
    $("emergencyBox").hidden = true;
    $("checklistNote").hidden = true;
    $("progressText").textContent = "";
    doneList = [];
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
    $("restartBtn").hidden = true;
    running = false; scen = null; node = null; awaitingNext = false;
    syncPickerCount();
    renderIdle();
  }

  function deactivate() {
    active = false; running = false; scen = null; node = null; awaitingNext = false;
    UI.closePopover();
    $("scenarioBtn").hidden = true;
    $("pickerOverlay").hidden = true;
    $("emergencyBox").hidden = true;
    $("decisionBox").hidden = true;
    $("handoffBox").hidden = true;
    $("debriefBox").hidden = true;
    $("nextBtn").hidden = true;
    $("beginBtn").hidden = true;
    $("stateLine").hidden = true;
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
    });
    $("pickNone").addEventListener("click", () => {
      selected = new Set(); saveSelection(); buildPicker();
    });
    $("revealBtn").addEventListener("click", revealChecklist);
    $("beginBtn").addEventListener("click", beginScenario);
  }

  return { activate, deactivate, start, restart, init, showHint,
           isRunning: () => running };
})();

window.EmergencyDrill = EmergencyDrill;
