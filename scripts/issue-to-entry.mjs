#!/usr/bin/env node
/* Turns a "Suggest a place" issue into a draft entry in boston/data.json.
 *
 * Run by .github/workflows/suggest-to-pr.yml, only after a maintainer applies the bot:draft label.
 * Test locally with:
 *   GITHUB_EVENT_PATH=event.json RUNNER_TEMP=$(mktemp -d) node scripts/issue-to-entry.mjs
 *
 * SECURITY MODEL — do not weaken:
 *   - The issue body is written by anyone on the internet. It is read from the event payload FILE, never
 *     interpolated through a shell or through ${{ }}, and nothing in it is ever executed.
 *   - Every value reaches data.json through JSON.stringify, so it cannot escape into surrounding syntax.
 *   - The guide itself does not trust this file either: app.js constrains colours, coordinates and metadata
 *     at render time. This script is a convenience, not a security boundary.
 *   - It writes only boston/data.json and report files under RUNNER_TEMP.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const core = createRequire(import.meta.url)(join(ROOT, "lib", "validate-core.js"));
const TMP = process.env.RUNNER_TEMP || ROOT;
const DATA = join(ROOT, "boston", "data.json");
const BBOX = { latMin: 42.20, latMax: 42.45, lngMin: -71.25, lngMax: -70.90 };

/* ---------- inputs ---------- */
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue || {};
const N = issue.number;
const submitter = (issue.user && issue.user.login) || "unknown";

function out(k, v) { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); else console.log(`${k}=${v}`); }
function stop(status, comment) {
  writeFileSync(join(TMP, "issue-comment.md"), comment);
  out("status", status);
  console.log(`status=${status}`);
  console.log(comment);
  process.exit(0); /* a suggestion we cannot draft is not a build failure */
}

/* ---------- parse the issue form ("### Label" then the value) ---------- */
function parseForm(text) {
  const fields = {};
  for (const part of String(text || "").split(/^### +/m).slice(1)) {
    const nl = part.indexOf("\n");
    if (nl === -1) continue;
    const label = part.slice(0, nl).trim();
    let value = part.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    fields[label] = value;
  }
  return fields;
}
const form = parseForm(issue.body);
const get = (label) => String(form[label] || "").trim();
const checked = (label) => (form[label] || "").split("\n")
  .map((l) => l.match(/^- \[[xX]\] (.+)$/)).filter(Boolean).map((m) => m[1].trim());

/* ---------- the data, and this section's vocabulary ---------- */
const parsed = core.parseDataJs(readFileSync(DATA, "utf8"));
if (parsed.error) { console.error("boston/data.json did not parse: " + parsed.error); process.exit(1); }
const D = parsed.data;

const SECTION_BY_LABEL = {};
for (const [key, sec] of Object.entries(D.sections)) SECTION_BY_LABEL[String(sec.label).toLowerCase()] = key;

const sectionLabel = get("Which part of the guide?");
const sectionKey = SECTION_BY_LABEL[sectionLabel.toLowerCase()];
if (!sectionKey) stop("parse_failed", `I could not tell which part of the guide this belongs in (I read "${sectionLabel}"). A maintainer can add it by hand.`);
const sec = D.sections[sectionKey];

const name = get("Name");
const address = get("Street address");
let website = get("Official website");
const blurb = get("One sentence a visitor would find useful");
const missing = [["a name", name], ["a street address", address], ["a website", website], ["a one-sentence description", blurb]]
  .filter(([, v]) => !v).map(([l]) => l);
if (missing.length) stop("parse_failed", `This suggestion is missing ${missing.join(", ")}, so I could not draft it. Editing the issue and re-applying the \`bot:draft\` label will make me try again.`);

if (/^http:\/\//i.test(website)) website = website.replace(/^http:/i, "https:");
if (!/^https:\/\/[^\s"'<>\\]+$/.test(website)) stop("parse_failed", `"${website}" does not look like a website address I can use. It needs to be a plain https:// link.`);

/* category and tags must be this section's own vocabulary */
const catKey = Object.entries(sec.categories)
  .find(([k, c]) => [k, String(c.label)].some((s) => s.toLowerCase() === get("Category").toLowerCase()))?.[0];
const tagKeys = checked("Good for…")
  .map((label) => Object.entries(sec.tagLabels || {}).find(([, l]) => String(l).toLowerCase() === label.toLowerCase())?.[0])
  .filter(Boolean);

/* ---------- id ---------- */
const slug = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30).replace(/-$/, "");
const allItems = Object.values(D.sections).flatMap((s) => s.items);
if (allItems.some((it) => String(it.name).toLowerCase() === name.toLowerCase())) {
  stop("duplicate", `**${name}** is already in the guide. If something about it is wrong or it has closed, the *Report a change* form is the right one.`);
}
let id = slug(name) || "place";
if (allItems.some((it) => it.id === id)) { let n = 2; while (allItems.some((it) => it.id === `${id}-${n}`)) n++; id = `${id}-${n}`; }

/* ---------- geocode (one request, identified, bounded) ---------- */
async function geocode(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
    encodeURIComponent(/\b(MA|Massachusetts)\b/i.test(q) ? q : q + ", Massachusetts");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "ebc-guide-bot/1.0 (github.com/holzerjm/ebc-guide-data)", "Accept": "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || !j[0]) return null;
    const lat = +(+j[0].lat).toFixed(5), lng = +(+j[0].lon).toFixed(5);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < BBOX.latMin || lat > BBOX.latMax || lng < BBOX.lngMin || lng > BBOX.lngMax) return { lat, lng, outside: true };
    return { lat, lng, outside: false };
  } catch { return null; } finally { clearTimeout(timer); }
}
const pin = await geocode(address);

/* ---------- build the entry ---------- */
const priceRaw = get("Price (Eat & Drink only)");
const entry = { id, name, cat: catKey || get("Category") };
const kind = get("In a few words, what is it?"); if (kind) entry.kind = kind;
if (sec.hasPrice && /^\$+$/.test(priceRaw)) entry.price = priceRaw;
const phone = get("Phone"); if (phone) entry.phone = phone;
entry.website = website;
const hours = get("Opening hours"); if (hours) entry.hours = hours;
entry.address = address;
entry.lat = pin ? pin.lat : 0;
entry.lng = pin ? pin.lng : 0;
entry.tags = tagKeys;
entry.blurb = blurb;
entry.addedOn = new Date(event.repository?.pushed_at || Date.now()).toISOString().slice(0, 10);

sec.items.push(entry);
D.meta.updatedAt = entry.addedOn;
D.meta.updatedBy = `Suggested in #${N}`;

/* ---------- validate, then write ---------- */
const res = core.validate(D);
writeFileSync(DATA, JSON.stringify(D, null, 2) + "\n");

const problems = res.errors.map((e) => `- ${e.where} — ${e.msg}`);
const pinNote = !pin
  ? "**The address could not be geocoded**, so the pin is at 0,0 and the checks will fail on purpose. Drop the right coordinates in before merging."
  : pin.outside
    ? `**The geocoder put this outside Greater Boston** (${pin.lat}, ${pin.lng}). Check the address before merging.`
    : `Pin placed at ${pin.lat}, ${pin.lng} from the address (OpenStreetMap / Nominatim). Worth a glance on the map.`;

writeFileSync(join(TMP, "pr-title.txt"), `[Suggestion] ${name}`.replace(/[\r\n]+/g, " ").slice(0, 200));
writeFileSync(join(TMP, "pr-body.md"), [
  `Drafted from #${N}, suggested by @${submitter}.`,
  "",
  "| | |",
  "|---|---|",
  `| Section | ${sec.label} |`,
  `| Category | ${catKey ? `\`${catKey}\`` : `**not recognised** — they wrote "${get("Category")}"`} |`,
  `| Id | \`${id}\` |`,
  `| Tags | ${tagKeys.length ? tagKeys.map((t) => `\`${t}\``).join(" ") : "none"} |`,
  "",
  pinNote,
  "",
  problems.length ? `### The checks currently fail\n${problems.join("\n")}` : "### The data validates cleanly",
  "",
  "### Before merging",
  "- [ ] The place exists, is open, and the website is its own",
  "- [ ] Address, hours and phone match that website",
  "- [ ] The pin is in the right spot",
  "- [ ] The description reads like the rest of the guide — factual, no marketing",
  "- [ ] Category and tags are right for this section",
  "",
  `Closes #${N}`,
].join("\n"));

out("status", "ok");
out("id", id);
out("branch", `suggestion/issue-${N}`);
console.log(`Drafted ${id} into ${sectionKey}. Validation: ${res.errors.length} errors, ${res.warnings.length} warnings.`);
