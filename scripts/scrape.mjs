#!/usr/bin/env node
/**
 * Scrapes the latest episode of each tracked show from tamildhool.tech and
 * writes data/shows.json.
 *
 * Per show: fetch the episode-listing page -> take the newest episode link ->
 * fetch that episode page -> pull the Dailymotion or Bunny video id out of the
 * thumbnail <img> the page embeds.
 *
 * A show that fails for any reason keeps its previous shows.json entry and logs
 * a warning. One broken show must never break the file or the deploy.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TRACK_FILE = join(ROOT, 'data', 'shows-to-track.json')
const OUT_FILE = join(ROOT, 'data', 'shows.json')

// tamildhool returns 403 to non-browser user agents.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

// The two known embed patterns, both surfaced as thumbnail <img> tags.
const DAILYMOTION_THUMB = /https:\/\/(?:www\.)?dailymotion\.com\/thumbnail\/[^/]+\/video\/([A-Za-z0-9]+)/
const BUNNY_THUMB = /https:\/\/(vz-[a-z0-9-]+\.b-cdn\.net)\/([0-9a-fA-F-]{36})\/thumbnail\.jpg/
const EPISODE_DATE = /-(\d{2}-\d{2}-\d{4})-/

const CONCURRENCY = 4
const FETCH_TIMEOUT_MS = 20_000
const RETRIES = 2

/**
 * A show whose newest available episode is older than this has gone quiet at
 * the source — ended, on a break, or renamed. Matches STALE_AFTER_DAYS in
 * src/shows.js so the daily log and the orange badge in the app agree.
 */
const STALE_AFTER_DAYS = 4

const warnings = []
function warn(slug, message) {
  warnings.push(`${slug}: ${message}`)
  console.warn(`  ! ${slug}: ${message}`)
}

async function fetchHtml(url) {
  let lastError
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt))
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`fetch failed for ${url} (${lastError?.message ?? 'unknown'})`)
}

/** Newest episode link on a listing page: first child link that isn't pagination. */
function findLatestEpisodeUrl(html, listUrl) {
  const base = listUrl.endsWith('/') ? listUrl : `${listUrl}/`
  const pattern = new RegExp(
    `href="(${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"]+?/)"`,
    'g',
  )
  for (const match of html.matchAll(pattern)) {
    const href = match[1]
    if (/\/page\/\d+\/$/.test(href)) continue
    return href
  }
  return null
}

/** Both embed options a page offers, either of which may be absent. */
function extractCandidates(html) {
  const dm = html.match(DAILYMOTION_THUMB)
  const bunny = html.match(BUNNY_THUMB)
  return {
    dailymotion: dm
      ? {
          source: 'dailymotion',
          videoId: dm[1],
          thumbnail: `https://www.dailymotion.com/thumbnail/1280x720/video/${dm[1]}`,
        }
      : null,
    bunny: bunny
      ? {
          source: 'bunny',
          videoId: bunny[2],
          thumbnail: `https://${bunny[1]}/${bunny[2]}/thumbnail.jpg`,
        }
      : null,
  }
}

/**
 * Confirms a Dailymotion video is actually playable and gets its length.
 * The duration matters: the modern Dailymotion player no longer emits the
 * legacy postMessage playback events, so the auto-advance queue has no way to
 * hear "this episode ended" and times the hand-off off this number instead.
 *
 * Returns null for anything dead, private, or non-embeddable, which lets the
 * caller fall back to the Bunny copy rather than queueing a broken video.
 */
async function verifyDailymotion(videoId) {
  const url = `https://api.dailymotion.com/video/${videoId}?fields=duration,status,allow_embed`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    const data = await res.json()
    if (!res.ok || data.error) return null
    if (data.status !== 'published' || data.allow_embed === false) return null
    const duration = Number(data.duration)
    return { duration: Number.isFinite(duration) && duration > 0 ? duration : null }
  } catch {
    return null
  }
}

async function scrapeShow(show) {
  const listHtml = await fetchHtml(show.listUrl)
  const episodeUrl = findLatestEpisodeUrl(listHtml, show.listUrl)
  if (!episodeUrl) throw new Error('no episode link found on listing page')

  const episodeHtml = await fetchHtml(episodeUrl)
  const candidates = extractCandidates(episodeHtml)
  if (!candidates.dailymotion && !candidates.bunny) {
    throw new Error(`no dailymotion or bunny embed found on ${episodeUrl}`)
  }

  // Dailymotion wins when it is genuinely playable, because it is the only
  // source that can embed. A dead one falls through to Bunny instead of
  // becoming a broken card.
  let video = null
  if (candidates.dailymotion) {
    const meta = await verifyDailymotion(candidates.dailymotion.videoId)
    if (meta) video = { ...candidates.dailymotion, duration: meta.duration }
    else warn(show.slug, `dailymotion video ${candidates.dailymotion.videoId} is not playable`)
  }
  if (!video) video = candidates.bunny
  if (!video) throw new Error('dailymotion video unplayable and no bunny fallback')

  const dateMatch = episodeUrl.match(EPISODE_DATE)
  if (!dateMatch) throw new Error(`no episode date in url ${episodeUrl}`)

  return {
    title: show.title,
    titleTamil: show.titleTamil,
    channel: show.channel,
    episodeLabel: dateMatch[1],
    thumbnail: video.thumbnail,
    source: video.source,
    videoId: video.videoId,
    // Seconds; present for playable Dailymotion episodes only.
    ...(video.duration ? { duration: video.duration } : {}),
  }
}

/** Whole days between an episode label ('DD-MM-YYYY') and today, or null. */
function daysOld(label) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(label ?? '')
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today - new Date(Number(yyyy), Number(mm) - 1, Number(dd))) / 86_400_000)
}

/** Runs tasks with a fixed worker pool so we don't hammer the site. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  const tracked = JSON.parse(await readFile(TRACK_FILE, 'utf8')).shows

  let previous = {}
  try {
    previous = JSON.parse(await readFile(OUT_FILE, 'utf8'))
  } catch {
    console.log('No existing shows.json — starting fresh.')
  }

  console.log(`Scraping ${tracked.length} shows...`)

  let scraped = 0
  const entries = await mapLimit(tracked, CONCURRENCY, async (show) => {
    try {
      const entry = await scrapeShow(show)
      scraped++
      const length = entry.duration ? ` ${Math.round(entry.duration / 60)}min` : ''
      console.log(`  ok ${show.slug} -> ${entry.source} ${entry.episodeLabel}${length}`)
      return [show.slug, entry]
    } catch (err) {
      warn(show.slug, err.message)
      const kept = previous[show.slug]
      if (kept) {
        console.warn(`    keeping previous entry (${kept.episodeLabel})`)
        return [show.slug, kept]
      }
      console.warn('    no previous entry to keep — show omitted')
      return null
    }
  })

  // Rebuilt in shows-to-track.json order so the file diffs cleanly day to day
  // and shows removed from tracking drop out.
  const output = Object.fromEntries(entries.filter(Boolean))
  await writeFile(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  // A scrape can succeed while the source simply has nothing newer. That reads
  // as "ok" above and is otherwise invisible until the badge in the app turns
  // orange days later, so call it out here too.
  for (const [slug, entry] of Object.entries(output)) {
    const age = daysOld(entry.episodeLabel)
    if (age !== null && age > STALE_AFTER_DAYS) {
      warn(slug, `no new episode at the source for ${age} days (latest ${entry.episodeLabel})`)
    }
  }

  console.log(`\nWrote ${Object.keys(output).length} shows (${scraped} freshly scraped).`)
  if (warnings.length) {
    console.warn(`${warnings.length} warning(s):`)
    for (const w of warnings) console.warn(`  - ${w}`)
  }

  // Every single show failing means the site structure changed, not bad luck.
  // shows.json is already written with preserved data, so nothing is lost.
  if (scraped === 0 && tracked.length > 0) {
    console.error('\nAll shows failed — tamildhool.tech structure has likely changed.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`)
  process.exit(1)
})
