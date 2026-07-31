/**
 * Point embeds straight at the player host.
 *
 * The friendly URL, https://www.dailymotion.com/embed/video/<id>, 301-redirects
 * to geo.dailymotion.com/player.html?video=<id> and **drops every query
 * parameter on the way** (verified: the final URL retains only `video`). So
 * options set on the friendly URL silently do nothing — which is why the
 * up-next screen kept appearing despite queue-enable=false being set.
 *
 * Addressing the player host directly at least delivers the parameters. Note
 * that Dailymotion may still ignore them on a free embed, so the queue does
 * not rely on this alone; see LEAD_OUT_MS in pages/Play.jsx.
 */
const PLAYER_URL = 'https://geo.dailymotion.com/player.html'

export function dailymotionEmbedUrl(videoId, { autoplay = true, startTime } = {}) {
  const params = new URLSearchParams({
    video: videoId,
    autoplay: String(autoplay),
    // Honoured by the player (unlike the suppression params below), which is
    // what makes the queue's test mode possible.
    ...(startTime ? { startTime: String(Math.floor(startTime)) } : {}),
    // Suppress Dailymotion's own "next video" behaviour: it hijacks the
    // session into unrelated videos when an episode ends.
    'queue-enable': 'false',
    'queue-autoplay-next': 'false',
    'endscreen-enable': 'false',
    'sharing-enable': 'false',
  })
  return `${PLAYER_URL}?${params}`
}
