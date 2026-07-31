import { showList, getShow } from './shows.js'

/**
 * The viewing list lives in localStorage, per device — an order set on one
 * phone does not follow to another. Bump the version suffix if the stored
 * shape ever changes so old data is ignored rather than misread.
 */
const STORAGE_KEY = 'directlink.mylist.v1'

/** Bunny episodes cannot be embedded, so they can never join the queue. */
export function canAutoplay(show) {
  return show.source === 'dailymotion'
}

export function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return emptyPrefs()
    return {
      order: asSlugArray(parsed.order),
      excluded: asSlugArray(parsed.excluded),
    }
  } catch {
    // Private mode, disabled storage, or corrupt JSON — fall back to defaults.
    return emptyPrefs()
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Nothing useful to do if storage is unavailable; the session still works.
  }
}

export function clearPrefs() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function emptyPrefs() {
  return { order: [], excluded: [] }
}

function asSlugArray(value) {
  return Array.isArray(value) ? value.filter((s) => typeof s === 'string') : []
}

/**
 * Merges saved preferences against the shows that currently exist.
 * Slugs that have been dropped from tracking disappear; newly tracked shows
 * join the end of the list rather than being silently left out.
 */
export function buildMyList(prefs) {
  const seen = new Set()
  const ordered = []

  for (const slug of prefs.order) {
    const show = getShow(slug)
    if (show && !seen.has(slug)) {
      seen.add(slug)
      ordered.push(show)
    }
  }
  for (const show of showList) {
    if (!seen.has(show.slug)) ordered.push(show)
  }

  const excluded = new Set(prefs.excluded)
  return ordered.map((show) => ({
    ...show,
    included: !excluded.has(show.slug),
    playable: canAutoplay(show),
  }))
}

/** The shows the queue will actually play, in order. */
export function buildQueue(prefs) {
  return buildMyList(prefs).filter((show) => show.included && show.playable)
}
