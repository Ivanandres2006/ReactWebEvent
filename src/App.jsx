import { Routes, Route } from 'react-router-dom'
import EventDetailPage from './pages/EventDetailPage.jsx'
import SuccessPage from './pages/SuccessPage.jsx'
import './index.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/events/:id" element={<EventDetailPage />} />
      <Route path="/success" element={<SuccessPage />} />
    </Routes>
  )
}

// Temporary home page
function Home() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Welcome to WkND Web 🎉</h1>
    </div>
  )
}
