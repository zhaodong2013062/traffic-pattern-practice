/* ============================================================================
   app.js  —  Mode switch + the traffic-pattern drill.

   Two drills share this screen:
     PATTERN      — fly takeoff to touchdown (SEQUENCE / GOAROUND in
                    sequence.js), driven from this file.
     EMERGENCIES  — random emergency checklists (emergencies.js), driven by
                    emergency.js.

   Both ask the same question the same way: each step shows only the
   CONDITIONS, the pilot clicks a control/instrument, and a value menu pops up
   over that control to choose the setting. The popover, feedback line and
   banner are shared (ui.js).

     - Wrong control            -> red "✗ not that one" flash, no menu.
     - Correct control          -> value menu opens at the control.
     - Wrong value              -> red shake on that choice, menu stays.
     - Correct value            -> instruments + airplane animate; for compound
                                   steps the next act arms (still no guidance).
     - No guidance is shown until "Show hint" is pressed.
     - Branch steps offer GO-AROUND.
   ========================================================================== */

(() => {
  const $ = (id) => document.getElementById(id);
  // which controls show the chosen value as a label on the panel
  const SHOW_LABEL = new Set(["fuel", "mixture", "autopilot", "seatbelt", "call"]);

  /* ======================= the traffic-pattern drill ===================== */
  const Pattern = (() => {
    let steps = SEQUENCE.slice();
    let i = 0, a = 0;                // step index, act index within the step
    let stage = "await-control";    // "await-control" | "await-value"
    let running = false, goneAround = false, finished = false;

    function renderIdle() {
      UI.setBanner("READY", "#222");
      $("conditionsLabel").textContent = "CONDITIONS";
      $("conditions").textContent =
        "You'll fly the pattern from takeoff to touchdown. At each point, click the control you'd use — then pick its setting.";
      $("prompt").textContent = "";
      $("prompt").className = "prompt";
      UI.hideFeedback();
      UI.closePopover();
      $("hintBtn").hidden = true;
      $("hintBox").hidden = true;
      $("goaroundBtn").hidden = true;
      $("goaroundHint").hidden = true;
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
      i = 0; a = 0; stage = "await-control";
      Cockpit.clearHighlight();
      UI.closePopover();
      Cockpit.setValues(SEQUENCE[0].acts[0].values || {}, false);
      Minimap.placeAt(SEQUENCE[0].pos);
      Minimap.setLegActive(null);
      Minimap.showCondition("");
      $("startBtn").hidden = false;
      $("restartBtn").hidden = true;
      renderIdle();
    }

    /* ---------------------------- load a step --------------------------- */
    function loadStep() {
      const s = steps[i];
      a = 0; stage = "await-control"; finished = false;
      Cockpit.clearHighlight();
      UI.closePopover();

      const ph = PHASES[s.phase];
      UI.setBanner(ph.name, ph.color);
      $("conditions").textContent = s.condition;
      $("prompt").textContent = s.acts.length > 1
        ? `What do you do? (${s.acts.length} actions, in order)`
        : "What do you do?";
      UI.hideFeedback();

      $("hintBtn").hidden = false;
      $("hintBtn").textContent = "Show hint";
      $("hintBox").hidden = true;
      $("hintBox").textContent = "";
      $("goaroundBtn").hidden = !(s.branch && !goneAround);
      $("goaroundHint").hidden = !(s.branch && !goneAround);

      $("progressText").textContent =
        `Step ${i + 1} of ${steps.length}` + (goneAround ? " · GO-AROUND" : "");

      Minimap.setLegActive(s.phase);
      Minimap.showCondition(s.condition);
    }

    /* -------------------------- cockpit clicks -------------------------- */
    function onCockpitClick(id) {
      if (!running || finished) return;
      const act = steps[i].acts[a];

      // a click on the wrong control (in either stage) is a miss
      if (id !== act.target) {
        Cockpit.flash(id, false);
        UI.feedback("✗ Not that one — try another control.", false);
        return;
      }

      // correct control -> clear any stale "wrong" feedback and open its menu
      UI.hideFeedback();
      stage = "await-value";
      const options = act.options || CONTROL_OPTIONS[id] || [];
      UI.openPopover(id, options,
        (opt, btn) => onValue(id, act, opt, btn),
        () => { if (stage === "await-value") stage = "await-control"; });
    }

    function onValue(controlId, act, opt, btn) {
      if (stage !== "await-value") return;
      if (opt !== act.correct) {
        btn.classList.add("wrong");
        btn.disabled = true;
        UI.feedback("✗ Not the right setting.", false);
        return;
      }
      // correct value
      Cockpit.flash(controlId, true);
      if (SHOW_LABEL.has(controlId)) Cockpit.setControlLabel(controlId, shortLabel(opt));
      if (act.values) Cockpit.setValues(act.values, true);
      UI.closePopover();
      Cockpit.clearHighlight();

      a++;
      if (a < steps[i].acts.length) {
        stage = "await-control";
        UI.feedback("✓ " + opt, true);
        $("hintBtn").textContent = "Show hint";
        $("hintBox").hidden = true;
      } else {
        completeStep();
      }
    }

    function shortLabel(opt) { return opt.split(" / ")[0].split(" (")[0]; }

    /* ------------------------------- hint ------------------------------- */
    function showHint() {
      const s = steps[i];
      const act = s.acts[a];
      const box = $("hintBox");
      box.hidden = false;
      if (stage === "await-value") {
        box.textContent = `Set the ${Cockpit.NAMES[act.target]} to: ${act.correct}`;
        UI.markPopoverOption(act.correct);
      } else {
        const left = s.acts.length - a;
        box.textContent = `Click the ${Cockpit.NAMES[act.target]}.` +
          (s.acts.length > 1 ? `  (${left} action${left > 1 ? "s" : ""} left in this step)` : "");
        Cockpit.highlight([act.target]);
      }
      $("hintBtn").textContent = "Hint shown";
    }

    /* --------------------------- complete + move ------------------------ */
    function completeStep() {
      finished = true;
      const s = steps[i];
      Cockpit.clearHighlight();
      UI.closePopover();
      $("goaroundBtn").hidden = true;
      $("goaroundHint").hidden = true;
      $("hintBtn").hidden = true;
      UI.feedback("✓ " + s.acts[s.acts.length - 1].correct, true);

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
      i = 0; a = 0; stage = "await-control"; finished = true;
      $("goaroundBtn").hidden = true;
      $("goaroundHint").hidden = true;
      // fly into the go-around climb, then show its first conditions
      Minimap.moveTo(steps[0].pos, steps[0].dwell, PHASES.GOAROUND.color, loadStep);
    }

    function finishRun() {
      finished = true; running = false;
      Cockpit.clearHighlight();
      UI.setBanner(goneAround ? "GO-AROUND COMPLETE" : "TOUCHDOWN",
        goneAround ? PHASES.GOAROUND.color : PHASES.LANDING.color);
      $("conditions").textContent = goneAround
        ? "Going around — climb out and re-enter the pattern."
        : "Nice landing! Pattern complete.";
      $("prompt").textContent = "Press Restart to fly it again.";
      UI.hideFeedback();
      $("hintBtn").hidden = true;
      $("hintBox").hidden = true;
      $("progressText").textContent = "Complete";
    }

    /* ----------------------------- activation --------------------------- */
    function activate() {
      Cockpit.render($("cockpit"), "pattern");
      Cockpit.onClick(onCockpitClick);
      Cockpit.setValues(SEQUENCE[0].acts[0].values || {}, false);
      $("minimapBox").hidden = false;
      Minimap.placeAt(SEQUENCE[0].pos);
      Minimap.setLegActive(null);
      Minimap.showCondition("");
      $("startBtn").hidden = false;
      $("restartBtn").hidden = true;
      running = false; goneAround = false; finished = false;
      i = 0; a = 0; stage = "await-control";
      renderIdle();
    }

    function deactivate() {
      running = false; finished = true;
      UI.closePopover();
      $("goaroundBtn").hidden = true;
      $("goaroundHint").hidden = true;
      $("minimapBox").hidden = true;
    }

    return { activate, deactivate, start, restart, showHint, triggerGoAround };
  })();

  /* ============================ mode switch ============================= */
  let current = "pattern";

  function setMode(next) {
    if (next === current) return;
    (current === "pattern" ? Pattern : EmergencyDrill).deactivate();
    current = next;
    $("modePattern").classList.toggle("active", next === "pattern");
    $("modeEmergency").classList.toggle("active", next === "emergency");
    document.body.classList.toggle("emergency-mode", next === "emergency");
    (next === "pattern" ? Pattern : EmergencyDrill).activate();
  }

  const activeDrill = () => (current === "pattern" ? Pattern : EmergencyDrill);

  /* -------------------------------- setup ------------------------------- */
  function init() {
    Minimap.render($("minimap"));
    EmergencyDrill.init();

    $("modePattern").addEventListener("click", () => setMode("pattern"));
    $("modeEmergency").addEventListener("click", () => setMode("emergency"));
    $("startBtn").addEventListener("click", () => activeDrill().start());
    $("restartBtn").addEventListener("click", () => activeDrill().restart());
    $("hintBtn").addEventListener("click", () => activeDrill().showHint());
    $("goaroundBtn").addEventListener("click", () => Pattern.triggerGoAround());

    Pattern.activate();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
