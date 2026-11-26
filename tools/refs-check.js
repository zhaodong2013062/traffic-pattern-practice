#!/usr/bin/env node
/* Validates every `ref` in the app against the FAA's own indexes and writes
   js/reftitles.js (the titles shown on the bookmark chips).

     node tools/refs-check.js            report problems + coverage
     node tools/refs-check.js --write    also regenerate js/reftitles.js

   A ref token passes if: a 14/49 CFR section or appendix exists in
   tools/ref-index.json (eCFR structure API), an AIM paragraph exists (AIM html
   contents), a PHAK/AFH chapter exists, or it is plain text naming a non-FAA
   source we deliberately don't link (POH, AC, Chart Supplement, the school's
   sheets…). Not a test runner — a dev aid, like the other contract checks. */
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const INDEX = JSON.parse(read("tools/ref-index.json"));

const ctx = { window: {}, console };
vm.createContext(ctx);
["js/sequence.js", "js/maneuvers.js", "js/diagrams.js", "js/emergencies.js", "js/oralbank.js", "js/stagecheck.js", "js/refs.js"].forEach((f) =>
  vm.runInContext(read(f) + `\n;this.__last = 1;`, ctx, { filename: f }));
vm.runInContext("this.REF_TITLES = " + JSON.stringify(INDEX) + "; this.D = { Q: ORAL_QUESTIONS, T: STAGE1_TOPICS, S: STAGE1_SYSTEMS, R: Refs };", ctx);
const { Q, T, S, R } = ctx.D;

// non-FAA sources that stay plain text
const PLAIN = /POH|AFM|\bAC\s?\d|Advisory Circular|Chart Supplement|Chart Users|Sectional|Terminal Area|King County|school|School|ACS|FAA-S-ACS|Airport diagram|hot ?spot list|NOTAM|tfr\.faa\.gov|1800wxbrief|Aviation Weather Handbook|FAA-H-8083-28|AWH|Instrument Flying Handbook|Risk Management Handbook|FAA-H-8083-2\b|Weight & Balance Handbook|FAA-H-8083-1|Aeronautical Chart|placard|checklist|training bulletin|NTSB|TSA|Safety Alert|Lycoming|Garmin|G1000|Pilot's Guide|InFO|SAFO|FDC|Order\s?JO|7110\.65|Part 830|AOPA|Advisory|Pilot.Controller Glossary|rule of thumb|technique|endorsement/i;

const problems = [], used = new Set(), missing = { oral: [], stage1: [] };
function check(where, ref) {
  R.parse(ref).forEach((t) => {
    if (t.kind === "cfr") {
      const m = t.label.match(/^(14|49) CFR (\d+\.\d+[a-z]?)/), a = t.label.match(/^(14|49) CFR Part (\d+) App\. ([A-Z])/), p = t.label.match(/^(\d+) CFR Part (\d+)$/);
      const key = m ? (m[1] === "49" ? "49:" : "") + m[2] : a ? `${a[2]} App ${a[3]}` : null;
      if (key) { if (INDEX[key]) used.add(key); else problems.push(`${where}: no such section ${t.label}`); }
      else if (!p) problems.push(`${where}: unreadable CFR "${t.label}"`);
    } else if (t.kind === "aim") {
      const id = t.label.replace("AIM ", "");
      if (/^ch\./.test(id)) return;
      const key = "AIM " + id;
      if (INDEX[key]) used.add(key);
      else if (!Object.keys(INDEX).some((k) => k.startsWith(key + "-"))) problems.push(`${where}: no such AIM paragraph ${id}`);
    } else if (t.kind === "text" && !PLAIN.test(t.label)) {
      problems.push(`${where}: unlinked text "${t.label}"`);
    }
  });
}

// oral bank
Q.forEach((q) => {
  if (q.ref) check(`oral ${q.id}`, q.ref); else missing.oral.push(q.id);
  (q.fu || []).forEach((f) => { if (f.ref) check(`oral ${f.id}`, f.ref); });
});
// stage 1 — every object that carries a ref; quiz questions and recall items should
function walk(x, where) {
  if (Array.isArray(x)) return x.forEach((y, k) => walk(y, where));
  if (!x || typeof x !== "object") return;
  if (typeof x.ref === "string") check(where, x.ref);
  Object.entries(x).forEach(([k, v]) => { if (v && typeof v === "object") walk(v, where); });
}
Object.entries(T).forEach(([id, t]) => {
  walk(t, `stage1 ${id}`);
  t.drill.forEach((a) => {
    if (a.type === "quiz") a.qs.forEach((q) => { if (!q.ref) missing.stage1.push(`${id} quiz: ${q.q.slice(0, 60)}`); });
    if (a.type === "recall") (a.items || []).forEach((q) => { if (!q.ref && !a.ref) missing.stage1.push(`${id} recall: ${q.q.slice(0, 60)}`); });
    if (["acronym", "match", "sort", "inop"].includes(a.type) && !a.ref) missing.stage1.push(`${id} ${a.type}: ${(a.title || a.word || "").replace(/<[^>]+>/g, "").slice(0, 60)}`);
  });
  t.learn.forEach((b) => { if (!b.ref && !b.widget) missing.stage1.push(`${id} learn: ${b.h.slice(0, 60)}`); });
});
S.forEach((s) => { walk(s, `stage1 sys ${s.id}`); (s.qs || []).forEach((q) => { if (!q.ref) missing.stage1.push(`sys ${s.id} quiz: ${q.q.slice(0, 60)}`); }); if (!s.ref) missing.stage1.push(`sys ${s.id} (system ref)`); });

console.log(`problems: ${problems.length}`);
problems.forEach((p) => console.log("  " + p));
console.log(`oral questions without ref: ${missing.oral.length}`);
console.log(`stage 1 items without ref: ${missing.stage1.length}`);
if (process.argv.includes("--missing")) missing.stage1.forEach((m) => console.log("  " + m));

if (process.argv.includes("--write")) {
  const titles = {};
  [...used].sort().forEach((k) => { titles[k] = INDEX[k]; });
  fs.writeFileSync(path.join(root, "js/reftitles.js"),
    "/* GENERATED by tools/refs-check.js --write — the FAA's own titles for every 14/49 CFR\n" +
    "   section and AIM paragraph the app cites (eCFR structure API, AIM html contents).\n" +
    "   Don't edit by hand; fix the ref and regenerate. */\n" +
    "const REF_TITLES = " + JSON.stringify(titles, null, 0).replace(/","/g, '",\n  "').replace(/^\{/, "{\n  ").replace(/\}$/, "\n}") + ";\n");
  console.log(`wrote js/reftitles.js (${used.size} titles)`);
}
process.exitCode = problems.length ? 1 : 0;
