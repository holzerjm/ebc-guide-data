# Contributing

The guide is only as good as the places in it, and the fastest way it goes wrong is a restaurant that
changed its hours or closed. Corrections are as welcome as additions.

## Without using Git

- **[Suggest a place](../../issues/new?template=suggest-place.yml)** — a form. You do not need the map
  coordinates; they are looked up from the address.
- **[Report a change](../../issues/new?template=flag-place.yml)** — something closed, moved, or the hours are
  wrong. You can also reach this from the *Report a change* link on any place in the guide itself.

A maintainer reads every issue. Accepted suggestions are turned into a pull request for review — nothing
reaches the guide automatically.

## With Git

First, **which city?** Each guide has its own file and its own pair of issue forms:
`boston/data.json` for the Boston guide, `raleigh/data.json` for Raleigh. Raleigh has a `bars` section
that Boston does not — Boston folds bars into Eat & Drink — so use the section names that city's file
actually has.

Edit the `data.json` for the city you mean and open a pull request. One entry looks like this:

```json
{
  "id": "neptune-oyster",
  "name": "Neptune Oyster",
  "cat": "seafood",
  "kind": "Seafood & raw bar",
  "price": "$$$",
  "phone": "(617) 742-3474",
  "website": "https://neptuneoyster.com/",
  "hours": "Daily from 11am; walk-ins only",
  "address": "63 Salem St, Boston, MA 02113",
  "lat": 42.36346,
  "lng": -71.05553,
  "tags": ["Date", "Lunch"],
  "blurb": "Tiny North End raw bar with a famous lobster roll — no reservations, so expect a wait.",
  "addedOn": "2026-06-15"
}
```

- `cat` must be one of that section's categories, and `tags` one of its tags — see the top of
  `boston/data.json`, or the descriptions on the suggestion form.
- `lat`/`lng` must be inside that city's bounding box. The suggestion form does this for you; by hand, any
  geocoder will do.
- `meta.city` must match the directory — `"city": "boston"` in `boston/data.json`. It is already there; do not
  change it. A file that says one city while sitting in another's directory is rejected.
- `price` applies to Eat & Drink only, `$` to `$$$$`.
- `blurb` is one factual sentence, under 200 characters, no HTML.
- `addedOn` gives the place a "New pick" badge for 90 days.

Check it before you push:

```bash
node scripts/guard.mjs boston/data.json                    # schema
node scripts/guard.mjs raleigh/data.json                   # the other city
node scripts/guard.mjs boston/data.json previous.json      # and the comparison gates
```

## What gets accepted

Real, currently-open places a visitor to the Briefing Center could reasonably get to. Factual descriptions in
the guide's own voice — no superlatives, no marketing. If you are connected to the place, say so in the issue
or the pull request; that is fine, we just like to know.

## Two changes need a maintainer's label

- **Deleting an entry** needs `allow-removal`. Venue ids appear in the itinerary links customers have already
  been sent, so a deletion quietly drops a stop from an itinerary somebody is carrying.
- **Pointing a website at a different domain** needs `url-change`. It is the one data edit that could send a
  visitor somewhere unexpected, so a person looks at it.
