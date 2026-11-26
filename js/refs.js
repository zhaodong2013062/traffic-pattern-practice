/* ============================================================================
   refs.js  —  turns a reference line into bookmarkable links.

   Every oral question and Stage 1 item carries a `ref` string written the way
   a pilot would cite it, e.g.
     "14 CFR 91.155(c), 91.151; AIM 3-2-5; PHAK ch. 15; AFH ch. 8; C172S POH section 2"
   Refs.html(ref) renders it as chips:
     14 CFR / 49 CFR section  → eCFR (current)          title from REF_TITLES
     AIM n-n-n (or n-n)       → faa.gov AIM html        title from REF_TITLES
     PHAK ch. n               → PHAK FAA-H-8083-25C pdf, at the chapter's page
     AFH ch. n                → AFH FAA-H-8083-3C chapter pdf
     anything else (POH, AC, Chart Supplement, school sheets) → a plain chip
   Segments are split on ";" — a segment with no source keyword inherits the
   previous one ("14 CFR 61.87; 61.89(a)(6)"), and so do comma-separated items.

   REF_TITLES is generated from the FAA's own indexes (eCFR structure API, the
   AIM html contents, the PHAK and AFH chapter lists) by the contract script
   that also validates every ref in the app — regenerate it when refs change.
   ========================================================================== */

const Refs = (() => {
  // PHAK (FAA-H-8083-25C) — pdf page where each chapter starts
  const PHAK_PDF = "https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/faa-h-8083-25c.pdf";
  const PHAK_PAGE = { 1: 16, 2: 40, 3: 72, 4: 88, 5: 98, 6: 149, 7: 161, 8: 203, 9: 231, 10: 245,
    11: 257, 12: 285, 13: 311, 14: 335, 15: 376, 16: 388, 17: 423 };
  const PHAK_CH = { 1: "Introduction to Flying", 2: "Aeronautical Decision-Making", 3: "Aircraft Construction",
    4: "Principles of Flight", 5: "Aerodynamics of Flight", 6: "Flight Controls", 7: "Aircraft Systems",
    8: "Flight Instruments", 9: "Flight Manuals and Other Documents", 10: "Weight and Balance",
    11: "Aircraft Performance", 12: "Weather Theory", 13: "Aviation Weather Services", 14: "Airport Operations",
    15: "Airspace", 16: "Navigation", 17: "Aeromedical Factors" };
  // AFH (FAA-H-8083-3C) — one pdf per chapter
  const AFH_BASE = "https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/airplane_handbook/";
  const AFH_CH = { 1: "Introduction to Flight Training", 2: "Ground Operations", 3: "Basic Flight Maneuvers",
    4: "Energy Management", 5: "Upset Prevention and Recovery", 6: "Takeoffs and Departure Climbs",
    7: "Ground Reference Maneuvers", 8: "Airport Traffic Patterns", 9: "Approaches and Landings",
    10: "Performance Maneuvers", 11: "Night Operations", 12: "Transition to Complex Airplanes",
    13: "Transition to Multiengine Airplanes", 14: "Transition to Tailwheel Airplanes",
    15: "Transition to Turbopropeller-Powered Airplanes", 16: "Transition to Jet-Powered Airplanes",
    17: "Transition to Light Sport Airplanes", 18: "Emergency Procedures" };
  const afhFile = (n) => `${String(n + 1).padStart(2, "0")}_afh_ch${n}.pdf`;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const titles = () => (typeof REF_TITLES !== "undefined" ? REF_TITLES : {});

  // which source a segment names (null = inherit)
  function sourceOf(seg) {
    if (/\b49\s*CFR\b/i.test(seg)) return "cfr49";
    if (/\b(14\s*)?CFR\b|\bFAR\b|§|\bPart\s+\d+/i.test(seg)) return "cfr";
    if (/\bAIM\b/.test(seg)) return "aim";
    if (/\bPHAK\b/.test(seg)) return "phak";
    if (/\bAFH\b/.test(seg)) return "afh";
    return null;
  }

  // -> [{ kind, label, url?, title? }]
  function parse(ref) {
    if (!ref) return [];
    const out = [];
    let src = null;
    String(ref).split(";").map((s) => s.trim()).filter(Boolean).forEach((seg) => {
      const named = sourceOf(seg);
      // a segment that starts with a section number keeps the previous source
      if (named) src = named;
      else if (!(src && /^(§\s*)?\d/.test(seg))) { out.push({ kind: "text", label: seg }); src = null; return; }
      const before = out.length;
      if (src === "cfr" || src === "cfr49") {
        const title = src === "cfr49" ? 49 : 14;
        // Part NN Appendix X
        seg.replace(/Part\s+(\d+)\s*,?\s*App(?:endix|\.)?\s*([A-Z])\b/gi, (m, p, a) => {
          out.push({ kind: "cfr", label: `${title} CFR Part ${p} App. ${a.toUpperCase()}`,
            url: `https://www.ecfr.gov/current/title-${title}/part-${p}/appendix-Appendix%20${a.toUpperCase()}%20to%20Part%20${p}`,
            title: titles()[`${p} App ${a.toUpperCase()}`] });
          return "";
        });
        let any = false;
        seg.replace(/(\d{1,3})\.(\d{1,4}[a-z]?)((?:\([a-z0-9]+\))*)/g, (m, p, s, para) => {
          any = true;
          const sec = `${p}.${s}`;
          out.push({ kind: "cfr", label: `${title === 49 ? "49 CFR" : "14 CFR"} ${sec}${para}`,
            url: `https://www.ecfr.gov/current/title-${title}/section-${sec}${para ? `#p-${sec}${para}` : ""}`,
            title: titles()[(title === 49 ? "49:" : "") + sec] });
          return "";
        });
        if (!any && out.length === before) seg.replace(/Part\s+(\d+)/gi, (m, p) => {
          out.push({ kind: "cfr", label: `${title} CFR Part ${p}`, url: `https://www.ecfr.gov/current/title-${title}/part-${p}`, title: titles()[`part ${p}`] });
          return "";
        });
      } else if (src === "aim") {
        seg.replace(/(\d{1,2})-(\d{1,2})(?:-(\d{1,3}))?/g, (m, c, s, p) => {
          const id = p ? `${c}-${s}-${p}` : `${c}-${s}`;
          out.push({ kind: "aim", label: `AIM ${id}`,
            url: `https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap${c}_section_${s}.html${p ? "#" + id : ""}`,
            title: titles()["AIM " + id] });
          return "";
        });
        if (out.length === before) seg.replace(/ch(?:apter|\.)?\s*(\d{1,2})/gi, (m, c) => {
          out.push({ kind: "aim", label: `AIM ch. ${c}`, url: `https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap_${c}.html` });
          return "";
        });
      } else if (src === "phak" || src === "afh") {
        // chapter numbers only — drop parentheticals like "(fig. 11-5)"
        const body = seg.replace(/^.*?(PHAK|AFH)\b/, "").replace(/\([^)]*\)/g, "");
        const nums = [...new Set((body.match(/\b\d{1,2}\b/g) || []).map(Number))];
        nums.forEach((n) => {
          if (src === "phak" && PHAK_PAGE[n]) out.push({ kind: "phak", label: `PHAK ch. ${n}`, url: `${PHAK_PDF}#page=${PHAK_PAGE[n]}`, title: PHAK_CH[n] });
          if (src === "afh" && AFH_CH[n]) out.push({ kind: "afh", label: `AFH ch. ${n}`, url: AFH_BASE + afhFile(n), title: AFH_CH[n] });
        });
      }
      if (out.length === before) out.push({ kind: "text", label: seg });   // couldn't read it — show it as written
    });
    return out;
  }

  // some eCFR titles run to a paragraph — the chip shows the gist, the tooltip the whole
  const short = (t) => { t = String(t).replace(/\s*\((?:except|other than)[^)]*\)/i, ""); return t.length > 60 ? t.slice(0, 57).replace(/[\s,;:]+\S*$/, "") + "…" : t; };

  // the chips; `lead` adds a little "Bookmark" label
  function html(ref, lead = true) {
    const xs = parse(ref);
    if (!xs.length) return "";
    return `<div class="refs">${lead ? `<span class="refs-lead">📑 Bookmark</span>` : ""}${xs.map((x) => x.url
      ? `<a class="ref ref-${x.kind}" href="${esc(x.url)}" target="_blank" rel="noopener"${x.title ? ` title="${esc(x.title)}"` : ""}>${esc(x.label)}${x.title ? `<i>${esc(short(x.title))}</i>` : ""}</a>`
      : `<span class="ref ref-text">${esc(x.label)}</span>`).join("")}</div>`;
  }

  return { parse, html };
})();
