#!/usr/bin/env node
/* Says what a merge changed, in the job summary and (if configured) in Slack.
 *
 *   node scripts/announce.mjs <city> <new.json> [old.json]
 *
 * Merging here publishes to the live guide within about five minutes, and nothing else announces it.
 * Without SLACK_WEBHOOK_URL set this still writes the summary and exits 0, so the workflow is harmless
 * before the secret exists.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const core = createRequire(import.meta.url)(join(HERE, "..", "lib", "validate-core.js"));
const [cityKey, newFile, oldFile] = process.argv.slice(2);
const CITY = core.cityFor(cityKey);
if (!CITY || !newFile) { console.error(`usage: node scripts/announce.mjs <${core.cityKeys().join("|")}> <new.json> [old.json]`); process.exit(2); }
const GUIDE = CITY.guideUrl;

const load = (p) => { const r = core.parseDataJs(readFileSync(p, "utf8")); if (r.error) throw new Error(`${p}: ${r.error}`); return r.data; };
let now;
try { now = load(newFile); } catch (e) { console.error(String(e.message)); process.exit(1); }
/* Say nothing rather than something wrong: if the file disagrees about which city it is, we genuinely do
   not know which guide changed. The step is continue-on-error, so this is a red step in a green run. */
const rc = core.resolveCity(now, CITY.key);
if (rc.error) { console.error(`::error::${newFile}: ${rc.error}`); process.exit(1); }
/* No usable baseline (first commit, a force push, a missing file) is not a failure — announce without a diff. */
let before = null;
if (oldFile) { try { before = load(oldFile); } catch { console.log(`No usable baseline at ${oldFile} — reporting the total only.`); } }

const total = Object.values(now.sections).reduce((n, s) => n + s.items.length, 0);
const d = before ? core.diff(before, now) : { added: [], changed: [], removed: [] };
const name = (x) => x.name;

/* A hand-started run has no merge behind it, so say that plainly rather than posting "no entry changed"
   into a channel where it reads like something went wrong. */
const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
const lines = [];
if (d.added.length) lines.push(`*Added:* ${d.added.map(name).join(", ")}`);
if (d.removed.length) lines.push(`*Removed:* ${d.removed.map(name).join(", ")}`);
if (d.changed.length) lines.push(`*Updated:* ${d.changed.map((c) => `${c.name} (${c.fields.join(", ")})`).join(" · ")}`);
if (!lines.length) lines.push(manual ? "_Test message, started by hand from the Actions tab — nothing changed._" : "_No entry changed — metadata only._");

const headline = manual ? `${CITY.label} guide — ${total} places live (test)` : `${CITY.label} guide updated — ${total} places live`;
const detail = lines.join("\n");
const commit = process.env.GITHUB_SHA ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/commit/${process.env.GITHUB_SHA}` : "";
const short = (process.env.GITHUB_SHA || "").slice(0, 7);

/* the job summary is free and always useful */
const summary = `## ${headline}\n\n${detail}\n\nVisitors see this within about five minutes: ${GUIDE}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

/* One channel today. If a city ever needs its own, add SLACK_WEBHOOK_URL_<CITY> as a repository secret —
   no code change; an unset per-city variable falls straight through to the shared webhook. */
const hook = process.env["SLACK_WEBHOOK_URL_" + CITY.key.toUpperCase().replace(/-/g, "_")]
          || process.env.SLACK_WEBHOOK_URL;
if (!hook) { console.log("SLACK_WEBHOOK_URL is not set — nothing posted to Slack."); process.exit(0); }

const payload = {
  text: headline,
  blocks: [
    { type: "header", text: { type: "plain_text", text: "🍽️  " + headline, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: detail } },
    { type: "context", elements: [{ type: "mrkdwn", text: `<${GUIDE}|Open the guide> · live in ~5 min${commit ? ` · <${commit}|\`${short}\`>` : ""}` }] },
  ],
};
const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
  .catch((e) => { console.log(`::warning::Could not reach Slack: ${e.message}`); return null; });
if (res && !res.ok) console.log(`::warning::Slack returned HTTP ${res.status}: ${await res.text()}`);
else if (res) console.log("Posted to Slack.");
