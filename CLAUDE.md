# Tamil Serial Direct-Link App

## Purpose

Grandparent-friendly React SPA that removes the friction of watching daily
Tamil serials from tamildhool.tech. Today, watching an episode requires:
listing page → episode page → pick a player → external ad-wrapped page
(`teamstoday.com`) → fight an auto-unmute glitch → dismiss a fake "continue"
popup → get hijacked into a new tab → come back and manually unmute.

This app replaces that entire flow with: **open app → tap show → video
plays.**

No backend server. A scheduled job prepares a static data file; the SPA is
a pure static site that reads it.

---

## Root Cause Analysis (already verified — do not re-investigate)

Each tamildhool episode page embeds a video via one of two sources, visible
directly in the page DOM:

1. **Dailymotion** — `<img src="https://www.dailymotion.com/thumbnail/1280x720/video/{id}">`
   wrapped in a link to `teamstoday.com/?video={id}`.
2. **Bunny Stream / "Plyr Player"** — `<img src="https://vz-8cf4325c-bc5.b-cdn.net/{id}/thumbnail.jpg">`,
   also wrapped in a link to `teamstoday.com/?video={id}`.

`teamstoday.com` is a confirmed **cloaking / ad-redirect domain** — its own
homepage claims "no automated redirection, hidden behavior, or embedded
content is used," which contradicts the actual autoplay/popup/tab-hijack
behavior. This domain is the entire source of the pain point, not the
underlying video hosts.

### Verified findings

- **Dailymotion path is solved, but embed the player host directly.**
  Dailymotion is a public platform designed for third-party embedding; no
  referer-lock, no cloaking. However:
  ```
  https://www.dailymotion.com/embed/video/{video_id}   ← do NOT use
  https://geo.dailymotion.com/player.html?video={id}   ← use this
  ```
  **Verified 2026-07-31:** the `/embed/video/` URL 301-redirects to the
  player host and **drops every query parameter in the process** — the final
  URL keeps only `video`. Anything set on it (`autoplay`, `queue-enable`,
  `endscreen-enable`, …) silently has no effect. This caused two real bugs:
  autoplay never engaged, and Dailymotion's own "next video" end card took
  over when an episode finished, auto-playing unrelated videos ~5s later.
  All embed URLs are built in one place, `src/dailymotion.js`.

  Dailymotion may still ignore the suppression parameters on a free embed, so
  nothing depends on them alone — see the queue's lead-out below.

- **Bunny Stream path cannot be embedded directly.** The CDN pull zone
  (`vz-8cf4325c-bc5.b-cdn.net`) is **referer-locked** — confirmed via a
  direct browser navigation to a raw video file URL, which returned
  **403 Forbidden**. A `<video>` tag on our own domain will always get
  blocked the same way; only requests whose Referer is `teamstoday.com`
  (or tamildhool.tech) are allowed through. There is no frontend-only way
  around this.
  - **The sandboxed-iframe fallback does not work. Verified 2026-07-31 —
    this supersedes the original plan.** Two independent server-side blocks,
    either one of which alone is fatal:
    1. `teamstoday.com` is now only a `<meta http-equiv="refresh">`
       interstitial that forwards to **`startuphappy.com`**, which is the
       host actually serving the player. `teamstoday.com` returns **403** to
       every Referer except `tamildhool.tech` — including ours.
    2. `startuphappy.com` responds with **`X-Frame-Options: SAMEORIGIN`**, so
       no iframe of it will ever render on our origin, sandboxed or not.

    Self-hosting a player is equally blocked: the HLS manifest
    (`vz-8cf4325c-bc5.b-cdn.net/{id}/playlist.m3u8`) returns **200** only for
    Referer `startuphappy.com` or `tamildhool.tech`, and **403** for ours.
    A browser will not let JS forge a `Referer`, so this is not routable
    around on the client.

    **Current handling:** the player screen shows a clearly labelled hand-off
    card with one large "Open episode" button going straight to
    `startuphappy.com` (skipping both tamildhool and the interstitial), plus
    a plain-language warning that the destination has ads. Home cards mark
    these shows with a `↗`.

    **The only real fix is a proxy** that re-writes the `Referer` — e.g. a
    Cloudflare Worker fronting the HLS manifest and segments. That is a
    backend, which this project deliberately does not have; adopting it
    would be a scope decision, not an implementation detail.

### Not every episode has both sources

Some episodes only expose the Bunny/Plyr option (no Dailymotion link at
all). The data model must record which source is available per episode,
not assume Dailymotion always exists.

---

## Architecture

Two decoupled pieces connected only by one committed JSON file:

```
[Scheduled scraper job] --writes--> data/shows.json --read by build--> [React SPA]
```

The SPA never scrapes anything at runtime (browser CORS blocks cross-origin
scraping of tamildhool.tech from client JS — confirmed constraint, not a
guess). All scraping happens offline/on-schedule, outside the deployed app.

### Data file shape (`data/shows.json`)

```json
{
  "singapenne": {
    "title": "Singapenne",
    "titleTamil": "சிங்கப்பெண்ணே",
    "episodeLabel": "12-07-2026",
    "thumbnail": "https://vz-8cf4325c-bc5.b-cdn.net/e9ffb3f0-.../thumbnail.jpg",
    "source": "bunny",
    "videoId": "e9ffb3f0-1c03-4a0c-8225-0b50c3a672ba"
  },
  "marumagal": {
    "title": "Marumagal",
    "titleTamil": "மருமகள்",
    "episodeLabel": "11-07-2026",
    "thumbnail": "https://www.dailymotion.com/thumbnail/1280x720/video/k4D1jknQO7SiZUHHdua",
    "source": "dailymotion",
    "videoId": "k4D1jknQO7SiZUHHdua"
  }
}
```

`source` is always `"dailymotion"` or `"bunny"` — this field decides which
embed strategy the player screen uses.

### Scheduled scraper job

- **Where:** GitHub Actions, cron-scheduled (daily).
- **Input:** `data/shows-to-track.json` — a manually maintained list of
  show slugs + their episode-listing URL pattern on tamildhool.tech. This
  is the one file a human edits directly to add/remove tracked shows.
- **Steps per tracked show:**
  1. Fetch the show's latest-episode page HTML.
  2. Parse DOM for the two known image/link patterns above.
  3. Extract `source` + `videoId`; capture title/date/thumbnail for
     display.
  4. Write the result into `data/shows.json` under that show's slug.
- **Failure handling:** if a show's page doesn't match either known
  pattern, leave its previous entry untouched and log a warning — one
  broken show must never break the whole file or the deploy.
- **Output:** commit `data/shows.json` back to the repo. The commit
  triggers the static host's normal build/deploy — no manual step needed
  once set up.

### React SPA

- **Routing:**
  - `/` — Home: card grid of tracked shows (thumbnail, title, episode
    label), each linking to `/watch/:slug`.
  - `/watch/:slug` — Player: looks up the show in `shows.json`, renders
    the embed matching its `source`, plus a large "back to shows" link.
- **Home page:** large tap targets, Tamil + English titles, optional
  simple client-side filter/search if the tracked list grows.
- **Player page embed logic:**
  - `source === "dailymotion"` → `<iframe src="https://www.dailymotion.com/embed/video/{videoId}">`
  - `source === "bunny"` → hand-off card linking to
    `https://startuphappy.com/?video={videoId}`. Embedding is impossible; see
    the Bunny finding above.
  - No other UI on this screen — its only job is clean autoplay.
- **Data loading:** import `shows.json` at build time (simplest — the
  file changes daily via the Action + redeploy anyway, no need for a
  runtime fetch).

---

## Deployment

- **Hosting:** static hosting (GitHub Pages, Netlify, or Vercel — any
  work; GitHub Pages is simplest if the repo already lives on GitHub).
- **Build:** standard Vite/CRA React build → static `dist`/`build` folder
  → deployed by host on every push to main (or a dedicated `data` branch
  if preferred, to separate data updates from code changes).
- **No server processes to run or maintain** — the GitHub Action is the
  only "moving part" outside the static site itself, and it runs on
  GitHub's infrastructure on a schedule.

---

## Build Phases

1. `data/shows-to-track.json` with the actual shows to track (start with
   5–10 real ones, not the full archive).
2. Scraper script (Node), run manually first against those shows to
   confirm correct `source`/`videoId` extraction for both DOM patterns.
3. Wire scraper into a scheduled GitHub Action; confirm it commits
   `shows.json` daily without manual intervention.
4. React SPA Home page, built against a hand-written sample
   `shows.json` (decouples UI work from scraper correctness).
5. Player page with both embed strategies (Dailymotion direct, Bunny
   sandboxed fallback).
6. Connect real scraped data end-to-end; deploy; test on the actual
   device the grandparents use.
7. Polish: font size, tap target size, Tamil labels, empty/error states
   (e.g. no episode found today for a show).

---

## Open Decisions (resolve before/at implementation start)

- Final list of shows to track initially.
- Hosting target: GitHub Pages vs Netlify vs Vercel.
- Branch strategy: single `main` branch for both code and data commits,
  or separate `data` branch to keep scraper commits distinct from code
  changes.
- Whether the scraper needs "new episode only" detection, or simply
  always takes whatever is currently the latest episode on each show's
  page (simpler — recommended default).

---

## Known Risks / Things Not to "Fix Away"

- `teamstoday.com` / `startuphappy.com` are cloaking domains, and they
  **rotate** — the chain moved from the former to the latter during build.
  The wrapper origin lives in one constant, `BUNNY_WRAPPER_ORIGIN` in
  `src/pages/Watch.jsx`; when Bunny shows stop working, follow a tamildhool
  player link to whatever it lands on now and update that string. The
  hand-off is a top-level navigation, so the user gets that site's full ad
  behaviour — the app does not and cannot make it "safe," it only shortens
  the path to the video.
- The underlying serial content is not owned by tamildhool, Dailymotion
  uploaders, or this project. This tool is being built for personal/family
  use, not for public redistribution at scale — keep it that way.
- Site structure on tamildhool.tech can change at any time and silently
  break the scraper's DOM patterns. The scraper's failure handling
  (skip + warn, don't crash the whole file) is there specifically for
  this reason — do not remove it for the sake of simplicity.