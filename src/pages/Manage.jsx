import { useState } from 'react'
import { Link } from 'react-router-dom'
import { loadPrefs, savePrefs, clearPrefs, buildMyList } from '../mylist.js'

/**
 * Reordering uses up/down buttons rather than drag-and-drop: dragging is
 * fiddly on a touch screen and impossible with a keyboard, and this list is
 * set up once and rarely touched.
 */
export default function Manage() {
  const [prefs, setPrefs] = useState(loadPrefs)
  const list = buildMyList(prefs)

  function commit(next) {
    setPrefs(next)
    savePrefs(next)
  }

  function move(from, to) {
    if (to < 0 || to >= list.length) return
    const order = list.map((s) => s.slug)
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    commit({ ...prefs, order })
  }

  function toggle(slug) {
    const excluded = new Set(prefs.excluded)
    if (excluded.has(slug)) excluded.delete(slug)
    else excluded.add(slug)
    // Persist the full order too, so today's positions survive the toggle.
    commit({ order: list.map((s) => s.slug), excluded: [...excluded] })
  }

  function reset() {
    clearPrefs()
    setPrefs({ order: [], excluded: [] })
  }

  const playableCount = list.filter((s) => s.included && s.playable).length

  return (
    <main className="home manage">
      <div className="play-top">
        <Link to="/" className="back">
          <span aria-hidden="true">←</span>
          <span lang="ta" className="ta">
            பின்செல்
          </span>
          <span className="en">Back</span>
        </Link>
        <button type="button" className="reset" onClick={reset}>
          Reset
        </button>
      </div>

      <h1 className="manage-title">
        <span lang="ta" className="ta">
          எனது பட்டியல்
        </span>
        <span className="en">
          My list · {playableCount} will play in order
        </span>
      </h1>

      <p className="manage-hint">
        <span lang="ta" className="ta">
          வரிசையை மாற்ற ▲▼ அழுத்தவும். இந்தச் சாதனத்தில் மட்டும் சேமிக்கப்படும்.
        </span>
        <span className="en">
          Use ▲▼ to set the play order. Saved on this device only.
        </span>
      </p>

      <ol className="manage-list">
        {list.map((show, i) => (
          <li key={show.slug} className={show.included ? '' : 'off'}>
            <label className="manage-check">
              <input
                type="checkbox"
                checked={show.included}
                onChange={() => toggle(show.slug)}
                aria-label={`Include ${show.title}`}
              />
              <span className="manage-names">
                {show.titleTamil && (
                  <span lang="ta" className="ta">
                    {show.titleTamil}
                  </span>
                )}
                <span className="en">
                  {show.title}
                  {!show.playable && ' · cannot autoplay'}
                </span>
              </span>
            </label>
            <div className="manage-move">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === list.length - 1}
                aria-label="Move down"
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>

      <p className="manage-hint">
        <span className="en">
          Shows marked “cannot autoplay” use a video host that blocks embedding, so
          the queue skips them. They still open individually from the home page.
        </span>
      </p>
    </main>
  )
}
