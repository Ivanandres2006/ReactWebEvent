import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const eventId = params.get('eventId')
  const navigate = useNavigate()

  useEffect(() => {
    const timeout = setTimeout(() => {
      navigate(`/event/${eventId}`)
    }, 5000)
    return () => clearTimeout(timeout)
  }, [eventId])

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#0A0F2C] flex flex-col items-center justify-center text-white text-center px-6">
      {/* Glowing Check */}
      <div className="mb-6">
        <div className="w-20 h-20 flex items-center justify-center rounded-full border-4 border-neonGreen shadow-lg shadow-neonGreen/30 animate-pulse">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-10 h-10 text-neonGreen"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Message */}
      <h1 className="text-3xl font-extrabold mb-2">Payment Successful</h1>
      <p className="text-white/80 mb-6">Your ticket is confirmed and ready. We’ve emailed your confirmation.</p>
      <p className="text-white/60 text-sm">Redirecting to the event in a moment...</p>
    </div>
  )
}
