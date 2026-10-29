/* ============================================================================
   flash.js  —  Controller for the STAGE CHECK FLASHCARDS.

   No cockpit here: the flashcard view replaces the panel layout. Pick decks,
   then work a shuffled queue — flip (click or Space), then "Again" puts the
   card back a few places ahead, "Got it" retires it for this session. The
   deck selection persists; the queue does not.

   API on window.FlashDrill: init() / activate() / deactivate() / start() /
   restart() / showHint()
   ========================================================================== */

const FlashDrill = (() => {
  const $ = (id) => document.getElementById(id);
  const STORE_KEY = "c172-flash-decks";
  const AGAIN_GAP = 3;              // an "Again" card comes back this many cards later

  let decks = loadDecks();
  let queue = [], known = 0, again = 0, flipped = false, active = false;

  function loadDecks() {
    try {
      const ids = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (Array.isArray(ids)) return new Set(ids.filter((d) => FLASH_DECKS[d]));
    } catch (e) { /* storage blocked — fall through */ }
    return new Set(Object.keys(FLASH_DECKS));
  }
  function saveDecks() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...decks])); } catch (e) { /* ignore */ }
  }

  /* ------------------------------ decks --------------------------------- */
  function renderDecks() {
    const box = $("flashDecks");
    box.innerHTML = "";
    Object.entries(FLASH_DECKS).forEach(([id, d]) => {
      const n = FLASHCARDS.filter((c) => c.deck === id).length;
      const b = document.createElement("button");
      b.className = "flash-chip" + (decks.has(id) ? " on" : "");
      b.style.setProperty("--chip", d.color);
      b.textContent = `${d.name} · ${n}`;
      b.addEventListener("click", () => {
        decks.has(id) ? decks.delete(id) : decks.add(id);
        saveDecks(); renderDecks(); shuffleIn();
      });
      box.appendChild(b);
    });
  }

  function shuffleIn() {
    queue = FLASHCARDS.filter((c) => decks.has(c.deck));
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    known = 0; again = 0;
    show();
  }

  /* ------------------------------ a card -------------------------------- */
  function show() {
    flipped = false;
    const c = queue[0];
    $("flashAnswer").hidden = true;
    $("flashGrade").hidden = true;
    $("flashFlip").hidden = !c;
    if (!c) {
      $("flashDeckTag").textContent = "";
      $("flashQ").textContent = decks.size
        ? `Done — ${known} card${known === 1 ? "" : "s"} known, ${again} miss${again === 1 ? "" : "es"} on the way.`
        : "Pick at least one deck.";
      $("flashSrc").textContent = "";
      $("flashCount").textContent = "";
      $("flashReset").hidden = !decks.size;
      return;
    }
    $("flashReset").hidden = true;
    const d = FLASH_DECKS[c.deck];
    $("flashDeckTag").textContent = d.name;
    $("flashDeckTag").style.color = d.color;
    $("flashQ").textContent = c.q;
    $("flashA").textContent = c.a;
    $("flashSrc").textContent = c.src + (c.verify ? " · check against your school's Stan Manual" : "");
    $("flashCount").textContent = `${queue.length} left · ${known} known`;
  }

  function flip() {
    if (!queue.length || flipped) return;
    flipped = true;
    $("flashAnswer").hidden = false;
    $("flashFlip").hidden = true;
    $("flashGrade").hidden = false;
  }

  function grade(ok) {
    if (!flipped) return;
    const c = queue.shift();
    if (ok) known++;
    else { again++; queue.splice(Math.min(AGAIN_GAP, queue.length), 0, c); }
    show();
  }

  function onKey(e) {
    if (!active || e.target.closest("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); flip(); }
    else if (flipped && (e.key === "1" || e.key === "ArrowLeft")) grade(false);
    else if (flipped && (e.key === "2" || e.key === "ArrowRight")) grade(true);
  }

  /* ---------------------------- activation ------------------------------ */
  function activate() {
    active = true;
    UI.closePopover();
    $("mainLayout").hidden = true;
    $("flashView").hidden = false;
    ["startBtn", "restartBtn", "scenarioBtn"].forEach((id) => { $(id).hidden = true; });
    $("progressText").textContent = "";
    renderDecks();
    shuffleIn();
  }

  function deactivate() {
    active = false;
    $("flashView").hidden = true;
    $("mainLayout").hidden = false;
  }

  function init() {
    $("flashFlip").addEventListener("click", flip);
    $("flashCard").addEventListener("click", (e) => { if (!e.target.closest("button")) flip(); });
    $("flashAgain").addEventListener("click", () => grade(false));
    $("flashGot").addEventListener("click", () => grade(true));
    $("flashReset").addEventListener("click", shuffleIn);
    document.addEventListener("keydown", onKey);
  }

  return { init, activate, deactivate, start() {}, restart: shuffleIn, showHint() {} };
})();

window.FlashDrill = FlashDrill;
