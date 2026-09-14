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

Planning choices now generate different curated itineraries. Activity coverage
drives the recommendation, the selected time limits it to 2/3/4/5 stops, and
Milo's preferences influence quiet/social café choice, water availability and
route length. Destination cards open concise place details. Café details also
offer the other curated café and update the itinerary, summary and map route
without returning to planning.

## Editing the prototype

- `static/data/places.js`: curated place copy and editable prototype scores.
- `static/data/routes.js`: Route A, Plan B and recommendation-variant geometry,
  sample facilities, step indexes, crowd corridor, and trigger configuration.
- `static/js/recommendation.js`: scoring weights, time limits, itinerary
  rendering, place details and café replacement.
- `static/js/map.js`: Leaflet layers, numbered markers, attribution and viewport.
- `static/js/navigation.js`: demo progression, decision sheet, route switching,
  expanded details, completion and restart.
- `static/js/app.js`: existing planning editors and screen choices.
- `templates/index.html` and `static/css/styles.css`: screen content and styling.

The route geometry was extracted from connected OpenStreetMap highway ways
on 15 September 2026. Every consecutive pair of coordinates is an OSM edge;
the routes share the café departure point and rejoin at the riverside stop.
Route A follows Kurilpa Street / the riverside, while Plan B uses an inland
detour before reconnecting. No route calculation occurs at runtime.

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
