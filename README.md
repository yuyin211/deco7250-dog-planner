# deco7250-dog-planner
Mobile-first Flask prototype for planning dog-inclusive outings in West End, Brisbane.

## Run locally

From this project folder in PowerShell (Python 3.13 virtual environment):

```powershell
.\.venv\Scripts\python.exe app.py
```

Open http://127.0.0.1:5000. Leaflet 1.9.4 loads from unpkg and the basemap
loads from OpenStreetMap, so viewing map tiles requires internet access.
No API keys, GPS permissions, database, or routing service are needed.

## Demo walkthrough

1. Generate outing, then View map to review the four numbered stops.
2. Start outing. Use **Next demo step** twice.
3. At step 3 (the café departure), the corridor ahead changes to Busy.
4. Compare the dashed alternative, then choose Switch route or Keep route.
5. Continue with Next demo step to reach Orleigh Park. More expands the
   upcoming stops and dog context. End outing returns to Suggested outing.
6. Start again to reset and replay the other decision. The alert fires once
   per outing. Escape on the alert has the same effect as Keep route.

Start outing also works directly from Suggested outing.

Planning choices generate different curated itineraries. Selected activity
coverage comes first, followed by total-time feasibility, retained manual
place choices, dog suitability, unnecessary stops, and route length. Geography
is constrained up front to the existing connected, curated routes. Quiet and
social scores are averaged across relevant stops; water availability adds a
sample suitability bonus; Shorter walks preferred penalises route kilometres.
Preferences cannot outweigh missing activity coverage. The selectable activity
set is Market, Riverside walk, Café or food, Park and Shopping. Dog social time
is descriptive suitability metadata rather than a planning activity.

Shopping-specific fit is ranked before generic dog suitability. West Village
offers outdoor retail, while Boundary Street offers a street-based shopping
outing. Davies Park / West End Markets can still cover Market, Park and Shopping
in combined plans. The existing recommendation priority order is unchanged.

West Village uses the OSM-mapped outdoor entrance at 97 Boundary Street
(-27.4781298, 153.0120588), with a 20-minute Shopping default and no rating.
Its [official FAQ](https://www.westvillage.com.au/retail/faqs/) supports outdoor
retail pet access; individual cafés/restaurants decide outdoor dining access.
The app does not claim access to every indoor shop. Add Shopping offers both
retail destinations where a matching insertion exists, without duplicates.

Tap a stop for details, its duration for a focused picker, or the small Change
action for alternatives. Change swaps only that role using an exact matching
route, preserving other stops, order and durations. Cafés are interchangeable;
the two park locations are interchangeable for Park-only outings when a
matching route exists. An alternative must retain every selected activity
covered by the original stop. Unsupported swaps are not offered.

Suggested outing also supports lightweight manual refinement. A direct, light
Remove button removes a stop immediately unless it is the only coverage for an originally
selected activity; in that case, a confirmation names the lost activity. The
informational coverage warning remains after confirmation. Add a stop first
asks for one supported category, then shows only places that can be inserted
into the current itinerary using an exact curated route. Candidate cards show
dog-relevant context, default stay time and approximate added outing time.

Add candidates rank by time fit and added time, then dog preference suitability
and route-length impact. Geographic coherence is a prerequisite: unsupported
place/order combinations are never offered. Route ordering determines the
insertion point rather than blindly appending the new stop.

## Timing model

Total = travelMinutes + activityMinutes. Travel uses the curated route's
walking estimate. Activity time sums planned visits, crediting the existing
riverside-to-Orleigh walking segment against the riverside activity once.
For routes ending at the riverside, its activity duration is additional leisure
time, not a second copy of the journey to reach it. The UI shows the breakdown
and any credited time. Navigation's Walking left excludes visits.

Defaults/minima in `ACTIVITY_DURATIONS` in `static/data/places.js` (minutes):

| Activity | Default | Minimum |
| --- | ---: | ---: |
| Café or food | 30 | 15 |
| Market | 25 | 15 |
| Park | 20 | 10 |
| Shopping | 20 | 10 |
| Riverside walk | 20 | 10 |

A stop covering several roles uses the longest applicable duration, not their
sum. Flexible visits shrink toward minima to fit. If still over budget, the
best-covered itinerary remains visible with an explicit overrun and Increase
available time action; any unsupported activity is also named. This is not
precise routing or scheduling software.

Manual duration edits are allowed over budget and update totals without moving
the route. Viewing details/map and generating an unchanged plan preserve edits.
`systemRecommendedStops`, `manuallyAddedStops`, `manuallyRemovedStopIds`,
`manualPlaceOverrides`, and `manualDurations` keep the edit types explicit.
Meaningfully changing activities, time or preferences creates a fresh plan and
clears prior add/remove edits. State lasts until page reload.

## Editing the prototype

- `static/data/places.js`: curated place copy and editable prototype scores.
- `static/data/routes.js`: Route A, Plan B and recommendation-variant geometry,
  sample facilities, step indexes, crowd corridor, and trigger configuration.
- `static/data/route-paths.js`: shared OSM coordinates, prepared detours and
  West Village route combinations. No routing API is called by the app.
- `scripts/build_route_geometry.py`: prepares/validates that data offline from
  an OSM XML extract. Only public walkable ways are included.
- `static/js/recommendation.js`: coverage, ranking, timing, duration picker,
  itinerary rendering, place details and same-role replacement.
- `static/js/map.js`: Leaflet layers, numbered markers, attribution and viewport.
- `static/js/navigation.js`: demo progression, decision sheet, route switching,
  expanded details, completion and restart.
- `static/js/app.js`: existing planning editors and screen choices.
- `templates/index.html` and `static/css/styles.css`: screen content and styling.

The route geometry was extracted from connected OpenStreetMap highway ways
on 15 September 2026. Every consecutive pair of coordinates is an OSM edge;
the routes share the café departure point and rejoin at the riverside stop.
Route A follows Kurilpa Street / the riverside, while its Plan B uses an inland
detour before reconnecting. Other Plan Bs are deterministic compositions of
existing OSM-derived edges; no external route calculation occurs at runtime.

Route A is approximately 2.6 km (43 minutes walking); Plan B is approximately
3.0 km (49 minutes). The comparison is rounded to +400 m / +6 min.
Stop visit durations are separate from walking time. The existing planning
defaults remain a 90-minute outing with Milo.

Coordinates and the basemap are geographic information. The café is a
generic prototype stop, not a verified business. Crowd levels, visit times,
walking estimates, weather and facility locations are demo data. Facility
distances are approximate straight-line distances to those sample points.
No live crowd, dog-access, business or facility claims are made.

OpenStreetMap-derived coordinates: © OpenStreetMap contributors, licensed
under [ODbL](https://www.openstreetmap.org/copyright). Leaflet/OpenStreetMap
attribution remains visible on the map.

## Validation and limits

### Route-switch correction and West Village

The previous non-default Plan Bs mostly removed a tiny side edge and otherwise
overlapped Route A. For Riverside → Orleigh, the alert was even on a coordinate
absent from Plan B. The dashed preview used Route A's step number to index a
different Plan B step list, and switching guessed the nearest step. This made
the preview, marker and apparent path change inconsistent. The old layer group
was cleared; stale group references were not the primary cause.

The renderer now owns separate active, alternative and busy layer groups, with
one explicit active polyline. Switching rebuilds them, removes the old SVG path,
clears dashed/busy overlays and shows the new route bounds. Every route pair
includes the exact same switch coordinate in both step lists. The active plan,
Suggested summary, review summary, remaining travel and marker use Plan B after
Switch. Keep retains the primary geometry. The original default Plan B is kept.

All 42 primary routes have prepared alternatives. Non-default detours separate
at least 55 metres from their primary path and add at least 150 metres of real
walking geometry. Short approaches with no viable detour were extended along
mapped public paths. The return legs of out-and-back routes also avoid the
busy edge. These are illustrative walking routes, not optimal route promises.

West Village support includes a shopping stroll, either café + West Village,
West Village + Riverside, West Village + Orleigh, café/retail/riverside/park,
Market + West Village and West Village + Boundary Street. Parallel Boundary
Street combinations support Add/Change while preserving the other stop roles.

Retained regression checks:

- `scripts/validate_route_switch.cjs <jsdom-module-path> <leaflet.js-path>` runs
  real Leaflet in a DOM environment. It inspects active coordinates and SVG
  paths, layer counts, removed layers, dashed/busy cleanup, exact marker
  continuity, summary changes and completion for both branches of all 42 routes.
  Map methods are not stubbed. It also checks Shopping Add/Change and West
  Village access wording, Google Maps action and default duration.
- `python scripts/build_route_geometry.py <osm-xml-path> --verify` checks every
  consecutive coordinate against public walkable OSM edges, and every stop
  against its place coordinate. All 84 primary/alternative paths passed.
- Single-stop removals across supported multi-stop routes retain a shared
  switch point and exclude their configured busy edge after switching.

These checks use external validation tooling; the Flask app has no new runtime
dependencies. Browser discovery returned no available browser, so a live tile
screenshot remains unverified. DOM checks inspect rendered Leaflet SVG geometry
but do not replace a visual review in a real browser.

### Earlier-stage validation history

Recommendation audit corrected the hard stop-count filter that excluded
café + riverside, walking-only summaries, summed place-score bias, inaccurate
small-route distance labels, and café replacement regenerating unrelated stops.
The expanded navigation check also caught and fixed single-stop return legs
trying to access a nonexistent next stop. The established default route and
Plan B remain unchanged. Café-to-riverside options and route-specific crowd
alternatives reuse existing route edges, with no straight-line connections.

Audit DOM checks with actual Leaflet passed:

- Café + riverside / 45 min: both covered, 45 min total (18 travel + 27 activity).
- Default market + riverside + café / 90 min: original four-stop route, 90 min.
- Park / 60 min, social preference: Orleigh is selected and described as social.
- Café + shopping / 60 min: both roles covered, 60 min total.
- Café swap: different geometry/travel, unchanged other stops and durations.
- Café 30 → 45: exactly +15 total, unchanged geometry, visible overrun warning;
  edits survive details, map and unchanged Generate. Cancelling edits is safe.
- All 15 nonempty dog-preference combinations retain café + river coverage.
- Market + Park uses one destination. Park-only offers a valid park alternative.
- All five selectable activities remain traceable through activity coverage.
- Every curated route reaches completion. Default Switch and Keep both work,
  with one alert per outing and no DOM JavaScript errors.

Itinerary-edit DOM checks also passed:

- Removing the default café names lost Café coverage, then selects the existing
  three-stop Market → Riverside → Orleigh route in the itinerary, map and nav.
- Removing a redundant stop is immediate, without unnecessary confirmation.
- Adding a café to Riverside → Orleigh inserts it first; both café candidates
  are available, and Change preserves the added state and all other stops.
- Adding Orleigh to café + shopping uses exact OSM-aligned route geometry and
  displays an over-time warning. Increase time selects the next fitting option.
- A newly added café starts at 30 minutes; changing it to 45 adds exactly 15
  minutes without changing geometry.
- Meaningful replanning clears add/remove state; details/map/back preserve it.
- Every curated route, including both new café + shopping + park variants,
  reaches navigation completion. The original Switch and Keep branches pass.

Latest review checks additionally confirmed:

- Shopping-only selects Boundary Street rather than being forced to the market.
- Café + Shopping and Add Shopping both use coherent curated combinations.
- Dog social time is absent from planning, duration and Add category controls,
  while Orleigh retains social supporting copy.
- Change and Remove are direct card controls and do not trigger place details.
- Water/bin indicators use 💧 and 🗑️ in the map legend and navigation.
- All 20 static primary routes plus a derived manually edited route expose one
  deterministic alert. Their Plan Bs exclude the configured busy edge; Switch
  and Keep each reach completion without a second alert.

Earlier temporary DOM harnesses were removed. The route-switch regression above
is retained because the previous state-only checks missed the geographic bug.

Both Switch and Keep flows were exercised in a DOM integration check using
the actual Leaflet script, including markers, attribution, completion,
restart, back, Adjust plan, expanded details, tile failure and CDN failure.
No JavaScript exceptions occurred in those checks. Route connectivity and
Plan B exclusion from the busy segment were checked against the OSM extract.
Flask startup and HTTP responses were checked with Python 3.13.

The browser connection was unavailable during implementation. A rendered
390 × 844 visual/overflow check and an interactive live-tile review remain
unverified; DOM checks do not substitute for those visual checks. Geographic
alignment was inspected using an overlay on the downloaded OSM way network.
If tiles fail, route overlays and demo controls remain available; if Leaflet
itself fails to load, a message appears and the text/demo flow still works.
