// App.jsx
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

// ✨ Coming Soon Home Page
function Home() {
  return (
    <div className="min-h-screen bg-black text-[#eed50a] flex items-center justify-center flex-col">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-center">
        WKND Events Coming Soon<span className="animate-dots" />
      </h1>
    </div>
  )
}
