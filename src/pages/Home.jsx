import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatEpisode, isStale } from '../shows.js'
import { loadPrefs, buildMyList } from '../mylist.js'
import Thumbnail from '../components/Thumbnail.jsx'

const SEARCH_THRESHOLD = 8

export default function Home() {
  const [query, setQuery] = useState('')
  const [prefs] = useState(loadPrefs)

  const myList = useMemo(() => buildMyList(prefs), [prefs])
  // Channel grouping is the nice default for browsing, but it would fight a
  // hand-picked order — so a custom order switches to one flat list.
  const custom = prefs.order.length > 0
  const playableCount = myList.filter((s) => s.included && s.playable).length

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? myList.filter(
          (show) =>
            show.title.toLowerCase().includes(needle) ||
            (show.titleTamil ?? '').includes(query.trim()),
        )
      : myList

    if (custom || needle) return [[null, matches]]

    const byChannel = new Map()
    for (const show of matches) {
      const channel = show.channel ?? 'Shows'
      if (!byChannel.has(channel)) byChannel.set(channel, [])
      byChannel.get(channel).push(show)
    }
    return [...byChannel.entries()]
  }, [query, myList, custom])

  const total = myList.length
  const nothingMatched = total > 0 && groups.every(([, items]) => items.length === 0)

  return (
    <main className="home">
      <header className="home-header">
        <h1>
          <span lang="ta" className="ta">
            தமிழ் சீரியல்
          </span>
          <span className="en">Tamil Serials</span>
        </h1>
      </header>

      {playableCount > 0 && (
        <div className="actions">
          <Link className="action action-primary" to="/play?mode=once">
            <span aria-hidden="true">▶</span>
            <span lang="ta" className="ta">
              தொடங்கு
            </span>
            <span className="en">Start · {playableCount} in order</span>
          </Link>
          <Link className="action" to="/play?mode=loop">
            <span aria-hidden="true">🔁</span>
            <span lang="ta" className="ta">
              தொடர்ந்து
            </span>
            <span className="en">Loop · never stops</span>
          </Link>
        </div>
      )}

      <Link className="manage-link" to="/manage">
        <span lang="ta" className="ta">
          எனது பட்டியல்
        </span>
        <span className="en">Edit list &amp; order</span>
      </Link>

      {total > SEARCH_THRESHOLD && (
        <div className="search">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search / தேடு"
            aria-label="Search shows"
            autoComplete="off"
            spellCheck="false"
          />
          {query && (
            <button type="button" className="search-clear" onClick={() => setQuery('')}>
              Clear
            </button>
          )}
        </div>
      )}

      {total === 0 && (
        <p className="empty">
          <span lang="ta" className="ta">
            நிகழ்ச்சிகள் எதுவும் இல்லை
          </span>
          <span className="en">No shows yet — the daily update has not run.</span>
        </p>
      )}

      {nothingMatched && (
        <p className="empty">
          <span lang="ta" className="ta">
            கிடைக்கவில்லை
          </span>
          <span className="en">Nothing matches “{query}”.</span>
        </p>
      )}

      {groups.map(([channel, items]) => (
        <section key={channel ?? 'all'} className="channel">
          {channel && <h2>{channel}</h2>}
          <ul className="grid">
            {items.map((show) => (
              <ShowCard key={show.slug} show={show} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

function ShowCard({ show }) {
  const episode = formatEpisode(show.episodeLabel)
  const stale = isStale(show.episodeLabel)

  return (
    <li className="card">
      {/* The whole card is the tap target — no small links to aim at. */}
      <Link to={`/watch/${show.slug}`}>
        <Thumbnail show={show} />
        <div className="card-body">
          {show.titleTamil && (
            <span lang="ta" className="ta card-title">
              {show.titleTamil}
            </span>
          )}
          <span className="en card-subtitle">{show.title}</span>
          <span className={stale ? 'episode stale' : 'episode'}>
            {episode.ta && (
              <span lang="ta" className="ta">
                {episode.ta}
              </span>
            )}
            <span className="en">{stale ? `Last: ${episode.en}` : episode.en}</span>
            {/* Bunny episodes can't play in-app, so flag the hand-off up front. */}
            {show.source === 'bunny' && (
              <span className="external" title="Opens the original site">
                ↗
              </span>
            )}
          </span>
        </div>
      </Link>
    </li>
  )
}
