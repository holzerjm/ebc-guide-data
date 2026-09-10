# EBC visitor guide — published data

This repository holds the venue data behind the Red Hat Executive Briefing Center visitor guide at
**https://people.redhat.com/jholzer/EBC/BostonVisitorGuide/** — the restaurants, bars, activities, hotels and travel
hubs the guide shows, with their addresses, opening hours, links and map positions.

It exists so the guide's content can be updated by merging a change here instead of copying a file to the web server.
Everything in `boston/data.json` is already published on the site itself; this repository is simply the place it is
edited and reviewed.

## Not an open-source project

There is deliberately **no licence file**. This repository is public so the data can be read and reviewed, and so the
guide can fetch it — not to offer it for reuse. The content is Red Hat's, and no rights to reuse, redistribute or adapt
it are granted here. If you want to use any of it, ask first.

The guide's own code is not here. It lives in a separate, private repository.

## What is in it

| Path | What it is |
|---|---|
| `boston/data.json` | The Boston guide's data — sections, categories and one object per venue |
| `lib/validate-core.js` | The validator. This repository is its home; the guide's own repository takes its copy from here |
| `scripts/guard.mjs` | The check that runs on every change (see below) |
| `.github/workflows/` | Continuous integration |

## Proposing a change

**No Git needed:** [suggest a place](../../issues/new?template=suggest-place.yml) or
[report a change](../../issues/new?template=flag-place.yml) with a form — a maintainer turns accepted
suggestions into a pull request, with the address geocoded for you.

**With Git:** open a pull request against `boston/data.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
entry format, and [MAINTAINING.md](MAINTAINING.md) if you are reviewing them. Every change is checked
automatically before it can merge:

- **The schema must validate.** Required fields, a category that exists, coordinates inside Greater Boston, `http(s)`
  links only, no HTML in text fields, and hex-only category colours.
- **An entry may not disappear.** Venue ids are embedded in the itinerary links customers are sent, so deleting an
  entry silently drops a stop from an itinerary somebody already has. Intentional removals need the `allow-removal`
  label.
- **A website may not move to a different domain** without the `url-change` label. Repointing a venue's link is the one
  data change that could send a customer somewhere unexpected, so it gets a human look.

To check a change before pushing:

```bash
node scripts/guard.mjs boston/data.json                      # schema only
node scripts/guard.mjs boston/data.json /path/to/previous.json   # and the comparison gates
```

Nothing published here reaches the live site on its own. A maintainer merges, and the guide picks the data up from
there.

## Accuracy

Every venue is checked against the establishment's own website before it is added, and the guide is corrected when
something closes or moves. If you spot something wrong, a pull request or an issue is welcome.
