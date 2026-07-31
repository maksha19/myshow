# Tamil Serials — Direct Link

Open the app, tap a show, the episode plays. No listing pages, no player
picker, no ad-wrapper detour.

See [CLAUDE.md](CLAUDE.md) for the design rationale and the verified findings
about the upstream video hosts.

## How it works

```
scripts/refresh.sh  (daily, from a home machine)
        │  node scripts/scrape.mjs  →  commit + push
        ▼
data/shows.json  ──imported at build time──►  React SPA  ──►  GitHub Pages
                        (.github/workflows/deploy.yml, on push to main)
```

There is no server. Deploys are fully automatic on push; only the scrape step
needs a machine, and only because of the Cloudflare block described below.

## Everyday tasks

**Add or remove a show** — edit [data/shows-to-track.json](data/shows-to-track.json),
commit, done. It is the only file meant to be hand-edited. Each entry needs:

| field        | meaning                                              |
| ------------ | ---------------------------------------------------- |
| `slug`       | unique URL key, used as `/#/watch/<slug>`             |
| `title`      | English title shown under the Tamil one               |
| `titleTamil` | main title on the card                                |
| `channel`    | grouping heading on the home page                     |
| `listUrl`    | the show's episode-listing page on tamildhool.tech    |

To find a `listUrl`, open the show on tamildhool.tech and copy the URL of the
page that lists its episodes (not an individual episode).

**Refresh episodes** — `./scripts/refresh.sh`. It scrapes, and if anything
changed, commits and pushes; the push redeploys the site on its own. Run it on
a schedule as below.

**Run locally** — `npm install`, then `npm run dev`.

## Daily refresh

> **The scrape cannot run on GitHub Actions.** tamildhool.tech is behind a
> Cloudflare challenge that blocks hosted runners. Measured from a runner
> (IP `172.174.198.67`): every request to the host returns `403` with
> `cf-mitigated: challenge` — bare curl, full browser headers, HTTP/1.1, the
> RSS feed and the wp-json API alike — while a control request to
> `api.dailymotion.com` returns `200`. Clearing the challenge needs a real
> browser, so no header tweak fixes it. A residential connection passes it,
> which is why the same script works from home.

So schedule `scripts/refresh.sh` on a machine at home. On macOS, with launchd —
save as `~/Library/LaunchAgents/com.maksha.myshow.refresh.plist`, fixing the
path to the repo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>com.maksha.myshow.refresh</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/a2006035/Documents/maksha/Direct-Link/scripts/refresh.sh</string>
  </array>
  <!-- 01:30 local, after the day's episodes are posted. -->
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>   <integer>1</integer>
    <key>Minute</key> <integer>30</integer>
  </dict>
  <!-- Catches up after the Mac has been asleep at the scheduled time. -->
  <key>RunAtLoad</key>        <false/>
  <key>StandardOutPath</key>  <string>/tmp/myshow-refresh.log</string>
  <key>StandardErrorPath</key><string>/tmp/myshow-refresh.log</string>
</dict>
</plist>
```

Then `launchctl load ~/Library/LaunchAgents/com.maksha.myshow.refresh.plist`.
Check it with `tail /tmp/myshow-refresh.log`.

If the Mac is asleep at 01:30 the job runs at next wake. A missed day is
harmless — the app keeps showing the previous episode until the next run.

The `Scrape latest episodes` workflow is still in the repo for manual runs and
would work unchanged on a self-hosted runner, which is the other way to get
this automated.

## First-time deploy (GitHub Pages)

Already done for [maksha19/myshow](https://github.com/maksha19/myshow) — live at
**https://maksha19.github.io/myshow/**. Pages source is set to *GitHub Actions*
and workflow permissions to *Read and write*.

To set it up somewhere else:

1. Push the repo to GitHub with `main` as the default branch.
2. **Settings → Pages → Source: GitHub Actions.**
3. **Settings → Actions → General → Workflow permissions: Read and write.**
4. Push, or run the *Deploy to GitHub Pages* workflow manually.

The build derives its base path from the repo name automatically, so renaming
the repo needs no code change.

Routing uses `HashRouter` (`/#/watch/<slug>`) so a direct load or reload of any
route works on a static host with no rewrite rules.

**On the grandparents' device:** open the site, then *Add to Home Screen*. It
launches full-screen with its own icon and no browser chrome.

## My list & play-all

The home page has two entry buttons:

- **தொடங்கு / Start** — plays the list through once, then shows a *Play again*
  screen.
- **தொடர்ந்து / Loop** — same order, but restarts from the top and never stops.

**Edit list & order** (`/#/manage`) sets which shows are in the queue and what
order they play in, with ▲▼ and checkboxes. Once a custom order exists the home
grid drops its channel headings and shows that one flat order, so what you see
is what will play.

> **Saved on that device only.** The order lives in `localStorage`, so an order
> set on your phone will not appear on the grandparents' tablet — set it up on
> the device they actually use.

### How it knows an episode ended

It uses a timer, not a player event, and that is a deliberate workaround.
Dailymotion's current player no longer emits the legacy `postMessage` playback
events — an embed loaded with `api=postMessage` sends only internal `pes_*`
storage messages, never `apiready` or `end` — and the SDK that does emit them
requires an account-owned player id we don't have.

So the scraper records each episode's real length from Dailymotion's public
metadata API (no auth needed) into `duration`, and the queue runs on that
clock. The clock pauses while the tab is hidden, since a backgrounded video is
paused too.

**It advances ~6s *before* the episode ends, on purpose.** Letting a video
reach its last frame hands control to Dailymotion, which shows its own
"next video" card and auto-plays an unrelated video about 5 seconds later —
the queue loses the session and you end up watching random Dailymotion
content instead of the next serial. Swapping the iframe slightly early means
that screen is never reached. The cost is the last few seconds of closing
credits.

The suppression parameters (`queue-autoplay-next=false` and friends) are sent
too, but **they do not work** — measured side by side, an embed carrying them
was hijacked exactly like a control embed with none, and the takeover happens
in-place with no iframe `load` event, so it can't be detected either. The
lead-out is the entire defence. Tune it with `LEAD_OUT_MS` in
[src/pages/Play.jsx](src/pages/Play.jsx).

### Testing the queue without waiting 22 minutes

Add `test=1`:

```
#/play?mode=once&test=1
```

Each episode starts 40s from its end and advances after 25s, so the queue hits
the real end-of-episode boundary — the exact moment Dailymotion tries to take
over — every ~25 seconds. If the counter climbs `1 / 21 → 2 / 21 → 3 / 21`
with a different serial each time, auto-advance is working. If you ever land on
unrelated Dailymotion content, it is not.

Note the clock is wall-clock, not playback position: **dragging the player's
seek bar desyncs it.** Let it play untouched when testing, or use Next.

The practical limit: if playback starts late — most likely a browser blocking
autoplay until someone taps play — the timer runs ahead of the video and can
advance early. The large **அடுத்தது / Next** and **முந்தையது / Previous**
buttons are always there for that.

## Two kinds of episode

The scraper records which video source each episode uses, because they behave
very differently:

- **`dailymotion`** (21 of 24 shows at time of writing) — plays inline in the
  app via Dailymotion's official embed. This is the good path.
- **`bunny`** — *cannot* be embedded. The wrapper sends
  `X-Frame-Options: SAMEORIGIN` and the CDN referer-locks its HLS manifest, so
  the app shows a labelled "Open episode" button that hands off to the original
  site instead. Those cards are marked `↗` on the home page, are listed as
  "cannot autoplay" on the manage page, and are **left out of the play-all
  queue** — there is no way to play them inline, so the queue skips them.

Broken links are caught before they reach the queue: the scraper checks every
Dailymotion id against the metadata API and rejects anything unpublished,
private, or non-embeddable, falling back to the Bunny copy for that episode
rather than queueing a video that won't play.

Which one a show uses is decided by tamildhool per episode and can change day
to day. Nothing needs doing when it does.

## When something breaks

**A show's card shows an old date in orange.** Its episode is more than 4 days
stale, which almost always means the scrape is failing for that one show. Check
the Actions log for a `!` warning line naming the slug. A show that fails keeps
its previous entry rather than disappearing, by design.

**Every show fails at once.** The scraper exits non-zero with
"tamildhool.tech structure has likely changed". `data/shows.json` is left
intact, so the site keeps serving yesterday's data. Fix the patterns in
[scripts/scrape.mjs](scripts/scrape.mjs) — `DAILYMOTION_THUMB`, `BUNNY_THUMB`,
and `findLatestEpisodeUrl` are the parts coupled to the site's HTML.

**Bunny shows' "Open episode" button 404s or 403s.** The wrapper domains
rotate. Open any tamildhool episode that uses the Plyr/Bunny player, follow its
player link, and see where it lands now; put that origin in
`BUNNY_WRAPPER_ORIGIN` at the top of [src/pages/Watch.jsx](src/pages/Watch.jsx).

## Scope

Built for family use. Not for redistribution — the underlying content is not
owned by this project, tamildhool, or the uploaders.
