/* ============================================================================
   app.js  —  State machine wiring the cockpit, minimap and UI together.

   Flow:
     - A step highlights one or more cockpit targets (in order for compound
       steps). The pilot actuates them.
     - Correct actuation -> green pulse; when every target in the step is done
       the instruments animate to the new values and the airplane travels to
       the next point on the minimap (semi real-time). The next step then arms
       automatically.
     - Wrong actuation -> red shake, no progress.
     - At branch steps a GO-AROUND option appears.
   ========================================================================== */

(() => {
  /* friendly names for the action card / instructions */
  const NAMES = {
    throttle: "THROTTLE", flaps: "FLAP SELECTOR", yoke: "YOKE", rudder: "RUDDER PEDALS",
    asi: "AIRSPEED", ai: "ATTITUDE", alt: "ALTIMETER", ti: "TURN COORD",
    hi: "HEADING", vsi: "VERT SPEED", tach: "TACHOMETER",
    "call-instruments": 'Say "Instruments green"', "call-airspeed": 'Say "Airspeed alive"',
    "call-goaround": 'Say "Going around"',
    seatbelt: "Seatbelts — secure", fuel: "Fuel selector — BOTH",
    mixture: "Mixture — RICH", autopilot: "Autopilot — OFF",
    "confirm-glidepath": "Confirm: aim point stationary", "confirm-threshold": "Confirm: over the threshold",
  };

  // DOM refs
  const $ = (id) => document.getElementById(id);
  let steps = SEQUENCE.slice();
  let i = 0, sub = 0;
  let running = false, goneAround = false, finished = false;

  function init() {
    Cockpit.render($("cockpit"));
    Minimap.render($("minimap"));
    Cockpit.onClick(handleTarget);

    $("startBtn").addEventListener("click", start);
    $("restartBtn").addEventListener("click", restart);
    $("goaroundBtn").addEventListener("click", triggerGoAround);

    // prime instruments to the first step's starting values
    Cockpit.setValues(SEQUENCE[0].values, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    renderIdle();
  }

  function renderIdle() {
    $("phaseBanner").textContent = "READY";
    $("phaseBanner").style.background = "#222";
    $("cardLabel").textContent = "Press Start to begin the pattern";
    $("cardDesc").textContent =
      "You'll fly from takeoff roll to touchdown. Actuate the highlighted control to advance.";
    $("cardCond").textContent = "";
    $("calloutBubble").hidden = true;
    $("todo").innerHTML = "";
    $("foldout").classList.remove("open");
    $("progressText").textContent = "";
    $("goaroundBtn").hidden = true;
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
    i = 0; sub = 0;
    Cockpit.clearHighlight();
    Cockpit.setValues(SEQUENCE[0].values, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    Minimap.setLegActive(null);
    Minimap.showCondition("");
    $("startBtn").hidden = false;
    $("restartBtn").hidden = true;
    renderIdle();
  }

  function loadStep() {
    const s = steps[i];
    sub = 0;
    finished = false;

    // phase banner
    const ph = PHASES[s.phase];
    const banner = $("phaseBanner");
    banner.textContent = ph.name;
    banner.style.background = ph.color;

    // action card
    $("cardLabel").textContent = s.label;
    $("cardDesc").textContent = s.description;
    $("cardCond").textContent = s.condition || "";

    // callout
    const bubble = $("calloutBubble");
    if (s.callout) { bubble.hidden = false; bubble.textContent = "“" + s.callout + "”"; }
    else bubble.hidden = true;

    // progress
    $("progressText").textContent =
      `Step ${i + 1} of ${steps.length}` + (goneAround ? " · GO-AROUND" : "");

    // go-around offer
    $("goaroundBtn").hidden = !(s.branch && !goneAround);

    // minimap leg
    Minimap.setLegActive(s.phase);
    Minimap.showCondition(s.condition || "");

    renderTodo();
    armTargets();
  }

  function renderTodo() {
    const s = steps[i];
    const ul = $("todo");
    ul.innerHTML = "";
    s.targets.forEach((t, idx) => {
      const li = document.createElement("li");
      li.textContent = NAMES[t] || t;
      if (idx < sub) li.className = "done";
      else if (idx === sub) li.className = "current";
      ul.appendChild(li);
    });
  }

  /* arm whichever input the current sub-target needs */
  function armTargets() {
    const s = steps[i];
    const target = s.targets[sub];
    Cockpit.clearHighlight();
    const fold = $("foldout");

    if (s.kind === "control") {
      Cockpit.highlight([target]);
      fold.classList.remove("open");
      $("minimapConfirm").hidden = true;
    } else if (s.kind === "foldout") {
      buildFoldout(s);
      fold.classList.add("open");
      $("minimapConfirm").hidden = true;
    } else if (s.kind === "minimap") {
      fold.classList.remove("open");
      const btn = $("minimapConfirm");
      btn.hidden = false;
      btn.textContent = (NAMES[target] || "Confirm") + "  ✓";
      btn.onclick = () => handleTarget(target);
    }
  }

  function buildFoldout(s) {
    const wrap = $("foldoutBtns");
    wrap.innerHTML = "";
    $("foldoutTitle").textContent = s.callout ? "VERBALIZE" : "CHECKLIST FLOW";
    s.targets.forEach((t, idx) => {
      const b = document.createElement("button");
      b.className = "fold-btn";
      b.textContent = NAMES[t] || t;
      if (idx < sub) b.classList.add("done");
      else if (idx === sub) b.classList.add("current");
      else b.disabled = true;
      b.addEventListener("click", () => handleTarget(t));
      wrap.appendChild(b);
    });
  }

  /* central input handler — every click (cockpit, foldout, minimap) lands here */
  function handleTarget(id) {
    if (!running || finished) return;
    const s = steps[i];
    const expected = s.targets[sub];

    if (id !== expected) {
      if (s.kind === "control") Cockpit.flash(id, false);
      else shakeFoldout();
      return;
    }

    // correct
    if (s.kind === "control") { Cockpit.flash(id, true); Cockpit.markDone(id); }
    sub++;

    if (sub < s.targets.length) {
      // more sub-targets in this compound step
      renderTodo();
      if (s.kind === "foldout") buildFoldout(s);
      armTargets();
      return;
    }

    completeStep();
  }

  function shakeFoldout() {
    const f = $("foldout");
    f.classList.remove("shake");
    void f.offsetWidth;
    f.classList.add("shake");
  }

  function completeStep() {
    finished = true;
    const s = steps[i];
    Cockpit.clearHighlight();
    $("foldout").classList.remove("open");
    $("minimapConfirm").hidden = true;
    $("goaroundBtn").hidden = true;

    // animate instruments + airplane (semi real-time), then arm next step
    Cockpit.setValues(s.values, true);
    const color = PHASES[s.phase].color;
    Minimap.moveTo(s.pos, s.dwell, color, () => {
      i++;
      if (i >= steps.length) return finishRun();
      loadStep();
    });
  }

  function triggerGoAround() {
    if (!running || goneAround) return;
    goneAround = true;
    // keep current instrument/airplane state, switch the remainder to the GA flow
    steps = GOAROUND.slice();
    i = 0; sub = 0;
    finished = false;
    $("goaroundBtn").hidden = true;
    loadStep();
  }

  function finishRun() {
    finished = true; running = false;
    Cockpit.clearHighlight();
    const banner = $("phaseBanner");
    const done = goneAround ? "GO-AROUND COMPLETE" : "TOUCHDOWN";
    banner.textContent = done;
    banner.style.background = goneAround ? PHASES.GOAROUND.color : PHASES.LANDING.color;
    $("cardLabel").textContent = goneAround
      ? "Going around — climb out and re-enter the pattern."
      : "Nice landing! Pattern complete.";
    $("cardDesc").textContent = "Press Restart to fly it again.";
    $("cardCond").textContent = "";
    $("todo").innerHTML = "";
    $("calloutBubble").hidden = true;
    $("progressText").textContent = "Complete";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
