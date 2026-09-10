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

For a *Report a change* issue there is no bot: edit `boston/data.json` in the GitHub web editor, which
opens a pull request for you.

## When the checks are red

That is usually the bot telling you something it could not decide:

| Message | What to do |
|---|---|
| `coordinates (0, 0) are outside the Boston area` | The address did not geocode. Look the place up and put the real coordinates in. |
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
2. **GitHub App name**: `ebc-guide-bot` · **Homepage URL**: this repository's URL
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

**Check it works:** open a test issue with the *Suggest a place* form, add the `bot:draft` label, and watch
the Actions tab. Within a minute a draft pull request should appear and the bot should comment the link on
the issue. Close the issue and delete the branch afterwards.

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

### 3. Optional, if suggestions ever get spammy

*Settings → Moderation → Interaction limits* throttles new or unknown accounts for up to six months.
*Settings → Features → Issues* can be set to collaborators only, but that shuts out the customers and
partners who know the city best — a last resort, not a first one.

## If the bot stops opening pull requests

Check the secrets above still exist and the app is still installed on this repository. A fine-grained PAT
expires; an app's token does not.
