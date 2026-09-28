# BRIEF: ShipTrack Pro landing page + licensing console redesign

**Authored from the user's reference, not interviewed.** The user supplied five
screenshots of Greptile (marketing home, pricing, console desktop, console mobile,
onboarding) with the instruction "use this design sample, redesign the landing
page and admin dashboard", then "this is for the ShipTrack app". The eight
interview topics below are answered from that direction and from the product's
own code; every answer that is a decision rather than a quotation is marked
**Authored**.

Skill runtime note: only `SKILL.md` was available in this environment. The
references (devices, taste, uniqueness, feel, hero-depth, approved-collection,
worlds, verify, assets), the engine and the scripts did not sync, and no
`KIE_AI_API_KEY` is set. The process in `SKILL.md` is followed directly; assets
are hand-built SVG (the reference is genuinely illustrated, see worlds note
below) and verification uses Playwright directly.

## The eight topics

1. **Vibe and references.** The user's reference: Greptile. Measured from the
   live site: Anybody (display, wide axis), DM Sans (body), Space Mono (labels);
   zero radius; mint `#28E99F`; grey canvas `#E9E9E9`; slate ink; ruled grids,
   dashed rules, crosshair markers at intersections, hatched bands, bracketed
   mono labels, angled "tag" buttons; a near-black console with mono panel
   titles and big numerals. **Authored** translation: a shipping manifest.
   Borrow the structure and type; keep ShipTrack's own identity (deep navy
   `#0B3B5C` for ink and dark bands, amber `#F59E0B` for warnings and hazard
   hatching) and replace Greptile's cube illustrations with ShipTrack-owned
   motifs: isometric shipping containers and route arcs. No Greptile name,
   logo, copy or illustration is reused.
2. **Journey, in order.** **Authored** from the existing page and the plugin:
   the question every shipper's customers ask; one tracking page across road,
   rail, sea and air; every number checks itself; what is in the box; a licence
   that degrades instead of breaking; pricing derived from the entitlement
   matrix; portal for existing customers.
3. **Energy curve.** **Authored**: medium open, rising through the route, a
   deliberate quiet beat, the peak, then a steady descent into calm
   decisiveness at pricing.
4. **Feeling, stage by stage, and the one moment.** See curve below.
5. **The thing no other site does.** **Authored**: the page runs the plugin's
   real check-character algorithm in the browser. Mistype a tracking number and
   it is caught before you finish, exactly as the plugin's public lookup does.
6. **Distance from premium-minimal.** The reference is technical-editorial:
   dense, ruled, labelled, confident. Not maximalist, not minimal.
7. **One unbroken world or distinct scenes?** Distinct modules on one ruled
   sheet, as the reference does. Not a continuous flight.
8. **Assets on hand.** None beyond the reference screenshots and the current
   favicon. No photography. The world is illustrated because the reference is
   genuinely illustrated (line-drawn diagrams and isometric forms), so
   hand-built SVG is the right medium and costs nothing to generate.

## Product facts the page may state (and nothing else)

- Road, rail, sea and air shipments for WordPress (`FEATURE_COPY` transport flags).
- Tracking numbers `{COUNTRY}-{BRANCH}-{YYYYMMDD}-{SEQ6}-{CHK2}`, check pair is
  Luhn mod-36 over the preceding segments; the public lookup rejects a bad pair
  before any database query (`TrackingNumberService::hasValidChecksum`).
- Lifecycle: pending, confirmed, picked up, in transit, out for delivery,
  delivered; plus on hold, exception, returned, cancelled (`StatusMachine`).
- Seats count production sites only; staging, local and managed-host previews
  never take one (seat classifier).
- An expired licence never breaks the public tracking page: only shipment
  mutations are gated; maps fall back to OSM, rail and sea to the indicative arc.
- Updates arrive through WordPress's own updater.
- Pricing, seats, branch caps, audit retention and every capability row come
  from `TIER_FEATURES` / `TIER_LIMITS` / `DEFAULT_SEATS`. Prices are page copy.
- **No statistics.** No customer counts, no uptime, no "X% faster". The
  project has none, and the brand rules forbid inventing them.

## Grammar: the manifest

**Authored.** The page is a shipping manifest: one ruled sheet, fields labelled
in mono, reference codes in brackets, sections numbered as legs.

- **Navigation:** a manifest header rail, fixed, ruled underneath; wordmark
  left, four anchors centre, two tag buttons right.
- **Sequence:** legs `[ L01 ]` to `[ L06 ]`, each a different device.
- **Ending:** proof of delivery. The sheet resolves into a signed, stamped close
  and a ruled footer, then a field of isometric containers.
- **Bans:** no pinned sections, no scroll-scrubbed video, no photography, no
  full-screen centred copy after the hero, no section counters of the `01 / 06`
  kind (leg codes are labels on modules, not progress).

## Journey

| #   | Beat        | What changes for the visitor                                     |
| --- | ----------- | ---------------------------------------------------------------- |
| 1   | Recognition | "Where's my parcel?" is the question they answer all day         |
| 2   | Turn        | One tracking page carries road, rail, sea and air on one line    |
| 3   | Quiet       | Every number carries its own check                               |
| 4   | **Peak**    | They mistype a number and watch it get caught                    |
| 5   | Range       | What is in the box, by module                                    |
| 6   | Assurance   | The licence degrades; it never takes the tracking page down      |
| 7   | Commitment  | Prices and capabilities from the entitlement matrix; FAQ; portal |

## Feeling curve (written before the score)

| Act | Feeling                    | Caused by                                                                                  |
| --- | -------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Recognition, a small wince | The headline names the question; a manifest tag floats over a route chart in layered depth |
| 2   | Clarity                    | One route line draws itself through four transport modes as it enters                      |
| 3   | Stillness                  | A single sentence on a quiet ruled field, no motion                                        |
| 4   | **Delight, then trust**    | A live tracking field: change one digit and the check pair flags it instantly              |
| 5   | Confidence                 | Modules wipe in, each a labelled compartment                                               |
| 6   | Calm                       | A dark navy band states what never breaks, and why                                         |
| 7   | Decisiveness, resolved     | Pricing sheet, ruled comparison, FAQ, a stamped close                                      |

No two adjacent acts share a feeling.

## The peak

"It's the site where you mistype a tracking number and it catches it before you
press enter." Lives in act 4 and takes the most vertical room on the page. Act 3
is deliberately quiet before it.

## Signature move: the check-character tracker

A real `<input>` rendered as a segmented manifest field (country, branch, date,
sequence, check). As the visitor edits, the TypeScript port of the plugin's
Luhn mod-36 recomputes the expected pair. Match: the check cell stamps mint and
the lifecycle rail lights through the real `StatusMachine` states. Mismatch: the
cell stamps amber with the expected pair beside what was typed, and the verdict
says it was rejected before any lookup. Two buttons for visitors who will not
type: introduce a typo (a transposition, the most common human error) and
restore. The port is unit-tested against vectors computed by the plugin's own
PHP class.

## Score

| Act           | Device                                                                         | Why this one                                                                  |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1 Recognition | Layered parallax (grid, route arcs, container stack, foreground tag) + pointer | Depth from independent planes; the tag in front is the product's own artefact |
| 2 Turn        | Draw: SVG route stroke tied to scroll progress                                 | A line being drawn is "these connect"                                         |
| 3 Quiet       | Static editorial, split anchor                                                 | Silence before the peak                                                       |
| 4 Peak        | Live input (signature move)                                                    | The page stops asking to be read and starts answering                         |
| 5 Range       | Reveal: clip-path wipe per module                                              | Compartments opening                                                          |
| 6 Assurance   | Contrast band (navy), static                                                   | A change of ground signals a change of subject: risk                          |
| 7 Commitment  | Ruled table + accordion + stamped close                                        | The manifest resolves into a document                                         |

Device families: parallax, draw, static editorial, live input, reveal, contrast
band, document. Seven, none adjacent-repeated. No scrub video.

## Console

Dark, from the reference console: a sticky header with the mark, wordmark and
a `Console` chip; icon tabs with a mint rule on the active one, which become a
fixed bottom tab bar on a phone; a hatched strip under the header with the
breadcrumb and the signed-in account; one ruled stat panel; mono-titled chart
panels; attention tiles framed with the reference's corner registration marks.
Every existing form action, field name, query and behaviour is preserved.

Two departures from the first plan, both deliberate:

- **The strip is a breadcrumb, not a health light.** A strip coloured by
  install health on every screen needs the dashboard queries on every screen.
  Health lives on the overview, where the counts are loaded.
- **Attention tiles are dark, not pastel.** The pastels would have become a
  second, unvalidated status scale. State is carried by the reserved status
  colours, always with a glyph and a word (dot, triangle, cross), and the
  tile's corner marks take the tone only when its count is above zero.

Charts follow the emphasis form: the most recently published version in mint,
every other bar the same recessive grey; tiers in their fixed order, never
re-sorted by count; values at each bar's tip; one baseline; no legend box for a
single series, one key line for the emphasis.

## Verification

Measured, not assumed:

- `npm run check`: lint, svelte-check (0 errors, 0 warnings), 212 unit tests
  including the tracking-number port against vectors from the plugin's PHP,
  build, and `verify:bundle`.
- The Svelte autofixer on every component: clean, bar two generic advisories
  kept on purpose (the footer's status light assigns the result of a fetch; the
  hero flips `animate` inside its attachment because reduced motion is only
  knowable in the browser).
- Screenshots at 1440 x 900 and 390 x 844, and with reduced motion, of every
  landing section and every console screen, including the tracker's mismatch
  and malformed states, the mint form, an open edit row, empty results and the
  sign-in error. Console screens were rendered against fixtures, not a
  database.
- No horizontal overflow at 390px on the landing page or any console screen; the console's head actions stay
  inside the content edge at 1440, 1024, 800 and 390.
- The browser's recomputed check pair for the transposed example matches the
  plugin's own `TrackingNumberService::checksum()` (`5L`).

Feel check, one word per act from the captures, then diffed against the curve:
recognition, clarity, stillness, delight, confidence, calm, resolved. No act
disagreed with the curve. The peak is the largest change of ground on the page
(the only lime band) and the tallest act.

Not verified: the console's actions against a live database (markup changed,
server code did not, and the form fields were diffed against the previous
version), real screen readers, and Safari.

## Known gap

There is no purchase path to link: Paddle is deferred in the design spec and
licences are minted by hand. The page's action is therefore "See pricing",
with "Open the portal" for existing customers. Pricing cards carry no Buy
button rather than a dead one.
