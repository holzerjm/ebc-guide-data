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

## If the bot stops opening pull requests

It needs a token that is not `GITHUB_TOKEN`, because pull requests opened with that one do not trigger the
checks. Configure either a GitHub App (`EBC_APP_ID` + `EBC_APP_PRIVATE_KEY`, Contents and Pull requests
read/write) or a fine-grained PAT (`EBC_BOT_PAT`) in the repository's Actions secrets. Without one it still
drafts the entry and tells you on the issue that a human needs to open the pull request.
