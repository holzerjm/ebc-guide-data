#!/usr/bin/env node
/* Checks every outbound link in the data and reports what looks broken.
 * A report, never a gate: bot protection and flaky sites would otherwise fail the build for no reason.
 *   node scripts/linkcheck.mjs <city>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const core = createRequire(import.meta.url)(join(HERE, "..", "lib", "validate-core.js"));
/* A required argument, not a default: a default is exactly how a two-city repo ends up link-checking one
   city forever. */
const CITY = core.cityFor(process.argv[2]);
if (!CITY) { console.error(`usage: node scripts/linkcheck.mjs <${core.cityKeys().join("|")}>`); process.exit(2); }
const file = join(HERE, "..", CITY.dataPath);
const D = core.parseDataJs(readFileSync(file, "utf8")).data;

const targets = [];
for (const [sk, sec] of Object.entries(D.sections || {}))
  for (const it of sec.items || [])
    for (const u of [it.website, ...(it.links || []).map((l) => l && l.url)].filter(Boolean))
      targets.push({ where: `${sk} › ${it.name}`, url: String(u) });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
async function check(t) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(t.url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA } });
    const landed = new URL(r.url).hostname.replace(/^www\./, "");
    const asked = new URL(t.url).hostname.replace(/^www\./, "");
    if (r.status === 403 || r.status === 429) return { ...t, kind: "blocked", note: `HTTP ${r.status} — bot protection, check by hand` };
    if (!r.ok) return { ...t, kind: "dead", note: `HTTP ${r.status}` };
    if (landed.split(".").slice(-2).join(".") !== asked.split(".").slice(-2).join("."))
      return { ...t, kind: "moved", note: `redirects to ${landed}` };
    return { ...t, kind: "ok" };
  } catch (e) { return { ...t, kind: "dead", note: e.name === "AbortError" ? "timed out" : e.message }; }
  finally { clearTimeout(timer); }
}

const results = [];
for (let i = 0; i < targets.length; i += 6)
  results.push(...await Promise.all(targets.slice(i, i + 6).map(check)));

const by = (k) => results.filter((r) => r.kind === k);
console.log(`${CITY.label}: ${results.length} links checked · ${by("ok").length} fine · ${by("dead").length} broken · ${by("moved").length} moved · ${by("blocked").length} could not be checked`);
for (const k of ["dead", "moved", "blocked"]) {
  if (!by(k).length) continue;
  console.log(`\n${k.toUpperCase()}`);
  for (const r of by(k)) console.log(`  ${r.where} — ${r.url} (${r.note})`);
}
