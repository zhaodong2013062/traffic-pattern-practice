/* ============================================================================
   ui.js  —  Chrome shared by both drills (pattern and emergencies).

   The two trainers ask the same question in the same way — click a control,
   pick a value from a menu anchored to it — so the popover, the feedback line
   and the phase banner live here rather than in either controller.

   API on window.UI:
     setBanner(text, color)
     feedback(text, ok)  /  hideFeedback()
     openPopover(controlId, options, onPick, onClose)
     closePopover()  /  isPopoverOpen()  /  repositionPopover(controlId)
     markPopoverOption(text)         outline the correct choice (hints)
   ========================================================================== */

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  let pop = null;                 // { controlId, onClose } while a menu is open
  let fbTimer = null;

  /* ------------------------------ banner -------------------------------- */
  function setBanner(text, color) {
    const b = $("phaseBanner");
    b.textContent = text;
    b.style.background = color;
  }

  /* ----------------------------- feedback ------------------------------- */
  function feedback(text, ok) {
    const f = $("feedback");
    f.hidden = false;
    f.textContent = text;
    f.className = "feedback " + (ok ? "ok" : "bad");
    if (fbTimer) clearTimeout(fbTimer);
    fbTimer = setTimeout(hideFeedback, ok ? 1100 : 1400);
  }
  function hideFeedback() {
    const f = $("feedback");
    f.hidden = true;
    f.textContent = "";
  }

  /* ----------------------------- popover -------------------------------- */
  function openPopover(controlId, options, onPick, onClose) {
    const node = $("valuePopover");
    $("popTitle").textContent = (window.Cockpit && Cockpit.NAMES[controlId]) || controlId.toUpperCase();
    const wrap = $("popOptions");
    wrap.innerHTML = "";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.className = "pop-opt";
      b.textContent = opt;
      b.addEventListener("click", (e) => { e.stopPropagation(); onPick(opt, b); });
      wrap.appendChild(b);
    });
    pop = { controlId, onClose };
    node.hidden = false;
    repositionPopover(controlId);
  }

  function repositionPopover(controlId) {
    const ctl = document.querySelector(`[data-id="${controlId}"]`);
    const wrap = document.querySelector(".cockpit-wrap");
    if (!ctl || !wrap) return;
    const r = ctl.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    const node = $("valuePopover");
    const px = r.left - w.left + r.width / 2;
    node.style.left = Math.max(80, Math.min(px, w.width - 80)) + "px";
    // Drop the menu BELOW for controls in the upper ~70% of the panel (gauges
    // and the switch grid) so it doesn't cover what sits above it; open ABOVE
    // for the low pedestal controls.
    const centerY = (r.top + r.bottom) / 2 - w.top;
    if (centerY < w.height * 0.70) {
      node.classList.add("below");
      node.style.top = (r.bottom - w.top) + "px";
    } else {
      node.classList.remove("below");
      node.style.top = (r.top - w.top) + "px";
    }
  }

  function closePopover() {
    const node = $("valuePopover");
    if (node) node.hidden = true;
    const cb = pop && pop.onClose;
    pop = null;
    if (cb) cb();
  }

  function isPopoverOpen() { return !!pop; }

  function markPopoverOption(text) {
    [...$("popOptions").children].forEach((b) => {
      if (b.textContent === text) b.classList.add("hint");
    });
  }

  // clicks outside the menu (and outside any cockpit control) dismiss it
  document.addEventListener("click", (e) => {
    const node = $("valuePopover");
    if (!node || node.hidden) return;
    if (node.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".control, .instrument")) return;
    closePopover();
  }, true);

  window.addEventListener("resize", () => {
    if (pop) repositionPopover(pop.controlId);
  });

  return { setBanner, feedback, hideFeedback, openPopover, closePopover,
           isPopoverOpen, repositionPopover, markPopoverOption };
})();

window.UI = UI;
