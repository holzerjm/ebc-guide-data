#!/usr/bin/env node
/* Checks a data file before it can be merged.
 *
 *   node scripts/guard.mjs <data.json> [baseline.json]
 *
 * Always: the schema must validate with no errors.
 * With a baseline (on a pull request, the copy from the target branch), two extra gates:
 *   - an entry may not disappear. Venue ids are embedded in customers' shared itinerary links, so a
 *     removal silently drops a stop from an itinerary that was already sent.
 *   - a website may not move to a different domain. That turns a Red Hat-hosted page into a link to
 *     somewhere else, which no amount of output escaping would catch.
 * Either gate can be waived for one pull request with a label: allow-removal, url-change.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const core = createRequire(import.meta.url)(join(HERE, "..", "lib", "validate-core.js"));

const [file, baselineFile] = process.argv.slice(2);
if (!file) { console.error("usage: node scripts/guard.mjs <data.json> [baseline.json]"); process.exit(2); }
const truthy = (v) => /^(1|true|yes)$/i.test(String(v || ""));
const allowRemoval = truthy(process.env.ALLOW_REMOVAL);
const allowUrlChange = truthy(process.env.ALLOW_URL_CHANGE);

function load(path) {
  const parsed = core.parseDataJs(readFileSync(path, "utf8"));
  if (parsed.error) { console.error(`${path}: ${parsed.error}`); process.exit(1); }
  return parsed.data;
}

const data = load(file);
let failed = false;

/* ---- schema ---- */
const res = core.validate(data);
console.log(`${res.stats.items} entries across ${res.stats.sections} sections · ${res.errors.length} errors · ${res.warnings.length} warnings`);
for (const w of res.warnings) console.log(`  warning: ${w.where} — ${w.msg}`);
for (const e of res.errors) console.error(`  ERROR: ${e.where} — ${e.msg}`);
if (res.errors.length) failed = true;

/* ---- gates that need something to compare against ---- */
if (baselineFile) {
  const base = load(baselineFile);
  const d = core.diff(base, data);
  console.log(`Versus the baseline: ${d.added.length} added · ${d.changed.length} changed · ${d.removed.length} removed`);
  for (const a of d.added) console.log(`  + ${a.sec} › ${a.name} (${a.id})`);
  for (const c of d.changed) console.log(`  ~ ${c.sec} › ${c.name} (${c.id}) — ${c.fields.join(", ")}`);

  if (d.removed.length) {
    for (const r of d.removed) console.log(`  - ${r.sec} › ${r.name} (${r.id})`);
    if (allowRemoval) console.log("  Removals allowed for this change (allow-removal).");
    else {
      console.error(`  ERROR: ${d.removed.length} entr${d.removed.length === 1 ? "y is" : "ies are"} removed. Their ids may appear in itineraries customers already have. Add the 'allow-removal' label if that is intended.`);
      failed = true;
    }
  }

  /* registrable domain of every outbound URL, before and after */
  const domains = (D) => {
    const out = new Map();
    for (const [sk, sec] of Object.entries(D.sections || {})) {
      for (const it of sec.items || []) {
        const urls = [it.website, ...(it.links || []).map((l) => l && l.url)].filter(Boolean);
        for (const u of urls) {
          let host = "";
          try { host = new URL(String(u)).hostname.toLowerCase().replace(/^www\./, ""); } catch { host = "(unparsable)"; }
          const key = `${sk}/${it.id}`;
          if (!out.has(key)) out.set(key, new Set());
          out.get(key).add(host.split(".").slice(-2).join("."));
        }
      }
    }
    return out;
  };
  const before = domains(base), after = domains(data);
  const moved = [];
  for (const [key, hosts] of after) {
    const was = before.get(key);
    if (!was) continue; /* a new entry is not a domain change */
    for (const h of hosts) if (!was.has(h)) moved.push(`${key}: ${[...was].join(", ")} → ${h}`);
  }
  if (moved.length) {
    for (const m of moved) console.log(`  ! outbound domain changed — ${m}`);
    if (allowUrlChange) console.log("  Domain changes allowed for this change (url-change).");
    else {
      console.error(`  ERROR: ${moved.length} outbound link(s) now point at a different domain. Check each one, then add the 'url-change' label.`);
      failed = true;
    }
  }
}

console.log(failed ? "FAILED" : "OK");
process.exit(failed ? 1 : 0);
