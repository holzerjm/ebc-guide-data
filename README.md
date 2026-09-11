# EBC visitor guide — published data

This repository holds the venue data behind the Red Hat Executive Briefing Center visitor guides —
the restaurants, bars, activities, hotels and travel hubs each guide shows, with their addresses, opening
hours, links and map positions.

| Guide | Data |
|---|---|
| [Boston](https://people.redhat.com/jholzer/EBC/BostonVisitorGuide/) | `boston/data.json` |
| [Raleigh](https://people.redhat.com/jholzer/EBC/RaleighVisitorGuide/) | `raleigh/data.json` |

It exists so a guide's content can be updated by merging a change here instead of copying a file to the web
server. Everything in those files is already published on the sites themselves; this repository is simply the
place it is edited and reviewed.

## Not an open-source project

There is deliberately **no licence file**. This repository is public so the data can be read and reviewed, and so the
guide can fetch it — not to offer it for reuse. The content is Red Hat's, and no rights to reuse, redistribute or adapt
it are granted here. If you want to use any of it, ask first.

The guide's own code is not here. It lives in a separate, private repository.

## What is in it

| Path | What it is |
|---|---|
| `boston/data.json` | The Boston guide's data — sections, categories and one object per venue |
| `raleigh/data.json` | The Raleigh guide's data. Same shape, different sections — Raleigh has a `bars` tab Boston does not |
| `lib/validate-core.js` | The validator, and the **city registry** — each city's bounding box, sections and URLs. This repository is its home; each guide's own repository takes its copy from here |
| `scripts/guard.mjs` | The check that runs on every change (see below) |
| `scripts/cities.mjs` | The registry on the command line. `--check` asserts that every city has a data file that names itself, a suggestion form and a report form labelled for it, and a form that only offers sections, categories and tags its data actually has |
| `.github/workflows/` | Continuous integration |

## Proposing a change

Each city has its own directory and its own pair of issue forms. A data file says which city it belongs to
in `meta.city`, and that must agree with the directory it sits in — the two are checked against each other so
that an entry drafted into the wrong city's file is caught rather than validated against the wrong map.

**No Git needed**, and pick the city you mean:
[suggest a place — Boston](../../issues/new?template=suggest-place-boston.yml) ·
[report a change — Boston](../../issues/new?template=flag-place-boston.yml) ·
[suggest a place — Raleigh](../../issues/new?template=suggest-place-raleigh.yml) ·
[report a change — Raleigh](../../issues/new?template=flag-place-raleigh.yml).
A maintainer turns accepted suggestions into a pull request, with the address geocoded for you.

**With Git:** open a pull request against that city's `data.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the
entry format, and [MAINTAINING.md](MAINTAINING.md) if you are reviewing them. Every change is checked
automatically before it can merge:

- **The schema must validate.** Required fields, a category that exists, coordinates inside that city's own
  bounding box, `http(s)` links only, no HTML in text fields, and hex-only category colours.
- **The file must say which city it is.** `meta.city` has to match the directory the file sits in. This is what
  catches an entry drafted into the wrong city's file, which would otherwise be checked against the wrong map.
- **An entry may not disappear.** Venue ids are embedded in the itinerary links customers are sent, so deleting an
  entry silently drops a stop from an itinerary somebody already has. Intentional removals need the `allow-removal`
  label.
- **A website may not move to a different domain** without the `url-change` label. Repointing a venue's link is the one
  data change that could send a customer somewhere unexpected, so it gets a human look.

To check a change before pushing:

```bash
node scripts/guard.mjs boston/data.json                      # schema only
node scripts/guard.mjs raleigh/data.json                    # the other city
node scripts/guard.mjs boston/data.json /path/to/previous.json   # and the comparison gates
node scripts/cities.mjs --check                             # every city has a data file, forms and a label
```

Nothing published here reaches the live site on its own. A maintainer merges, and the guide picks the data up from
there.

## Accuracy

Every venue is checked against the establishment's own website before it is added, and the guide is corrected when
something closes or moves. If you spot something wrong, a pull request or an issue is welcome.
