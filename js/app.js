/* ============================================================================
   app.js  —  Click-the-instrument trainer.

   Each step shows only the CONDITIONS. The pilot must click the correct
   control/instrument; a value menu (dynamic per stage) then pops up over that
   control to choose the correct setting (e.g. throttle -> 1500 / 2150 / idle).

     - Wrong control            -> red "✗ not that one" flash, no menu.
     - Correct control          -> value menu opens at the control.
     - Wrong value              -> red shake on that choice, menu stays.
     - Correct value            -> instruments + airplane animate; for compound
                                   steps the next act arms (still no guidance).
     - No guidance is shown until "Show hint" is pressed.
     - Branch steps offer GO-AROUND.
   ========================================================================== */

(() => {
  const NAMES = {
    throttle: "THROTTLE", flaps: "FLAP SELECTOR", yoke: "YOKE", rudder: "RUDDER PEDALS",
    asi: "AIRSPEED INDICATOR", ai: "ATTITUDE INDICATOR", alt: "ALTIMETER",
    ti: "TURN COORDINATOR", hi: "HEADING INDICATOR", vsi: "VERTICAL SPEED", tach: "TACHOMETER",
    fuel: "FUEL SELECTOR", mixture: "MIXTURE", autopilot: "AUTOPILOT",
    seatbelt: "SEATBELTS", call: "RADIO / CALL",
  };
  // which controls show the chosen value as a label on the panel
  const SHOW_LABEL = new Set(["fuel", "mixture", "autopilot", "seatbelt", "call"]);

  const $ = (id) => document.getElementById(id);
  let steps = SEQUENCE.slice();
  let i = 0, a = 0;                 // step index, act index within the step
  let mode = "await-control";      // "await-control" | "await-value"
  let running = false, goneAround = false, finished = false;
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
    document.addEventListener("click", maybeClosePopover, true);

    Cockpit.setValues(SEQUENCE[0].acts[0].values || {}, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    renderIdle();
  }

  function renderIdle() {
    setBanner("READY", "#222");
    $("conditions").textContent =
      "You'll fly the pattern from takeoff to touchdown. At each point, click the control you'd use — then pick its setting.";
    $("prompt").textContent = "";
    hideFeedback();
    closePopover();
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("goaroundBtn").hidden = true;
    $("progressText").textContent = "";
  }

  function start() {
    if (running) return;
    running = true; finished = false;
    $("startBtn").hidden = true;
    $("restartBtn").hidden = false;
    i = 0; a = 0;
    loadStep();
  }

  function restart() {
    steps = SEQUENCE.slice();
    running = false; goneAround = false; finished = false;
    i = 0; a = 0; mode = "await-control";
    Cockpit.clearHighlight();
    closePopover();
    Cockpit.setValues(SEQUENCE[0].acts[0].values || {}, false);
    Minimap.placeAt(SEQUENCE[0].pos);
    Minimap.setLegActive(null);
    Minimap.showCondition("");
    $("startBtn").hidden = false;
    $("restartBtn").hidden = true;
    renderIdle();
  }

  function setBanner(text, color) {
    const b = $("phaseBanner");
    b.textContent = text; b.style.background = color;
  }

  /* ----------------------------- load a step ---------------------------- */
  function loadStep() {
    const s = steps[i];
    a = 0; mode = "await-control"; finished = false;
    Cockpit.clearHighlight();
    closePopover();

    const ph = PHASES[s.phase];
    setBanner(ph.name, ph.color);
    $("conditions").textContent = s.condition;
    $("prompt").textContent = s.acts.length > 1
      ? `What do you do? (${s.acts.length} actions, in order)`
      : "What do you do?";
    hideFeedback();

    $("hintBtn").hidden = false;
    $("hintBtn").textContent = "Show hint";
    $("hintBox").hidden = true;
    $("hintBox").textContent = "";
    $("goaroundBtn").hidden = !(s.branch && !goneAround);

    $("progressText").textContent =
      `Step ${i + 1} of ${steps.length}` + (goneAround ? " · GO-AROUND" : "");

    Minimap.setLegActive(s.phase);
    Minimap.showCondition(s.condition);
  }

  /* --------------------------- cockpit clicks --------------------------- */
  function onCockpitClick(id) {
    if (!running || finished) return;
    const act = steps[i].acts[a];

    // a click on the wrong control (in either mode) is a miss
    if (id !== act.target) {
      // if a menu is open for the right control, ignore stray clicks handled elsewhere
      Cockpit.flash(id, false);
      flashFeedback("✗ Not that one — try another control.", false);
      return;
    }

    // correct control -> open its value menu
    openPopover(id, act);
  }

  /* ----------------------------- value menu ----------------------------- */
  function openPopover(controlId, act) {
    mode = "await-value";
    const options = act.options || CONTROL_OPTIONS[controlId] || [];
    const pop = $("valuePopover");
    $("popTitle").textContent = NAMES[controlId] || controlId.toUpperCase();
    const wrap = $("popOptions");
    wrap.innerHTML = "";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "pop-opt";
      b.textContent = opt;
      b.addEventListener("click", (e) => { e.stopPropagation(); onValue(controlId, act, opt, b); });
      wrap.appendChild(b);
    });
    pop.hidden = false;
    positionPopover(controlId);
  }

  function positionPopover(controlId) {
    const ctl = document.querySelector(`[data-id="${controlId}"]`);
    const wrap = document.querySelector(".cockpit-wrap");
    if (!ctl || !wrap) return;
    const r = ctl.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const pop = $("valuePopover");
    const px = r.left - w.left + r.width / 2;
    pop.style.left = Math.max(80, Math.min(px, w.width - 80)) + "px";
    // flip below the control when there isn't room above (top instruments)
    if (r.top - w.top < 150) {
      pop.classList.add("below");
      pop.style.top = (r.bottom - w.top) + "px";
    } else {
      pop.classList.remove("below");
      pop.style.top = (r.top - w.top) + "px";
    }
  }

  function onValue(controlId, act, opt, btn) {
    if (mode !== "await-value") return;
    if (opt !== act.correct) {
      btn.classList.add("wrong");
      btn.disabled = true;
      flashFeedback("✗ Not the right setting.", false);
      return;
    }
    // correct value
    Cockpit.flash(controlId, true);
    if (SHOW_LABEL.has(controlId)) Cockpit.setControlLabel(controlId, shortLabel(opt));
    if (act.values) Cockpit.setValues(act.values, true);
    closePopover();
    Cockpit.clearHighlight();

    a++;
    if (a < steps[i].acts.length) {
      mode = "await-control";
      flashFeedback("✓ " + opt, true);
      $("hintBtn").textContent = "Show hint";
      $("hintBox").hidden = true;
    } else {
      completeStep();
    }
  }

  function shortLabel(opt) { return opt.split(" / ")[0].split(" (")[0]; }

  /* ------------------------- popover open/close ------------------------- */
  function closePopover() {
    const pop = $("valuePopover");
    if (pop) pop.hidden = true;
    if (mode === "await-value") mode = "await-control";
  }
  function maybeClosePopover(e) {
    const pop = $("valuePopover");
    if (!pop || pop.hidden) return;
    // ignore clicks inside the popover or on any cockpit control (handled elsewhere)
    if (pop.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".control, .instrument")) return;
    closePopover();
  }

  /* ------------------------------ feedback ------------------------------ */
  function flashFeedback(text, ok) {
    const f = $("feedback");
    f.hidden = false;
    f.textContent = text;
    f.className = "feedback " + (ok ? "ok" : "bad");
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(hideFeedback, ok ? 1100 : 1400);
  }
  function hideFeedback() { const f = $("feedback"); f.hidden = true; f.textContent = ""; }

  /* ------------------------------- hint --------------------------------- */
  function showHint() {
    const s = steps[i];
    const act = s.acts[a];
    const box = $("hintBox");
    box.hidden = false;
    if (mode === "await-value") {
      box.textContent = `Set the ${NAMES[act.target]} to: ${act.correct}`;
      [...$("popOptions").children].forEach((b) => {
        if (b.textContent === act.correct) b.classList.add("hint");
      });
    } else {
      const left = s.acts.length - a;
      box.textContent = `Click the ${NAMES[act.target]}.` +
        (s.acts.length > 1 ? `  (${left} action${left > 1 ? "s" : ""} left in this step)` : "");
      Cockpit.highlight([act.target]);
    }
    $("hintBtn").textContent = "Hint shown";
  }

  /* --------------------------- complete + move -------------------------- */
  function completeStep() {
    finished = true;
    const s = steps[i];
    Cockpit.clearHighlight();
    closePopover();
    $("goaroundBtn").hidden = true;
    $("hintBtn").hidden = true;
    flashFeedback("✓ " + s.acts[s.acts.length - 1].correct, true);

    const next = steps[i + 1];
    if (!next) { setTimeout(finishRun, 600); return; }
    // fly to the NEXT action point (semi real-time), then show its conditions
    Minimap.moveTo(next.pos, next.dwell, PHASES[next.phase].color, () => {
      i++;
      loadStep();
    });
  }

  function triggerGoAround() {
    if (!running || goneAround || finished) return;
    goneAround = true;
    steps = GOAROUND.slice();
    i = 0; a = 0; mode = "await-control"; finished = true;
    $("goaroundBtn").hidden = true;
    // fly into the go-around climb, then show its first conditions
    Minimap.moveTo(steps[0].pos, steps[0].dwell, PHASES.GOAROUND.color, loadStep);
  }

  function finishRun() {
    finished = true; running = false;
    Cockpit.clearHighlight();
    setBanner(goneAround ? "GO-AROUND COMPLETE" : "TOUCHDOWN",
      goneAround ? PHASES.GOAROUND.color : PHASES.LANDING.color);
    $("conditions").textContent = goneAround
      ? "Going around — climb out and re-enter the pattern."
      : "Nice landing! Pattern complete.";
    $("prompt").textContent = "Press Restart to fly it again.";
    hideFeedback();
    $("hintBtn").hidden = true;
    $("hintBox").hidden = true;
    $("progressText").textContent = "Complete";
  }

  // keep the popover glued to its control on resize/scroll
  window.addEventListener("resize", () => {
    const pop = $("valuePopover");
    if (pop && !pop.hidden && mode === "await-value") positionPopover(steps[i].acts[a].target);
  });

  document.addEventListener("DOMContentLoaded", init);
})();
