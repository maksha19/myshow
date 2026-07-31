import showsJson from '../data/shows.json'

/**
 * Imported at build time on purpose. The data file changes once a day via the
 * scraper Action, and that commit redeploys the site — a runtime fetch would
 * add a loading state and a failure mode for no benefit.
 */
export const shows = showsJson

export const showList = Object.entries(shows).map(([slug, show]) => ({ slug, ...show }))

export function getShow(slug) {
  return shows[slug] ? { slug, ...shows[slug] } : null
}

/** Episode labels are 'DD-MM-YYYY' as they appear in the source URL. */
function parseEpisodeDate(label) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(label ?? '')
  if (!match) return null
  const [, dd, mm, yyyy] = match
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Whole days between an episode date and today, in local time. */
export function daysAgo(label) {
  const date = parseEpisodeDate(label)
  if (!date) return null
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return Math.round((startOfToday - date) / 86_400_000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Recent episodes read better as 'Today'/'Yesterday' than as a date — that is
 * the question actually being asked when someone opens this.
 */
export function formatEpisode(label) {
  const days = daysAgo(label)
  if (days === null) return { en: label ?? '', ta: '' }
  if (days <= 0) return { en: 'Today', ta: 'இன்று' }
  if (days === 1) return { en: 'Yesterday', ta: 'நேற்று' }

  const date = parseEpisodeDate(label)
  const short = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  if (days < 7) return { en: short, ta: `${days} நாட்களுக்கு முன்` }
  return { en: short, ta: '' }
}

/** Past this, the scraper has probably been failing rather than the show being off air. */
export const STALE_AFTER_DAYS = 4

export function isStale(label) {
  const days = daysAgo(label)
  return days !== null && days > STALE_AFTER_DAYS
}
