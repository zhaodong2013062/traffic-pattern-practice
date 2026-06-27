/* ============================================================================
   app.js  —  Decision-based trainer.

   Instead of being told exactly what to click, each step presents the
   SITUATION ("what's happening / about to happen") and asks the pilot to
   choose the correct action from a shuffled list. A "Show hint" button
   reveals the explanation and points at the relevant control(s).

     - Correct choice on a single-action step       -> instruments + airplane
                                                        animate, next step arms.
     - Correct choice on a compound step (checklist, -> a perform phase: the
       Power/Alt/Airspeed flow, GA climb)              pilot then actuates each
                                                        item IN ORDER (from
                                                        memory; hint highlights).
     - Wrong choice  -> red shake, try again.
     - Cockpit shortcut: clicking the correct control directly also counts.
     - Branch steps offer GO-AROUND.
   ========================================================================== */

(() => {
  const NAMES = {
    throttle: "THROTTLE", flaps: "FLAP SELECTOR", yoke: "YOKE", rudder: "RUDDER PEDALS",
    asi: "AIRSPEED", ai: "ATTITUDE", alt: "ALTIMETER", ti: "TURN COORD",
    hi: "HEADING", vsi: "VERT SPEED", tach: "TACHOMETER",
    "call-instruments": 'Say "Instruments green"', "call-airspeed": 'Say "Airspeed alive"',
    "call-goaround": 'Say "Going around"',
    seatbelt: "Seatbelts — secure", fuel: "Fuel selector — BOTH",
    mixture: "Mixture — RICH", autopilot: "Autopilot — OFF",
    "confirm-glidepath": "Confirm aim point", "confirm-threshold": "Confirm over threshold",
  };

  // pool of every action label, for generating plausible distractors
  const ALL_LABELS = [...new Set([...SEQUENCE, ...GOAROUND].map((s) => s.label))];

  const $ = (id) => document.getElementById(id);
  let steps = SEQUENCE.slice();
  let i = 0, sub = 0;
  let mode = "select";              // "select" | "perform"
  let foldOrder = [];               // shuffled target order for foldout flows
  let running = false, goneAround = false, finished = false;

  /* ------------------------------- setup -------------------------------- */
  function init() {
    Cockpit.render($("cockpit"));
    Minimap.render($("minimap"));
    Cockpit.onClick(onCockpitClick);

    $("startBtn").addEventListener("click", start);
    $("restartBtn").addEventListener("click", restart);
    $("goaroundBtn").addEventListener("click", triggerGoAround);
    $("hintBtn").addEventListener("click", showHint);

    Cockpit.setValues(SEQUENCE[0].values, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    renderIdle();
  }

  function renderIdle() {
    $("phaseBanner").textContent = "READY";
    $("phaseBanner").style.background = "#222";
    $("situation").textContent =
      "You'll fly the pattern from takeoff to touchdown. At each point, decide your next action.";
    $("quizQ").textContent = "Press Start to begin.";
    $("optionList").innerHTML = "";
    $("performBox").hidden = true;
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("goaroundBtn").hidden = true;
    $("foldout").classList.remove("open");
    $("progressText").textContent = "";
  }

  function start() {
    if (running) return;
    running = true; finished = false;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    i = 0; sub = 0;
    loadStep();
  }

  function restart() {
    steps = SEQUENCE.slice();
    running = false; goneAround = false; finished = false;
    i = 0; sub = 0; mode = "select";
    Cockpit.clearHighlight();
    Cockpit.setValues(SEQUENCE[0].values, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    Minimap.setLegActive(null);
    Minimap.showCondition("");
    $("startBtn").hidden = false;
    $("restartBtn").hidden = true;
    renderIdle();
  }

  /* ----------------------------- load a step ---------------------------- */
  function loadStep() {
    const s = steps[i];
    sub = 0; mode = "select"; finished = false;
    Cockpit.clearHighlight();

    const ph = PHASES[s.phase];
    $("phaseBanner").textContent = ph.name;
    $("phaseBanner").style.background = ph.color;

    $("situation").textContent = s.condition || "";
    $("quizQ").textContent = "What do you do now?";

    $("progressText").textContent =
      `Step ${i + 1} of ${steps.length}` + (goneAround ? " · GO-AROUND" : "");

    // reset hint + perform UI
    $("hintBtn").hidden = false;
    $("hintBtn").textContent = "Show hint";
    $("hintBox").hidden = true;
    $("hintBox").textContent = "";
    $("performBox").hidden = true;
    $("foldout").classList.remove("open");
    $("optionList").hidden = false;

    $("goaroundBtn").hidden = !(s.branch && !goneAround);

    Minimap.setLegActive(s.phase);
    Minimap.showCondition(s.condition || "");

    renderOptions(s);
  }

  function shuffle(a) {
    a = a.slice();
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  }

  function renderOptions(s) {
    const distractors = shuffle(ALL_LABELS.filter((l) => l !== s.label)).slice(0, 3);
    const opts = shuffle([s.label, ...distractors]);
    const list = $("optionList");
    list.innerHTML = "";
    opts.forEach((text) => {
      const b = document.createElement("button");
      b.className = "opt-btn";
      b.textContent = text;
      b.addEventListener("click", () => onOption(b, text));
      list.appendChild(b);
    });
  }

  /* --------------------------- option chosen ---------------------------- */
  function onOption(btn, text) {
    if (!running || finished || mode !== "select") return;
    const s = steps[i];
    if (text !== s.label) {
      btn.classList.add("wrong");
      btn.disabled = true;
      return;
    }
    // correct
    btn.classList.add("correct");
    [...$("optionList").children].forEach((b) => (b.disabled = true));
    Cockpit.clearHighlight();

    if (s.targets.length > 1) beginPerform(s);
    else completeStep();
  }

  /* ------------------- compound step: perform in order ------------------ */
  function beginPerform(s) {
    mode = "perform"; sub = 0;
    $("optionList").hidden = true;
    $("hintBtn").textContent = "Show hint";
    $("hintBox").hidden = true;

    if (s.kind === "foldout") {
      foldOrder = shuffle(s.targets);
      buildFoldout(s);
      $("foldout").classList.add("open");
      $("quizQ").textContent = "Run the flow — tap in the correct order:";
    } else {
      // control sequence on the panel
      $("performBox").hidden = false;
      $("performText").textContent = "Now actuate each item — in order — on the panel.";
      renderDots(s);
      $("quizQ").textContent = "Perform the sequence:";
    }
  }

  function renderDots(s) {
    const wrap = $("performDots");
    wrap.innerHTML = "";
    s.targets.forEach((_, idx) => {
      const d = document.createElement("span");
      d.className = "dot" + (idx < sub ? " on" : "");
      wrap.appendChild(d);
    });
  }

  function buildFoldout(s) {
    const wrap = $("foldoutBtns");
    wrap.innerHTML = "";
    $("foldoutTitle").textContent = "CHECKLIST FLOW";
    foldOrder.forEach((t) => {
      const b = document.createElement("button");
      b.className = "fold-btn";
      b.textContent = NAMES[t] || t;
      const pos = s.targets.indexOf(t);
      if (pos < sub) { b.classList.add("done"); b.disabled = true; }
      b.addEventListener("click", () => onFoldout(b, t));
      wrap.appendChild(b);
    });
  }

  /* ------------------------- cockpit interaction ------------------------ */
  function onCockpitClick(id) {
    if (!running || finished) return;
    const s = steps[i];

    if (mode === "select") {
      // shortcut: clicking the correct control IS choosing the right action,
      // but only for control-type steps.
      if (s.kind !== "control") { Cockpit.flash(id, false); return; }
      if (id !== s.targets[0]) { Cockpit.flash(id, false); return; }
      Cockpit.flash(id, true); Cockpit.markDone(id);
      // reflect the choice in the option list
      [...$("optionList").children].forEach((b) => {
        b.disabled = true;
        if (b.textContent === s.label) b.classList.add("correct");
      });
      if (s.targets.length > 1) { mode = "perform"; sub = 1; afterControlAdvance(s); }
      else completeStep();
      return;
    }

    // perform mode (control sequence)
    if (s.kind !== "control") return;
    const expected = s.targets[sub];
    if (id !== expected) { Cockpit.flash(id, false); return; }
    Cockpit.flash(id, true); Cockpit.markDone(id);
    sub++;
    afterControlAdvance(s);
  }

  function afterControlAdvance(s) {
    Cockpit.clearHighlight();
    if (sub >= s.targets.length) { completeStep(); return; }
    $("performBox").hidden = false;
    $("performText").textContent = "Now actuate each item — in order — on the panel.";
    renderDots(s);
  }

  function onFoldout(btn, id) {
    if (!running || finished || mode !== "perform") return;
    const s = steps[i];
    if (id !== s.targets[sub]) { shakeFoldout(); return; }
    btn.classList.add("done");
    btn.disabled = true;
    sub++;
    Cockpit.clearHighlight();
    if (sub >= s.targets.length) completeStep();
    else if ($("hintBox").hidden === false) buildFoldout(s); // refresh hint target
  }

  function shakeFoldout() {
    const f = $("foldout");
    f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
  }

  /* ------------------------------- hint --------------------------------- */
  function showHint() {
    const s = steps[i];
    const box = $("hintBox");
    box.hidden = false;
    box.textContent = s.description;

    if (mode === "select") {
      if (s.kind === "control") Cockpit.highlight(s.targets);
    } else {
      if (s.kind === "control") Cockpit.highlight([s.targets[sub]]);
      else {
        // mark the next correct checklist button
        [...$("foldoutBtns").children].forEach((b) => b.classList.remove("hint"));
        const want = NAMES[s.targets[sub]] || s.targets[sub];
        [...$("foldoutBtns").children].forEach((b) => {
          if (b.textContent === want) b.classList.add("hint");
        });
      }
    }
    $("hintBtn").textContent = "Hint shown";
  }

  /* --------------------------- complete + move -------------------------- */
  function completeStep() {
    finished = true;
    const s = steps[i];
    Cockpit.clearHighlight();
    $("foldout").classList.remove("open");
    $("goaroundBtn").hidden = true;
    $("hintBtn").hidden = true;
    $("performBox").hidden = true;

    Cockpit.setValues(s.values, true);
    Minimap.moveTo(s.pos, s.dwell, PHASES[s.phase].color, () => {
      i++;
      if (i >= steps.length) return finishRun();
      loadStep();
    });
  }

  function triggerGoAround() {
    if (!running || goneAround || finished) return;  // ignore mid-transit
    goneAround = true;
    steps = GOAROUND.slice();
    i = 0; sub = 0; mode = "select"; finished = false;
    $("goaroundBtn").hidden = true;
    loadStep();
  }

  function finishRun() {
    finished = true; running = false;
    Cockpit.clearHighlight();
    const banner = $("phaseBanner");
    banner.textContent = goneAround ? "GO-AROUND COMPLETE" : "TOUCHDOWN";
    banner.style.background = goneAround ? PHASES.GOAROUND.color : PHASES.LANDING.color;
    $("situation").textContent = goneAround
      ? "Going around — climb out and re-enter the pattern."
      : "Nice landing! Pattern complete.";
    $("quizQ").textContent = "Press Restart to fly it again.";
    $("optionList").innerHTML = "";
    $("optionList").hidden = false;
    $("performBox").hidden = true;
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("progressText").textContent = "Complete";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
