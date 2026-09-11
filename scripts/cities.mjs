#!/usr/bin/env node
/* The city registry, on the command line — and the check that every per-city convention actually holds.
 *
 *   node scripts/cities.mjs --list     one key per line, for cities that HAVE <city>/data.json (loop driver)
 *   node scripts/cities.mjs --all      every registered key, present or pending
 *   node scripts/cities.mjs --json     the registry itself
 *   node scripts/cities.mjs --check    every assertion below; exits 1 listing what is wrong
 *
 * WHY THIS EXISTS: adding a city touches a data file, two issue templates, a label and a dispatch option.
 * Every one of those is a convention someone has to remember, and forgetting one fails quietly — a form
 * that offers a category the bot cannot resolve, or a city with no front door. --check turns the whole
 * checklist into something CI runs. The registry lives in lib/validate-core.js (under CODEOWNERS) so a
 * pull request cannot widen a bounding box and pass its own check.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const core = createRequire(import.meta.url)(join(ROOT, "lib", "validate-core.js"));
const TPL = join(ROOT, ".github", "ISSUE_TEMPLATE");

const has = (k) => existsSync(join(ROOT, core.cityFor(k).dataPath));
const present = () => core.cityKeys().filter(has);
const mode = process.argv[2] || "--list";

/* ---------- the formatting contract the templates must follow ----------
   Deliberately a line scanner, not a YAML parser: no dependencies, and the thing being checked is the
   rendered label text, which is exactly what parseForm in issue-to-entry.mjs keys on. */
function blockAfter(lines, labelRe) {
  const i = lines.findIndex((l) => labelRe.test(l));
  if (i < 0) return null;
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s*- type:/.test(lines[j])) break;
    out.push(lines[j]);
  }
  return out;
}
const pick = (lines, re) => (lines || []).map((l) => re.exec(l)).filter(Boolean);
const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

function checkCity(key, problems) {
  const city = core.cityFor(key);
  const say = (m) => problems.push(`${key}: ${m}`);

  const dataFile = join(ROOT, city.dataPath);
  const parsed = core.parseDataJs(readFileSync(dataFile, "utf8"));
  if (parsed.error) { say(`${city.dataPath} did not parse — ${parsed.error}`); return; }
  const D = parsed.data;

  /* B1 — the file says which city it is */
  if (!D.meta || D.meta.city !== key) say(`${city.dataPath} must carry "city": "${key}" in meta (found ${JSON.stringify(D.meta && D.meta.city)}).`);

  /* B2/B3 — a front door for this city, labelled so the bot can route it */
  for (const kind of ["suggest", "flag"]) {
    const f = join(TPL, `${kind}-place-${key}.yml`);
    if (!existsSync(f)) { say(`.github/ISSUE_TEMPLATE/${kind}-place-${key}.yml is missing — this city has no ${kind === "suggest" ? "suggestion" : "report"} form.`); continue; }
    const text = readFileSync(f, "utf8");
    const labels = /^labels:.*$/m.exec(text);
    if (!labels || !labels[0].includes(`city:${key}`)) say(`${kind}-place-${key}.yml: its labels: line must include city:${key}, or the bot cannot tell which guide the issue is for.`);
  }

  /* B4 — announce.yml can be run by hand for this city */
  const ann = readFileSync(join(ROOT, ".github", "workflows", "announce.yml"), "utf8");
  if (!new RegExp(`^\\s*-\\s*${key}\\s*$`, "m").test(ann) && !new RegExp(`options:.*\\b${key}\\b`).test(ann))
    say(`announce.yml does not offer "${key}" as a workflow_dispatch option, so its Slack post cannot be tested by hand.`);

  /* B5-B8 — the suggestion form must only advertise vocabulary this city's data actually has.
     All three source designs invented Raleigh category names that do not exist; a form that advertises a
     category the matcher cannot resolve produces a pull request marked "not recognised" every time. */
  const sf = join(TPL, `suggest-place-${key}.yml`);
  if (!existsSync(sf)) return;
  const lines = readFileSync(sf, "utf8").split("\n");

  const secLabels = Object.values(D.sections).map((s) => String(s.label));
  const secOpts = pick(blockAfter(lines, /label: Which part of the guide\?/), /^\s+- "(.+)"$/).map((m) => m[1]);
  if (!secOpts.length) say(`suggest-place-${key}.yml: could not find the "Which part of the guide?" options — check the formatting contract in this script.`);
  for (const o of secOpts) if (!secLabels.some((l) => eq(l, o))) say(`suggest-place-${key}.yml offers section "${o}", which is not a section label in ${city.dataPath} (${secLabels.join(", ")}).`);

  const tagVals = new Set(Object.values(D.sections).flatMap((s) => Object.values(s.tagLabels || {}).map(String)));
  const tagOpts = pick(blockAfter(lines, /label: Good for…/), /^\s+- label: "(.+)"$/).map((m) => m[1]);
  for (const t of tagOpts) if (![...tagVals].some((v) => eq(v, t))) say(`suggest-place-${key}.yml offers "Good for… ${t}", which is not a tagLabels value in ${city.dataPath}.`);

  for (const m of pick(lines, /^\s+• \*\*(.+?)\*\* — (.+)$/)) {
    const secKey = Object.keys(D.sections).find((k) => eq(D.sections[k].label, m[1]));
    if (!secKey) { say(`suggest-place-${key}.yml lists categories under "${m[1]}", which is not a section in ${city.dataPath}.`); continue; }
    const catLabels = Object.values(D.sections[secKey].categories).map((c) => String(c.label));
    for (const c of m[2].split(" · ")) if (!catLabels.some((l) => eq(l, c))) say(`suggest-place-${key}.yml offers category "${c}" under ${m[1]}, which is not a category label there (${catLabels.join(", ")}).`);
  }

  if (!lines.some((l) => /^\s+label: Price\s*$/.test(l))) say(`suggest-place-${key}.yml has no field labelled exactly "Price" — issue-to-entry.mjs keys on the rendered label, so the price would be dropped silently.`);
}

if (mode === "--list") { console.log(present().join("\n")); }
else if (mode === "--all") { console.log(core.cityKeys().join("\n")); }
else if (mode === "--json") { console.log(JSON.stringify(core.cities, null, 2)); }
else if (mode === "--check") {
  const problems = [];

  /* A — a data folder nobody registered would be validated by nothing at all */
  for (const d of readdirSync(ROOT, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    if (!existsSync(join(ROOT, d.name, "data.json"))) continue;
    if (!core.cityFor(d.name)) problems.push(`${d.name}/data.json is not a registered city — add it to CITIES in lib/validate-core.js, or remove the folder.`);
  }

  for (const k of core.cityKeys()) {
    if (has(k)) checkCity(k, problems);
    else console.log(`  ${k}: pending — registered, no ${core.cityFor(k).dataPath} yet.`);
  }

  if (problems.length) {
    console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`OK — ${present().length} city/cities consistent: ${present().join(", ")}`);
} else {
  console.error("usage: node scripts/cities.mjs [--list|--all|--json|--check]");
  process.exit(2);
}
