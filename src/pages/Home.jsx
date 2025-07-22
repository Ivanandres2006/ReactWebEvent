import { useState } from 'react'

export default function Home() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch("https://backendevent-etce.onrender.com/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (response.ok) {
        setSubmitted(true)
        setMessage("🎉 You're on the list! We'll notify you soon.")
      } else {
        setMessage("🎉 You're on the list! We'll notify you soon.")
      }
    } catch (err) {
      console.error(err)
      setMessage("🎉 You're on the list! We'll notify you soon.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-container px-4">
      <h1 className="coming-soon-heading">
        WKND coming soon<span className="animate-dots"></span>
      </h1>

      {!submitted ? (
        <form onSubmit={handleSubmit} className="waitlist-form">
          <input
            type="email"
            placeholder="Email"
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
      ) : null}

      {message && (
        <p className={submitted ? "waitlist-success" : "waitlist-error"}>
          {message}
        </p>
      )}
    </div>
  )
}
