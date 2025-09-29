import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import App from './App.jsx'
import './index.css'

const stripePromise = loadStripe('pk_test_51RcVeBBU1Fa59mBKHvngFVDwq8gBiZ863TKO6okEHBj28VjLiYAUQ5OhDs0k1WEyfqXRmtziurmLYBqlQfyOOl6C007EKiWppc')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
    <Elements stripe={stripePromise}>
      <App />
    </Elements>
  </HashRouter>
  </StrictMode>,
)
