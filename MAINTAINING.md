# Maintaining the guide's data

## The short version

Merging is publishing. When a change lands on `main`, the guide picks it up within about five minutes —
there is nothing to copy to a server.

## An issue arrives

1. **Read it.** Is the place real, open, and somewhere a visiting customer would plausibly go? Does the
   website belong to the place itself?
2. **Let the bot draft it.** Add the **`bot:draft`** label. Within a minute it opens a draft pull request
   with the entry filled in, the address geocoded and the checks run, and comments the link on the issue.
   - The label is the gate on purpose: text from the internet is not parsed, geocoded or handed a token
     until you ask for it.
   - If the submitter edits the issue, remove and re-add the label to run it again.
   - If it cannot draft the suggestion it says why on the issue instead.
3. **Review the pull request** using its checklist. The things worth actually opening a browser for: the
   place exists and is open, the hours match its own website, and the pin is in the right spot.
4. **Merge.** Mark it ready for review first — the bot opens drafts deliberately.

For a *Report a change* issue there is no bot: edit that city's `data.json` in the GitHub web editor, which
opens a pull request for you.

## Two cities

Each guide has its own directory (`boston/`, `raleigh/`), its own pair of issue forms, and its own row in the
`CITIES` registry in `lib/validate-core.js` — bounding box, section list, state name, guide URL.

**The `city:<key>` label is what routes the bot.** The issue templates apply it, and only someone with triage
rights can change it. The bot reads it from the event payload and never from the issue body, so the value that
picks a file on disk cannot be set by a stranger. An issue with no `city:` label, or two of them, gets a polite
comment instead of a draft — re-label and re-apply `bot:draft`.

If you change a suggestion's city label and re-draft, **close the superseded pull request by hand**. The
token-holding job deliberately does no mutating GitHub work beyond opening the one PR.

A merge touching both cities posts **two** Slack messages. That is correct, not a fault.

`SLACK_WEBHOOK_URL_BOSTON` / `SLACK_WEBHOOK_URL_RALEIGH` are optional per-city overrides. Neither is set;
both fall through to the shared `SLACK_WEBHOOK_URL`.

### Adding a city

1. Add a row to `CITIES` in `lib/validate-core.js` — key, label, area, state, stateAbbr, bbox, canon, dataPath,
   rawUrl, guideUrl. Re-copy that file into each guide repo so all copies stay byte-identical.
2. Create the `city:<key>` label by hand in *Issues → Labels*. Do not rely on a form auto-creating it.
3. Add `<key>/data.json` with `"city": "<key>"` in its `meta`.
4. Add `suggest-place-<key>.yml` and `flag-place-<key>.yml`, both carrying `city:<key>` in `labels:`.
   The suggestion form may only offer sections, categories and tags that city's data actually has.
5. Add `<key>` to the `workflow_dispatch` options in `.github/workflows/announce.yml`.
6. Run `node scripts/cities.mjs --check`. It fails, by name, on every one of the above you skipped.

## When the checks are red

That is usually the bot telling you something it could not decide:

| Message | What to do |
|---|---|
| `coordinates (0, 0) are outside the … area` | The address did not geocode. Look the place up and put the real coordinates in. |
| `This file says meta.city X but it is being checked as Y` | An entry landed in the wrong city's file. Move it, do not change `meta.city`. |
| `X/data.json must carry "city": "X"` | The key was dropped, usually by a hand export. Put it back. |
| `Nothing matched this address inside the … area` | The geocoder found the address, but elsewhere. Check the address **and** the city label. |
| `cat "…" is not one of this section's categories` | The submitter invented a category. Pick the closest real one. |
| `N entries are removed` | Intended? Add `allow-removal`. If not, restore them. |
| `outbound link(s) now point at a different domain` | Check where it goes. If it is right, add `url-change`. |
| `color "…" is not a hex value` | Someone is trying something. Do not merge it. |

## Things that are deliberate

- **The bot never publishes.** It only opens a draft pull request. Nothing reaches the guide without a merge.
- **The checks are a linter, not a security control.** A pull request can edit the data, the validator and
  the workflow together, so a green tick is not proof of safety. The rules that actually protect visitors —
  hex-only colours, numeric coordinates, prototype-safe sections — live in the guide's own `app.js`, in a
  repository contributors cannot touch. Read the pull request; do not just trust the tick.
- **`CODEOWNERS` covers `.github/`, `lib/` and `scripts/`** so a change to the checks themselves needs review.
- **`meta.version` is not enforced here.** It is left over from when data was copied to the server by hand,
  and the editor still uses it to notice concurrent edits. Two suggestion pull requests can conflict on the
  `meta` lines; re-run the bot on the later one after merging the first.

## Once a month

The **Monthly health check** action lists broken and redirected links and writes the report to the `health`
branch. Run it any time from the Actions tab. Fixing a dead link is the highest-value ten minutes available:
a wrong link on a Red Hat-branded guide is worse than a missing entry.

## First-time setup

Two things need doing once. Until the first is done the bot drafts entries but cannot open pull requests —
it says so on the issue instead of failing silently.

### 1. Give the bot a token

It must be a GitHub App token or a fine-grained PAT, **not** `GITHUB_TOKEN`: pull requests opened with
`GITHUB_TOKEN` do not trigger the checks, and an unchecked pull request must never be mergeable.

**If you already have a bot App** (the Boston AI Atlas uses one):

1. <https://github.com/settings/installations> → the app → **Configure**
2. Under **Repository access**, add `ebc-guide-data` → **Save**
3. Confirm under **Permissions** that it has *Contents: Read and write* and *Pull requests: Read and write*
4. You need the private key file to store as a secret. GitHub cannot show you an existing one, so if you no
   longer have the `.pem`, open the app's settings → **Private keys** → **Generate a private key**. An app
   can hold several; generating one does not invalidate the old.

**Or create a new app:**

1. <https://github.com/settings/apps/new>
2. **GitHub App name**: `ebc-guide-bot` · **Homepage URL**: `https://github.com/holzerjm/ebc-guide-data`
   (required, but cosmetic — it is only a link on the app's own page and affects nothing)
3. Under **Webhook**, untick **Active** — the app never receives events
4. **Repository permissions** → *Contents*: **Read and write** · *Pull requests*: **Read and write**.
   Leave everything else at *No access*
5. **Where can this GitHub App be installed?** → *Only on this account*
6. **Create GitHub App**, then note the **App ID** shown at the top
7. Scroll to **Private keys** → **Generate a private key** (a `.pem` downloads)
8. Sidebar → **Install App** → install on your account → *Only select repositories* → `ebc-guide-data`

**Then store both as repository secrets**, at
*Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Value |
|---|---|
| `EBC_APP_ID` | the numeric App ID |
| `EBC_APP_PRIVATE_KEY` | the **entire** `.pem` file, including the `-----BEGIN…` and `-----END…` lines |

A fine-grained PAT works too — store it as `EBC_BOT_PAT` instead, scoped to this repository with Contents
and Pull requests read/write. An app is better: its token is short-lived and it does not expire on a date.

**Check it works** without filing a fake suggestion: *Actions → Verify bot token → Run workflow*. It mints a
token exactly the way the bot does and proves it can write, then cleans up after itself. If it fails it
prints what to fix. The most common one:

| Error | Cause |
|---|---|
| `Integration must generate a public key` | The App ID and the private key are from **different apps**, or that app has no key. Both secrets must come from the same app's settings page — App ID at the top, **Private keys** further down. |
| `A JSON web token could not be decoded` | `EBC_APP_PRIVATE_KEY` is not the whole file. Paste the entire `.pem`, `-----BEGIN…` and `-----END…` lines included. |
| Mints, but `push=false pull=false` | The app is **not installed on this repository**. <https://github.com/settings/installations> → Configure → *Repository access* → add `ebc-guide-data`. |
| Mints, but `push=false pull=true` | Installed here, but missing a permission. Set *Contents* and *Pull requests* to **Read and write**, then **accept the new permissions on the installation** — GitHub shows a banner until you do, and the old token keeps the old scopes meanwhile. |

Once that passes, the real thing: open a test issue with the *Suggest a place* form, add `bot:draft`, and a
draft pull request should appear within a minute. Close the issue and delete the branch afterwards.

### 2. Protect `main`

The guide reads `main` directly, so anything that lands there is live within about five minutes. A ruleset
makes that deliberate: *Settings → Rules → Rulesets → New branch ruleset*.

- **Name** `main`, **Enforcement** Active, **Target** the default branch
- **Bypass list**: leave it empty — including yourself. That is the point
- Tick **Restrict deletions**, **Block force pushes**, and **Require a pull request before merging**
  (Required approvals: **0** — with one maintainer you cannot approve your own, and requiring it would
  deadlock you)
- Tick **Require status checks to pass** → add **`validate`**, and tick **Require branches to be up to date
  before merging**

With approvals at 0 you can still merge your own pull requests, but nothing reaches `main` without the
checks passing. Add a second maintainer later and raise approvals to 1.

The monthly health check is unaffected: it writes to the `health` branch, not `main`.

### 3. Tell the team when something changes

Merging here reaches customers in about five minutes and nothing announces it. To have merges post to Slack:

1. In Slack, create an **incoming webhook** for the channel you want (Slack → *Apps* → *Incoming Webhooks* →
   *Add to Slack* → pick the channel → copy the URL). It looks like `https://hooks.slack.com/services/…`.
2. Add it here as a repository secret named **`SLACK_WEBHOOK_URL`**
   (*Settings → Secrets and variables → Actions → New repository secret*).

To check it: *Actions → Announce a content change → Run workflow*. With no merge behind it there is
nothing to compare, so it reports the total and posts that — enough to prove the webhook works.

The workflow runs on every merge that touches a `<city>/data.json`; without the secret it writes its summary to the Actions run and posts nothing. The
message names what was added, removed or updated, and links to the guide. It never fails the build — a
broken webhook must not make a good merge look broken.

### 4. Optional, if suggestions ever get spammy

*Settings → Moderation → Interaction limits* throttles new or unknown accounts for up to six months.
*Settings → Features → Issues* can be set to collaborators only, but that shuts out the customers and
partners who know the city best — a last resort, not a first one.

## If the bot stops opening pull requests

Check the secrets above still exist and the app is still installed on this repository. A fine-grained PAT
expires; an app's token does not.
