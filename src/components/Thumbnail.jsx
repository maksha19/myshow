import { useState } from 'react'

/**
 * Bunny thumbnails live on a referer-locked pull zone and return 403 to any
 * origin but the wrapper site's, so requesting them only ever produces a
 * broken image. Those shows get a generated tile instead. Dailymotion
 * thumbnails load normally, with the same tile as an onError fallback.
 */
export default function Thumbnail({ show }) {
  const [failed, setFailed] = useState(false)
  const usePlaceholder = show.source === 'bunny' || failed || !show.thumbnail

  if (usePlaceholder) {
    return (
      <div className="thumb thumb-placeholder" style={tileStyle(show.slug)} aria-hidden="true">
        <span lang="ta" className="ta">
          {initial(show)}
        </span>
      </div>
    )
  }

  return (
    <img
      className="thumb"
      src={show.thumbnail}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function initial(show) {
  // A Tamil grapheme can span several code units; Intl.Segmenter keeps it whole.
  const source = show.titleTamil || show.title || '?'
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const [first] = new Intl.Segmenter('ta', { granularity: 'grapheme' }).segment(source)
    return first?.segment ?? source[0]
  }
  return [...source][0]
}

/** Stable per-show colour so a given card always looks the same. */
function tileStyle(slug) {
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) % 360
  return {
    background: `linear-gradient(140deg, hsl(${hash} 52% 32%), hsl(${(hash + 40) % 360} 48% 20%))`,
  }
}
