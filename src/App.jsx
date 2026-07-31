import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Watch from './pages/Watch.jsx'
import Play from './pages/Play.jsx'
import Manage from './pages/Manage.jsx'

/**
 * HashRouter, not BrowserRouter: this is a static site with no server, so
 * hash routes work on GitHub Pages (and any other host) with zero rewrite
 * config and survive a direct reload of /watch/<slug>.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/watch/:slug" element={<Watch />} />
        <Route path="/play" element={<Play />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
