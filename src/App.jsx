import { Routes, Route } from 'react-router-dom'
import EventDetailPage from './pages/EventDetailPage.jsx'
import SuccessPage from './pages/SuccessPage.jsx'
import Home from './pages/Home.jsx' // ✅ import the full home

import './index.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />  {/* ✅ root is Home */}
      <Route path="/events/:id" element={<EventDetailPage />} />
      <Route path="/success" element={<SuccessPage />} />
    </Routes>
  )
}
