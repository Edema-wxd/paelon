# Image masters

Drop source files here; run `npm run images`; the engine writes optimised
derivatives to `public/images/` and updates `lib/image-manifest.json`.
Components pick them up automatically — until a file exists for a slot,
`SiteImage` renders a labelled placeholder instead.

```
assets/<kind>/<name>.<ext>   ->   public/images/<kind>/<name>.avif
                                  public/images/<kind>/<name>.webp
                                  public/images/<kind>/<name>-mobile.*   (hero only)
```

`<name>` must match what the component asks for. Service cards and HMO logos
use the slug from the seed JSON, so `assets/service-card/paediatrics.png`
serves the service with `"slug": "paediatrics"`.

## Accepted source types

`.png` · `.svg` · `.avif` · `.webp`

JPEG is **not** accepted — the engine will reject it by name. That is Francis's
list, not a technical limit; say the word and it is a one-line change in
`ACCEPTED_SOURCE_EXTENSIONS`.

SVG is copied through untouched rather than rasterised, and is served with the
Next optimizer bypassed (`dangerouslyAllowSVG` stays off — the optimizer will
happily serve script-bearing SVG, which is not a risk worth taking here).

## Slots and dimensions

Sizes below are **rendered CSS pixels**; the engine multiplies by the slot's
DPR to get the file it writes. Full table with `sizes` strings and per-file
byte ceilings lives in `lib/images.ts`.

| Kind | Desktop @1440 | Mobile @390 | DPR | File written | Max |
|---|---|---|---|---|---|
| `hero` | 1440 × 681 | 390 × 468 | 2 | 2880 × 1362 **+ 780 × 936 mobile crop** | 200 KB |
| `service-card` | 400 × 304 | 304 × 236 | 3 | 1200 × 912 | 40 KB |
| `about-feature` | 620 × 413 | 358 × 239 | 2 | 1240 × 826 | 90 KB |
| `hmo-logo` | 176 × 80 | 155 × 80 | 3 | 528 × 240 — **prefer SVG** | 15 KB |
| `portrait` | 100 × 100 | 100 × 100 | 3 | 300 × 300 | 12 KB |
| `logo` | 138 × 64 | 110 × 51 | 3 | 414 × 192 — **prefer SVG** | 15 KB |

Only `hero` is art-directed: it is the one slot whose composition genuinely has
to change between a wide landscape band and a near-portrait phone crop. Every
other slot keeps its crop and is simply rendered smaller, so a second file
would be waste. Supply one master per slot cropped for desktop; the engine
derives the hero's mobile crop from the same file, so give it enough headroom
top and bottom.

## Budget

The homepage shell is 203 KB gzipped against the 800 KB cap in spec §13, so
imagery has roughly 597 KB. Spending every slot to its ceiling comes to
562 KB — it clears, but only because the HMO logos are expected to be vector.
`npm run images` prints the running total and exits non-zero if it is breached.

## Commands

```bash
npm run images         # convert what changed
npm run images:force   # reconvert everything
npm run images:check   # report only, write nothing
```

Both `assets/` and `public/images/` are committed, so a deploy never has to run
the engine.
