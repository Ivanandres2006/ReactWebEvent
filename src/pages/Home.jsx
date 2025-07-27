import { useState, useEffect } from 'react'

export default function Home() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showInstagramPopup, setShowInstagramPopup] = useState(false)

  const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const handleSubmit = async (e) => {
  e.preventDefault()
  setLoading(true)
  setMessage('')

  if (!isValidEmail(email)) {
    setLoading(false)
    setMessage("❌ Please enter a valid email address.")
    return
  }

  try {
    const response = await fetch("https://backendevent-etce.onrender.com/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    const text = await response.text()

    if (response.ok) {
      setSubmitted(true)
      setMessage("🎉 You're on the list! We'll notify you soon.")
    } else if (response.status === 409) {
      setMessage("✅ You're already on the list!")
    } else if (response.status === 400) {
      setMessage("❌ Invalid email format.")
    } else if (response.status === 429) {
      setMessage("⏱️ Please wait a bit before submitting again.")
    } else {
      setMessage(text || "❌ Something went wrong. Please try again.")
    }
  } catch (err) {
    console.error(err)
    setMessage("❌ Network error. Please try again later.")
  } finally {
    setLoading(false)
  }
}

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('')
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes("instagram")) {
      setShowInstagramPopup(true)
    }
  }, [])

  return (
    <div className="home-container px-4">
      {/* Instagram Popup */}
      {showInstagramPopup && (
        <div className="instagram-popup-overlay">
          <div className="instagram-popup">
            <h2>⚠️ Trouble Using the Form?</h2>
            <p>
              Instagram’s in-app browser may block this page. Tap the <strong>••• menu</strong> (top-right) and choose <strong>“Open in Browser”</strong> (Safari or Chrome).
            </p>
            <p style={{ fontStyle: 'italic', marginTop: '1rem' }}>– The WKND Team</p>
            <button onClick={() => setShowInstagramPopup(false)} className="popup-close">
              Got it
            </button>
          </div>
        </div>
      )}

      <h1 className="coming-soon-heading">
        WKND coming soon<span className="animate-dots"></span>
      </h1>

      {!submitted && (
        <p className="waitlist-subtitle">
          Drop your email and be the first to know when WKND launches.
        </p>
      )}

      {!submitted && (
        <form onSubmit={handleSubmit} className="waitlist-form">
          <input
            type="email"
            placeholder="Your email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="waitlist-input"
          />
          <button
            type="submit"
            disabled={loading}
            className="waitlist-button"
          >
            {loading ? "Joining..." : "Notify Me"}
          </button>
        </form>
      )}

      {message && (
        <p className={submitted ? "waitlist-success fade-out" : "waitlist-error fade-out"}>
          {message}
        </p>
      )}
    </div>
  )
}
