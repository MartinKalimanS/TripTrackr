# TripTrackr — Product & Technical Blueprint

_A working name for the "everything about your trip, in one place" app. Use this document as the source-of-truth spec you feed into Claude Code, one module at a time._

## 1. Product framing

Before any screen gets built, it helps to pin down what the app actually _is_, because right now it's three products stitched together: a personal trip journal, an expense tracker, and a social network. Each has different privacy needs and different reasons a user opens the app. Naming this explicitly in your onboarding copy — something like "Plan it. Live it. Share what you want." — will help users (and you, while prompting Claude Code) keep the boundaries straight between the private planning layer and the public social layer.

A few framing decisions worth locking in early:

- **Primary loop**: the thing a user does weekly, not just during a trip. Likely candidates: browsing their own 3D globe/memories, checking expenses mid-trip, or scrolling other travelers' public trips for inspiration. Whichever you pick should get the best screen real estate.
- **Trip lifecycle**: a trip should probably have explicit states — _Planning_ (before start date), _Active_ (dates in progress), _Past_ (completed). The UI, especially the globe and planner, should visually differentiate these (e.g., dashed arc for planned trips, solid glowing arc for active ones, faded for past).
- **Multi-destination trips**: your Rome → Florence example implies a trip is really a sequence of legs/stops, not just one origin/destination pair. Model a trip as one record with an ordered list of stops, each with its own arrival/departure date, rather than forcing "origin" and "destination" to mean the whole trip.

## 2. UX & design ideas

**Home screen (the 3D globe).** Treat it like a hero visualization, not a dashboard. Arcs for past trips can be dimmed/thin; the upcoming or active trip's arc should animate (a pulse or traveling dot) so the user's eye goes there first. Tapping an arc opens that trip; tapping a bare city (no trip yet) could suggest "Plan a trip here." Consider a small stats overlay (countries visited, % of world covered, km traveled) — this is a strong social hook too, since visitors to a public profile see it first.

**Trip creation flow.** Country → filtered city list is good for correctness, but pair it with a searchable autocomplete (typing "Flor" should surface Florence, IT) so users aren't stuck scrolling a country's full city list. Once a trip has stops, let the user reorder them by drag, and auto-suggest travel dates for stop _n+1_ based on stop _n_'s end date.

**Notes.** Support three "shelves": notes attached to a specific city, notes attached to the country in general (your Italy-level bucket), and notes attached to the trip as a whole (e.g., packing list, flight numbers). Letting the user later drag a country-level note down into a specific city (as you described) is a nice touch — build notes with a nullable `city_id` and non-null `country_id`/`trip_id` from day one so that move is just a field update, not a data migration.

**Expenses & charts.** Ask for currency at entry time and store both the original currency/amount and a converted amount in the trip's "home currency" (or the user's default currency) so totals and charts are always comparable. Category should default to a curated list (Food, Lodging, Transport, Activities, Shopping, Other) with "+ Add custom category" inline — store custom categories per-user so they're reusable across trips. For charts: a per-trip donut (spend by category), a daily bar chart (spend by day, useful for noticing an expensive day), and — if multi-currency — a small note showing the FX rate used, since travelers get confused when numbers don't reconcile with their bank statement.

**Social layer.** Every shareable object (trip, note, photo) needs its own privacy flag, not just one global toggle, because users will want to share the trip existed without sharing the journal entries. Suggested default matrix: Trip = private, Notes = private, Photos = private, Expenses = always private and _not exposable_ even if the trip is public (you already called this out — enforce it at the API layer, not just the UI, so there's no accidental leak). A public trip view should render as a curated "story" — globe arc, cover photo, city stops, public photos/notes only — not a raw dump of the owner's data model.

**The planner.** Frame it conversationally ("What should I do in Rome for 2 days?") but render the output as a structured, editable day-by-day itinerary with pins plotted on the map and a walking/driving route line connecting them in order. Let the user drag a card from Day 1 to Day 2, or delete an activity, with the route re-drawn live. This is the feature most worth prototyping early since it's the highest technical risk (see §5).

## 3. Information architecture (core entities)

```
User
 └─ Trip (title, status, is_public, home_currency, cover_photo)
     └─ TripStop (ordered: country, city, arrive_date, depart_date)
Country (ISO code, name)
City (belongs to Country, lat/lng, timezone)
Note (belongs to Trip; optional City; optional Country; is_public)
Photo (belongs to Trip; optional City; is_public; EXIF lat/lng/date)
Expense (belongs to Trip; City; Category; amount, currency, converted_amount)
ExpenseCategory (system default OR user-created)
Document (boarding pass / booking; belongs to Trip; always private)
ItineraryDay (belongs to Trip + City; ordered list of ItineraryItems)
ItineraryItem (place, lat/lng, note, source: AI-suggested | user-added)
Follow (follower_id, followee_id, status)
```

You'll need a **canonical country/city geo dataset** to power the "pick country, then filtered cities" flow and to place arcs precisely — don't hand-roll this. GeoNames (free, ~4M places) or a curated subset of it is the standard choice; import it once into Postgres with lat/lng, country code, and population (so you can sort city pickers by relevance).

## 4. Technical architecture

**Mobile client.** For a single codebase targeting iOS + Android with heavy custom graphics (3D globe, map routes), **React Native (via Expo's dev-client, not managed workflow — you'll need native modules)** or **Flutter** are the two realistic choices. Flutter's rendering engine (Skia/Impeller) tends to handle custom animated graphics slightly more predictably than RN's bridge, but React Native has a much bigger ecosystem for the specific hard parts here: `three-globe`/`react-three-fiber` for the globe, Mapbox/MapLibre SDKs, and barcode scanning libraries for boarding passes. Recommendation: **React Native + Expo dev-client**, unless your team already has deep Flutter experience.

**3D globe engine.** Mapbox GL JS's native globe projection, via `@rnmapbox/maps` on the mobile side. This is the single highest-risk visual component, so it deserves its own section — see §5 below.

**Backend API.** A single REST or GraphQL API service (Node.js/NestJS, or Go if you want stronger performance headroom for the planner/route-generation endpoints) sitting in front of Postgres. NestJS is a strong default because its module structure maps cleanly onto your domains (Trips, Notes, Expenses, Social, Planner) and it has mature Postgres/TypeORM or Prisma support.

**Database.** PostgreSQL is the right call, but enable the **PostGIS** extension immediately — you're storing coordinates, computing distances (for globe arcs and "km traveled" stats), and doing radius/bounding-box queries (e.g., "cities near this point" for the planner). Run it via Docker Compose in dev, and the same self-hosted Postgres+PostGIS container in prod, on a cheap VPS rather than a hyperscaler-managed database — see §8.1 for concrete pricing.

**Object storage.** Photos and boarding-pass documents don't belong in Postgres — use S3-compatible storage with the DB storing only URLs/keys and metadata (any S3-compatible provider works identically at the code level, since it's just an API shape). No AWS S3: **Cloudflare R2** (10GB free, then $0.015/GB/month storage, and — the actual reason to pick it — **zero egress fees**, versus AWS S3's roughly $0.09/GB every time a photo is downloaded) is the cheapest realistic choice once you have real traffic, with **MinIO** in Docker for local dev. **Backblaze B2** is even cheaper on raw storage (~$0.006/GB) if egress matters less to you than storage cost. Generate signed URLs for private objects; never make the bucket public.

**Cache/session layer.** Redis for session/token blacklisting, planner result caching (regenerating an AI itinerary for "Rome, 2 days" repeatedly is wasteful), and rate-limiting counters.

**AI planner service.** A dedicated backend service (could be a NestJS module or a separate microservice) that: (1) takes the user's request + city, (2) calls an LLM (e.g., the Claude API) with a structured-output prompt asking for a day-by-day list of named points of interest, (3) geocodes each point of interest against a places dataset/API (Google Places, Foursquare, or OpenStreetMap/Nominatim if you want to avoid Google's licensing costs), (4) calls a routing API — **Mapbox Directions** is the natural default now that the map stack is Mapbox (OpenRouteService or self-hosted OSRM remain fallbacks) — to get a walkable path between the day's stops in order, (5) returns structured JSON the client renders as pins + route. Keep the LLM call and the geocoding/routing call as separate, cacheable steps — don't let hallucinated place names go straight onto the map without a geocoding confidence check.

**Boarding passes.** Store the uploaded file/photo as a private document, and optionally parse the IATA barcode (PDF417 format, used by essentially every airline) client-side with a barcode-scanning library to auto-extract flight number, date, and passenger name — this saves the user from manual entry and lets you auto-populate a "Flights" section per trip.

## 5. The 3D globe, specifically

Using **Mapbox GL JS** — via its native **`globe` projection** — is actually a strong simplification of the two-tier problem: instead of stitching together a separate globe library and a separate map library, one engine handles both ends. Mapbox GL added a built-in globe projection (with atmosphere/fog shading, day-lit terminator, and satellite imagery draped over the sphere) that smoothly interpolates into standard Web Mercator as the user zooms in — at roughly zoom level 5 it flattens into the familiar 2D/3D map, complete with 3D buildings, terrain, and satellite-or-vector styles. That single continuous transition is exactly the "zoom in and see detail" behavior you described, so it removes the need for a manual cross-fade between two different rendering engines.

A few implementation specifics:

- **On mobile**, you won't embed the JS library directly — you'll use **`@rnmapbox/maps`** (the React Native wrapper around Mapbox's native iOS/Android Maps SDKs), which shares the same style spec and, as of Mapbox Maps SDK v11, also supports the globe projection. It's a native map view, not a WebView, so it stays performant with a full trip's worth of arcs on screen.
- **Arcs (origin → destination).** Draw each trip's arc as a `LineString` in a GeoJSON source, interpolated along a great-circle path (Turf.js's `greatCircle()` does this in a couple of lines) rather than a straight line — over a globe projection a great-circle arc reads as a smooth curve, and Mapbox's `line-gradient`/`line-dasharray` paint properties let you animate the "active trip" arc (pulsing, or a moving dot along the path) versus dimming past-trip arcs.
- **Zoomed-in detail.** Once flattened, turn on Mapbox's `fill-extrusion` layer for 3D buildings and its terrain/hillshade layer for elevation — this is what gives the "I can see details of the place I zoomed into" feel without you sourcing any imagery yourself.
- **Cost.** Mapbox is usage-metered past a fairly generous free tier (billed per map load / per tile request). Budget for this line item once you have real traffic, and restrict your access tokens (URL/bundle-ID scoping) to avoid key abuse. If cost ever becomes a blocker, MapLibre GL (the open-source fork Mapbox itself maintains behind the scenes) added its own globe projection in v4 and is a drop-in-ish style-spec-compatible fallback — worth keeping in your back pocket, not needed at MVP.
- **Offline caching** (see §9) is supported via Mapbox's offline region APIs, which matters a lot for a travel app specifically.

## 6. Social layer & privacy model

Model privacy as **row-level flags enforced server-side**, not a client-side filter — the API should simply never return another user's private rows to anyone but the owner, regardless of what the mobile UI shows. In Postgres this maps well to **Row-Level Security (RLS) policies**: a policy on `trips`, `notes`, and `photos` that says "visible if `owner_id = current_user` OR (`is_public = true` AND requester follows owner OR trip has no follow-gating)". Expenses get no public-read policy at all, full stop — that's your strongest guarantee against an accidental leak, since it's enforced at the database layer, not just in application code.

Other things worth deciding early: whether public profiles are open to anyone or gated behind "followers only," how blocking/reporting works (you'll need it — any public-content social feature eventually needs abuse handling), and whether photo uploads run through any moderation (at minimum, automated NSFW/CSAM scanning before anything goes public — this isn't optional once you allow public image sharing). No AWS Rekognition needed: **Google Cloud Vision SafeSearch** has a free tier (1,000 images/month, then ~$1.50/1,000) that likely covers you until the app has real traffic, and **NSFWJS** or **NudeNet** are free, open-source, self-hostable models (run as a small container next to the media worker) if you'd rather pay compute than a per-image API fee.

## 7. Security checklist

- **Auth.** Support email/password plus native Sign in with Apple and Google OAuth, as you described — on first OAuth login with no matching account, create the account transparently. Use short-lived JWT access tokens + rotating refresh tokens stored in secure device storage (iOS Keychain / Android Keystore via a library like `expo-secure-store`), never in plain AsyncStorage.
- **Transport.** TLS everywhere, HSTS on the API, and consider certificate pinning in the mobile app given it's handling boarding passes and location history.
- **At-rest encryption.** Encrypt boarding-pass/document fields and any raw passport-adjacent data at the application layer (not just relying on disk encryption), so a DB dump alone doesn't expose travel documents.
- **Authorization.** Enforce ownership checks and the privacy rules from §6 in every endpoint, backed by Postgres RLS as defense-in-depth.
- **Secrets.** Docker secrets (free, built into Compose/Swarm, fine for a solo/small-team setup) or, if you want a proper UI and access control later, **Infisical** — open-source, self-hostable for free (or a generous free-tier hosted plan) — rather than AWS Secrets Manager. Either way: never baked into images or committed to the repo.
- **Rate limiting & abuse.** Especially on auth endpoints, the planner (LLM calls cost money per request), and the social follow/report endpoints.
- **Compliance.** Because you're storing location history, photos, and travel documents across a global user base, budget time for GDPR-style requirements: data export, account deletion that actually cascades, and a clear retention policy for deleted trips/photos in object storage.
- **Payments (if you monetize).** Never touch raw card data — use Stripe/RevenueCat and store only their tokens/customer IDs.

## 8. Infrastructure & DevOps

### 8.1 Where to actually host it (no AWS)

A single small VPS is genuinely enough to run the whole backend (API, Postgres, Redis, MinIO/reverse proxy) for a while — this app's traffic pattern doesn't need a hyperscaler until you have real scale. As of this writing:

| Provider                  | Cheapest usable plan                                                                     | Price          |
| ------------------------- | ---------------------------------------------------------------------------------------- | -------------- |
| **Hetzner** (recommended) | CX22 — 2 vCPU, 4GB RAM, 40GB NVMe                                                        | ~$3.60–5/month |
| DigitalOcean              | Basic droplet — 1 vCPU, 1GB RAM, 25GB SSD                                                | ~$6/month      |
| Contabo                   | 4 vCPU, 8GB RAM (heavily oversold CPU — fine for dev, less predictable for prod DB load) | ~$4/month      |

Hetzner is the best price-to-reliability ratio for self-hosting Postgres specifically; Contabo's specs look better on paper but its shared-CPU oversell tends to show up as latency spikes under real database load. Either way, this replaces AWS EC2/RDS entirely at a fraction of the cost — a comparable AWS `db.t3.medium` RDS instance alone runs well over $50/month before storage and backup costs.

- **Local dev**: Docker Compose with Postgres+PostGIS, Redis, MinIO (S3-compatible), and the API service — one `docker compose up` should give a contributor a working backend.
- **CI/CD**: GitHub Actions running lint/tests/migrations on PRs; separate mobile CI (EAS Build if using Expo) for iOS/Android builds.
- **Migrations**: Prisma Migrate or TypeORM migrations, checked into the repo — never hand-edit prod schema.
- **Observability**: Sentry for crash/error reporting on both mobile and backend, structured logs, and basic Prometheus/Grafana (or a hosted equivalent) once you have real traffic — you'll especially want to watch LLM/planner latency and cost separately from normal API latency.
- **Media pipeline**: generate thumbnails/compressed variants on photo upload (a queue worker, not inline in the request) so the globe/feed never loads full-resolution originals.

## 9. Offline-first considerations

**Update:** this is no longer a "nice to have polish item" — it's now a gating milestone. Offline sync must be built and verified end-to-end (notes, expenses, photos, documents) _before_ social features start, per the build order in §11. The reasoning: social introduces public/private visibility state that has to survive sync correctly (a note created offline and marked public shouldn't leak, or silently vanish, the moment it syncs), and it's much easier to get that right if the sync engine is already proven solid against a simple, private-only data model first. Building social on top of a half-finished sync layer means debugging two hard problems (sync correctness and privacy correctness) at once.

Travelers are frequently offline or on bad connections — this is arguably the most important non-obvious requirement for this app. Design the client to write notes, expenses, and photo captures to a local store first (SQLite via WatermelonDB or Realm) and sync to the backend opportunistically, with a simple conflict strategy (last-write-wins is usually fine for personal journal-style data). At minimum, let users pre-download a city's map tiles and their itinerary before landing somewhere with no data plan.

"Done" for this phase means, concretely: a user can create/edit/delete notes, expenses, photo captures, and documents entirely airplane-mode, across an app restart, and have all of it reconcile correctly against the backend the next time connectivity returns — including the case where the same record was edited on two devices before either synced.

## 10. Feature ideas worth considering for later phases

A collaborative mode where a trip can have co-editors (couples/groups planning together); a "memories" resurfacing notification (like "1 year ago you were in Lisbon"); automatic trip statistics (countries visited, % of world, total distance — strong sharing hook); a packing list per trip with smart suggestions based on destination/season; weather forecast integration once a trip is close; flight status tracking via a flight-data API; exporting a trip as a PDF photobook; and a discovery feed where users can browse other public itineraries for a city they're about to visit — this ties the social layer directly back into the planner and is a natural growth loop.

## 11. Suggested build order (MVP phasing)

1. **Foundations**: auth (incl. Google/Apple), Postgres+PostGIS schema, country/city dataset import, empty trip CRUD.
2. **Core private journal**: trip creation flow, notes, expenses + charts — no globe yet, just lists/forms, to validate the data model fast.
3. **The globe**: Mapbox GL globe projection with real great-circle arcs from real trip data; basic styling, no 3D buildings/terrain yet.
4. **Zoom & detail**: enable the flatten-to-Mercator transition, 3D buildings/terrain layers, and offline region caching.
5. **Photos & documents**: upload pipeline, boarding-pass capture/parsing.
6. **Offline-first sync (gate before social)**: local-first store (WatermelonDB), push/pull sync engine with conflict resolution, background sync, and offline map/itinerary caching — built and verified end-to-end across notes, expenses, photos, and documents. Treat this as a hard checkpoint: don't start §11.7 until sync has been tested against real airplane-mode/multi-device scenarios, not just happy-path online use.
7. **Social**: public/private flags, RLS policies, follow system, public profile view — now layered on top of a sync engine already proven to handle the private-only data model correctly.
8. **AI planner**: LLM itinerary generation + geocoding + routing, editable itinerary UI.
9. **Polish**: stats, gamification, moderation tooling.

## 12. Open decisions worth making before prompting Claude Code

- React Native vs. Flutter (recommendation above: RN + Expo dev-client).
- Mapbox GL (chosen) — decide now whether to also stand up a MapLibre fallback path early, or defer that until cost/traffic actually justifies it (recommendation: defer).
- Places/geocoding provider: Google Places (best data, real cost) vs. OpenStreetMap/Nominatim (free, requires more cleanup) — note Mapbox also has its own Geocoding API, which may be simpler to pair with a Mapbox-based map stack.
- Self-hosted vs. managed Postgres in production.
- Whether the LLM planner calls go directly to the Claude API from your backend, or through an intermediate orchestration layer if you expect to swap models later.

---

_Next step: once you've made the calls in §12, this document can be broken into per-module specs (auth, trips, globe, planner, social) — each one turned into a focused prompt for Claude Code so it builds one vertical slice at a time instead of the whole app at once._
