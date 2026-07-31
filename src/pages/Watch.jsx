import { Link, useParams } from 'react-router-dom'
import { getShow, formatEpisode } from '../shows.js'
import { dailymotionEmbedUrl } from '../dailymotion.js'

/**
 * Host that actually serves the Bunny player. tamildhool links to
 * teamstoday.com, but that is now only a meta-refresh interstitial pointing
 * here — going direct skips a hop. These domains rotate; if Bunny-sourced
 * shows stop playing, open a tamildhool episode page, follow its player link
 * to whatever it lands on, and update this one string.
 */
const BUNNY_WRAPPER_ORIGIN = 'https://startuphappy.com'

export default function Watch() {
  const { slug } = useParams()
  const show = getShow(slug)

  if (!show) {
    return (
      <main className="watch watch-missing">
        <BackLink />
        <p className="empty">
          <span lang="ta" className="ta">
            இந்த நிகழ்ச்சி கிடைக்கவில்லை
          </span>
          <span className="en">That show is not available.</span>
        </p>
      </main>
    )
  }

  const episode = formatEpisode(show.episodeLabel)

  return (
    <main className="watch">
      <BackLink />
      <div className="watch-body">
        {/* Only a real embed gets the fixed 16:9 box; the hand-off card sizes
            to its own content. */}
        {show.source === 'dailymotion' ? (
          <div className="player">
            <Player show={show} />
          </div>
        ) : (
          <Player show={show} />
        )}
        <p className="watch-caption">
          {show.titleTamil && (
            <span lang="ta" className="ta">
              {show.titleTamil}
            </span>
          )}
          <span className="en">
            {show.title}
            {episode.en ? ` · ${episode.en}` : ''}
          </span>
        </p>
      </div>
    </main>
  )
}

function Player({ show }) {
  if (show.source === 'dailymotion') {
    // Official embed — no ad wrapper. See dailymotion.js for why this must
    // address the player host directly rather than the /embed/video/ URL.
    return (
      <iframe
        title={show.title}
        src={dailymotionEmbedUrl(show.videoId)}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        frameBorder="0"
      />
    )
  }

  // Bunny cannot be embedded at all — verified, not assumed:
  //   1. The wrapper sends X-Frame-Options: SAMEORIGIN, so no iframe of it
  //      will ever render on our origin.
  //   2. The HLS playlist on the Bunny CDN is referer-locked to the wrapper
  //      and tamildhool, and a browser will not let us forge a Referer, so a
  //      self-hosted player cannot fetch it either.
  // Both doors are shut client-side. The only honest option left is to hand
  // the episode off, which we do in one hop straight to the player host.
  return (
    <div className="fallback">
      <p>
        <span lang="ta" className="ta">
          இந்த எபிசோடை இங்கே இயக்க முடியாது
        </span>
        <span className="en">This episode can only play on the original site.</span>
      </p>
      <a
        className="fallback-button"
        href={`${BUNNY_WRAPPER_ORIGIN}/?video=${encodeURIComponent(show.videoId)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span lang="ta" className="ta">
          எபிசோடைத் திற
        </span>
        <span className="en">Open episode</span>
      </a>
      <p className="fallback-note">
        <span lang="ta" className="ta">
          அந்தத் தளத்தில் விளம்பரங்கள் வரும்.
        </span>
        <span className="en">That site shows ads and pop-ups.</span>
      </p>
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/" className="back">
      <span aria-hidden="true">←</span>
      <span lang="ta" className="ta">
        பின்செல்
      </span>
      <span className="en">All shows</span>
    </Link>
  )
}
