/* ============================================================================
   app.js  —  Click-the-cockpit trainer (no multiple choice).

   At each pattern point the card shows ONLY the current conditions. The pilot:
     1. clicks the instrument/control they'd use            (await-control)
          - wrong element  -> red shake + "not that one" indicator, no progress
          - right element  -> a value picker opens for that control
     2. picks the correct setting from the picker            (await-value)
          - choices are specific to the control AND the stage (dynamic)
          - wrong value -> red ✗ on that choice, try again
          - right value -> the control is set; next action arms, or the step
                           completes (instruments + airplane animate, advance)

   Compound steps (downwind level-off, Power/Alt/Airspeed scan, Before-Landing,
   GA clean-up) chain several click-then-pick actions in order.

   There is NO guidance before the pilot acts. "Show hint" reveals the
   explanation and points at the correct control (or glows the correct value).
   Branch steps (final / over the threshold) offer GO-AROUND.
   ========================================================================== */

(() => {
  // display names for the picker heading + hint
  const NAMES = {
    throttle: "Throttle", flaps: "Flap selector", yoke: "Yoke / elevator",
    rudder: "Rudder pedals", asi: "Airspeed indicator", ai: "Attitude indicator",
    alt: "Altimeter", ti: "Turn coordinator", hi: "Heading indicator",
    vsi: "Vertical speed", tach: "Tachometer", comm: "Comm · callout",
    fuel: "Fuel selector", mixture: "Mixture", seatbelt: "Seatbelt sign",
    autopilot: "Autopilot",
  };

  const $ = (id) => document.getElementById(id);
  let steps = SEQUENCE.slice();
  let i = 0, sub = 0;
  let mode = "idle";                 // idle | await-control | await-value | transit | done
  let running = false, goneAround = false;
  let fbTimer = null;

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

  function shuffle(a) {
    a = a.slice();
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  }

  /* ------------------------------- idle --------------------------------- */
  function renderIdle() {
    mode = "idle";
    $("phaseBanner").textContent = "READY";
    $("phaseBanner").style.background = "#222";
    $("situation").textContent =
      "Fly the pattern from takeoff to touchdown. At each point, click the instrument or control you'd use — then choose its setting.";
    $("stepPrompt").textContent = "Press Start to begin.";
    hidePicker();
    $("performDots").innerHTML = "";
    hideFeedback();
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("goaroundBtn").hidden = true;
    $("progressText").textContent = "";
  }

  function start() {
    if (running) return;
    running = true;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    i = 0; sub = 0;
    loadStep();
  }

  function restart() {
    steps = SEQUENCE.slice();
    running = false; goneAround = false;
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

  /* ----------------------------- load a step ---------------------------- */
  function loadStep() {
    const s = steps[i];
    sub = 0; mode = "await-control";
    Cockpit.clearHighlight();

    const ph = PHASES[s.phase];
    $("phaseBanner").textContent = ph.name;
    $("phaseBanner").style.background = ph.color;

    $("situation").textContent = s.condition || "";
    $("stepPrompt").textContent = "Click the instrument or control you'd use.";

    $("progressText").textContent =
      `Step ${i + 1} of ${steps.length}` + (goneAround ? " · GO-AROUND" : "");

    hidePicker();
    hideFeedback();
    resetHint();
    $("hintBtn").hidden = false;
    $("goaroundBtn").hidden = !(s.branch && !goneAround);

    renderDots(s);
    Minimap.setLegActive(s.phase);
    Minimap.showCondition(s.condition || "");
  }

  function renderDots(s) {
    const wrap = $("performDots");
    wrap.innerHTML = "";
    if (s.actions.length < 2) return;          // dots only for compound flows
    s.actions.forEach((_, idx) => {
      const d = document.createElement("span");
      d.className = "dot" + (idx < sub ? " on" : "");
      wrap.appendChild(d);
    });
  }

  /* --------------------------- cockpit clicks --------------------------- */
  function onCockpitClick(id) {
    if (!running || mode !== "await-control") return;   // ignore while picking / in transit
    const s = steps[i];
    const expected = s.actions[sub].target;

    if (id !== expected) {                              // wrong instrument/control
      Cockpit.flash(id, false);
      flashFeedback("✗ Not that one — try another instrument or control.", false);
      return;
    }

    // correct element — open the value picker for it
    Cockpit.flash(id, true);
    Cockpit.clearHighlight();
    hideFeedback();
    openPicker(s.actions[sub]);
  }

  /* --------------------- value picker for a control --------------------- */
  function optionsFor(action) {
    if (action.opts) return shuffle(action.opts);
    const pool = VALUE_POOLS[action.target] || [action.answer];
    const distractors = shuffle(pool.filter((v) => v !== action.answer)).slice(0, 3);
    return shuffle([action.answer, ...distractors]);
  }

  function openPicker(action) {
    mode = "await-value";
    $("pickerTitle").textContent = `${NAMES[action.target] || action.target} — set to:`;
    $("stepPrompt").textContent = "Choose the correct setting.";

    const wrap = $("pickerOpts");
    wrap.innerHTML = "";
    optionsFor(action).forEach((text) => {
      const b = document.createElement("button");
      b.className = "pick-btn";
      b.textContent = text;
      b.addEventListener("click", () => onValue(b, action, text));
      wrap.appendChild(b);
    });
    $("picker").hidden = false;

    // if a hint is already open, glow the correct value
    if (!$("hintBox").hidden) glowCorrectValue(action);
  }

  function onValue(btn, action, text) {
    if (mode !== "await-value") return;
    if (text !== action.answer) {                       // wrong setting
      btn.classList.add("wrong");
      btn.disabled = true;
      return;
    }
    // correct setting
    btn.classList.add("correct");
    [...$("pickerOpts").children].forEach((b) => (b.disabled = true));
    Cockpit.markDone(action.target);
    Cockpit.clearHighlight();

    const s = steps[i];
    sub++;
    if (sub >= s.actions.length) {
      completeStep();
    } else {
      // next action of a compound step
      mode = "await-control";
      hidePicker();
      resetHint();
      renderDots(s);
      $("stepPrompt").textContent = "Good — now the next instrument or control.";
      flashFeedback("✓ Set.", true);
    }
  }

  /* ------------------------------- hint --------------------------------- */
  function resetHint() {
    $("hintBox").hidden = true;
    $("hintBox").textContent = "";
    $("hintBtn").textContent = "Show hint";
  }

  function showHint() {
    if (!running || mode === "transit") return;
    const s = steps[i];
    $("hintBox").hidden = false;
    $("hintBox").textContent = s.hint || "";
    $("hintBtn").textContent = "Hint shown";

    if (mode === "await-control") Cockpit.highlight([s.actions[sub].target]);
    else if (mode === "await-value") glowCorrectValue(s.actions[sub]);
  }

  function glowCorrectValue(action) {
    [...$("pickerOpts").children].forEach((b) => {
      b.classList.toggle("hint-correct", b.textContent === action.answer);
    });
  }

  /* --------------------------- feedback toast --------------------------- */
  function flashFeedback(msg, ok) {
    const f = $("feedback");
    f.textContent = msg;
    f.classList.toggle("ok", !!ok);
    f.classList.toggle("bad", !ok);
    f.hidden = false;
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(hideFeedback, ok ? 900 : 1600);
  }
  function hideFeedback() {
    if (fbTimer) { clearTimeout(fbTimer); fbTimer = null; }
    $("feedback").hidden = true;
  }

  /* --------------------------- complete + move -------------------------- */
  function completeStep() {
    mode = "transit";
    const s = steps[i];
    Cockpit.clearHighlight();
    hidePicker();
    hideFeedback();
    $("goaroundBtn").hidden = true;
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("stepPrompt").textContent = "Flying to the next point…";

    Cockpit.setValues(s.values, true);
    Minimap.moveTo(s.pos, s.dwell, PHASES[s.phase].color, () => {
      i++;
      if (i >= steps.length) return finishRun();
      loadStep();
    });
  }

  function triggerGoAround() {
    if (!running || goneAround || mode === "transit") return;
    goneAround = true;
    steps = GOAROUND.slice();
    i = 0; sub = 0;
    $("goaroundBtn").hidden = true;
    hidePicker();
    loadStep();
  }

  function finishRun() {
    mode = "done"; running = false;
    Cockpit.clearHighlight();
    const banner = $("phaseBanner");
    banner.textContent = goneAround ? "GO-AROUND COMPLETE" : "TOUCHDOWN";
    banner.style.background = goneAround ? PHASES.GOAROUND.color : PHASES.LANDING.color;
    $("situation").textContent = goneAround
      ? "Going around — climbing out to re-enter the pattern."
      : "Nice landing! Pattern complete.";
    $("stepPrompt").textContent = "Press Restart to fly it again.";
    hidePicker();
    hideFeedback();
    $("performDots").innerHTML = "";
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("progressText").textContent = "Complete";
  }

  function hidePicker() {
    $("picker").hidden = true;
    $("pickerOpts").innerHTML = "";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
