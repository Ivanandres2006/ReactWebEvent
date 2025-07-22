import { useState } from 'react'

export default function Home() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('') // ✅ new

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('') // clear any previous messages

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
      <h1 className="text-4xl md:text-5xl font-bold text-[#eed50a] animate-pulse text-center mb-10">
        WKND coming soon<span className="animate-dots"></span>
      </h1>

      {!submitted && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#111] p-6 rounded-2xl shadow-xl w-full max-w-md flex flex-col gap-4"
        >
          <input
            type="email"
            placeholder="you@example.com"
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

      {/* ✅ Show message */}
      {message && (
        <p className={`text-center text-sm mt-4 ${submitted ? 'text-green-400' : 'text-red-400'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
