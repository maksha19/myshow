import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loadPrefs, buildQueue } from '../mylist.js'
import { dailymotionEmbedUrl } from '../dailymotion.js'

/**
 * How the queue knows an episode is over.
 *
 * Dailymotion's current player does NOT emit the legacy postMessage playback
 * events, and the SDK that does emit them needs an account-owned player id.
 * So there is nothing to listen to; the scraper records each episode's real
 * duration from Dailymotion's public API and the queue runs on a timer.
 *
 * We advance BEFORE the episode ends, not after. Letting a video reach its
 * final frame hands control to Dailymotion, which auto-plays an unrelated
 * video within ~5 seconds and the queue loses the session entirely.
 *
 * This lead-out is the ONLY thing that prevents that. Measured directly:
 * an embed carrying queue-enable=false, queue-autoplay-next=false and
 * endscreen-enable=false was hijacked exactly like a control embed with no
 * parameters at all, and the takeover happens in-place with no iframe `load`
 * event, so there is nothing to detect and nothing to switch off. Swapping
 * the iframe early is the whole defence — hence the generous margin.
 */
const LEAD_OUT_MS = 15_000
const FALLBACK_DURATION_MS = 22 * 60 * 1000

/**
 * Test mode (`#/play?test=1`): start each episode this many seconds from its
 * end instead of the beginning. The advance maths is unchanged, so the queue
 * hits the real end-of-episode boundary — the exact moment Dailymotion tries
 * to take over — every ~25s instead of every ~22min. For verifying hand-offs
 * without sitting through a full episode.
 */
const TEST_WINDOW_MS = 40_000

export default function Play() {
  const [params] = useSearchParams()
  const loop = params.get('mode') === 'loop'
  const testMode = params.get('test') === '1'

  // Snapshot the queue once so reordering elsewhere can't shift playback.
  const queue = useMemo(() => buildQueue(loadPrefs()), [])

  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [notice, setNotice] = useState(null)

  const indexRef = useRef(0)
  indexRef.current = index

  const current = finished ? null : queue[index]
  const [remaining, setRemaining] = useState(null)

  const advance = useCallback(
    (reason) => {
      const leaving = queue[indexRef.current]
      setNotice(reason === 'ended' || !leaving ? null : { title: leaving.title, reason })

      const next = indexRef.current + 1
      if (next < queue.length) {
        setIndex(next)
      } else if (loop) {
        setIndex(0)
      } else {
        setFinished(true)
      }
    },
    [queue, loop],
  )

  const goBack = useCallback(() => {
    setNotice(null)
    setFinished(false)
    setIndex((i) => (i > 0 ? i - 1 : queue.length - 1))
  }, [queue.length])

  /*
   * Runs the episode clock. Time only accrues while the tab is visible: if
   * the app is backgrounded the video is paused too, so counting through it
   * would advance past episodes nobody watched.
   */
  useEffect(() => {
    if (!current) return undefined

    const full = testMode
      ? TEST_WINDOW_MS
      : current.duration
        ? current.duration * 1000
        : FALLBACK_DURATION_MS
    // Never let the lead-out invert the clock on an unusually short video.
    const total = Math.max(5_000, full - LEAD_OUT_MS)
    let left = total
    let last = performance.now()

    const tick = () => {
      const now = performance.now()
      if (document.visibilityState === 'visible') left -= now - last
      last = now
      setRemaining(Math.max(0, left))
      if (left <= 0) advance('ended')
    }

    setRemaining(total)
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [current, advance, testMode])

  if (queue.length === 0) {
    return (
      <main className="play">
        <TopBar />
        <div className="play-message">
          <p>
            <span lang="ta" className="ta">
              இயக்க எதுவும் இல்லை
            </span>
            <span className="en">Nothing in the list can play automatically.</span>
          </p>
          <Link className="fallback-button" to="/manage">
            <span lang="ta" className="ta">
              பட்டியலை மாற்று
            </span>
            <span className="en">Edit my list</span>
          </Link>
        </div>
      </main>
    )
  }

  if (finished) {
    return (
      <main className="play">
        <TopBar />
        <div className="play-message">
          <p>
            <span lang="ta" className="ta">
              எல்லாம் முடிந்தது
            </span>
            <span className="en">All {queue.length} episodes finished.</span>
          </p>
          <button
            type="button"
            className="fallback-button"
            onClick={() => {
              setFinished(false)
              setNotice(null)
              setIndex(0)
            }}
          >
            <span lang="ta" className="ta">
              மீண்டும் பார்
            </span>
            <span className="en">Play again</span>
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="play">
      <TopBar
        position={`${index + 1} / ${queue.length}`}
        loop={loop}
        remaining={remaining}
      />

      {notice && (
        <p className="play-notice">
          <span lang="ta" className="ta">
            {notice.title} — இயக்க முடியவில்லை, அடுத்தது
          </span>
          <span className="en">
            Skipped {notice.title} ({notice.reason === 'timeout' ? 'did not load' : 'link not working'})
          </span>
        </p>
      )}

      <div className="player">
        {/* Keyed by slug so each episode gets a fresh player rather than a
            reused one that might not re-fire its events. */}
        <iframe
          key={current.slug}
          title={current.title}
          src={dailymotionEmbedUrl(current.videoId, {
            startTime:
              testMode && current.duration
                ? Math.max(0, current.duration - TEST_WINDOW_MS / 1000)
                : undefined,
          })}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          frameBorder="0"
        />
      </div>

      <p className="play-title">
        {current.titleTamil && (
          <span lang="ta" className="ta">
            {current.titleTamil}
          </span>
        )}
        <span className="en">{current.title}</span>
      </p>

      <div className="play-controls">
        <button type="button" onClick={goBack}>
          <span aria-hidden="true">⏮</span>
          <span lang="ta" className="ta">
            முந்தையது
          </span>
        </button>
        <button type="button" className="primary" onClick={() => advance('manual')}>
          <span aria-hidden="true">⏭</span>
          <span lang="ta" className="ta">
            அடுத்தது
          </span>
        </button>
      </div>
    </main>
  )
}

function TopBar({ position, loop, remaining }) {
  return (
    <div className="play-top">
      <Link to="/" className="back">
        <span aria-hidden="true">←</span>
        <span lang="ta" className="ta">
          நிறுத்து
        </span>
        <span className="en">Stop</span>
      </Link>
      {position && (
        <span className="play-count">
          {position}
          {remaining != null && <span className="play-remaining">{minutesLeft(remaining)}m</span>}
          {loop && (
            <span className="loop-badge" aria-label="Looping">
              🔁
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/** Whole minutes left, rounded up, so "1m" never lingers at zero. */
function minutesLeft(ms) {
  return Math.max(0, Math.ceil(ms / 60000))
}
