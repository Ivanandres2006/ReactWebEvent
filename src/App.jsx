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
    <div className="home-container">
      <h1 className="text-4xl font-bold text-[#eed50a] animate-pulse">
        WKND Event coming soon<span className="animate-dots"></span>
      </h1>
    </div>
  );
}



