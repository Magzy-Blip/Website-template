import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { Landing } from './Landing'
/* Stripe checkout review + post-payment thank-you (see Checkout.tsx / CheckoutSuccess.tsx). */
import { Checkout } from './Checkout'
import { CheckoutSuccess } from './CheckoutSuccess'
import { ResetPassword } from './ResetPassword'
import { isValidEmailFormat, validatePasswordStrength } from './passwordRules'

const API_BASE = 'http://localhost:5000'

type AuthFormMode = 'login' | 'signup' | 'forgot'

export function App() {
  const [formMode, setFormMode] = useState<AuthFormMode>('login')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [devReset, setDevReset] = useState<{ token: string; email: string } | null>(null)

  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
    if (message) setMessage(null)
    if (devReset) setDevReset(null)
  }

  const handleForgotSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)
    setDevReset(null)
    try {
      if (!isValidEmailFormat(formData.email)) {
        setMessage({ type: 'error', text: 'Enter a valid email address.' })
        return
      }
      const response = await fetch(`${API_BASE}/api/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email.trim().toLowerCase() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error((data as { message?: string }).message || 'Request failed')
      }
      setMessage({
        type: 'success',
        text: (data as { message?: string }).message || 'Check your instructions.',
      })
      const d = data as { devResetToken?: string; devResetEmail?: string }
      if (d.devResetToken && d.devResetEmail) {
        setDevReset({ token: d.devResetToken, email: d.devResetEmail })
      }
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)
    console.log('Form submission started...')

    try {
      if (!isValidEmailFormat(formData.email)) {
        setMessage({ type: 'error', text: 'Enter a valid email address.' })
        return
      }
      if (formMode === 'signup') {
        const pwErr = validatePasswordStrength(formData.password)
        if (pwErr) {
          setMessage({ type: 'error', text: pwErr })
          return
        }
      }

      const endpoint = formMode === 'login' ? '/api/login' : '/api/signup'
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      console.log('Backend Response:', data)

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed')
      }

      setMessage({
        type: 'success',
        text: formMode === 'login' ? 'Welcome back!' : 'Account created!',
      })

      if (data.token) {
        localStorage.setItem('token', data.token)
        console.log('Token saved to localStorage')
      }

      localStorage.setItem('accountEmail', formData.email.trim().toLowerCase())

      console.log("Attempting redirect to /landing in 1.5s...")
      setTimeout(() => {
        console.log("Executing navigate('/landing') now!")
        navigate('/landing')
      }, 1500)
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err)
      console.error('Submit Error:', text)
      setMessage({ type: 'error', text })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Routes>
      <Route path="/" element={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
          <main className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
            <header className="text-center mb-8">
              <h1 className="text-2xl font-bold text-white uppercase tracking-widest">
                {formMode === 'login' ? 'Sign In' : formMode === 'signup' ? 'Sign Up' : 'Forgot password'}
              </h1>
              {formMode === 'signup' && (
                <p className="mt-2 text-[10px] text-slate-500 leading-relaxed px-1">
                  Password: 8+ chars, upper and lower case, a digit, and a symbol.
                </p>
              )}
            </header>

            {message && (
              <div className={`mb-6 p-3 rounded-lg text-xs text-center border ${
                message.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
              }`}>
                {message.text}
              </div>
            )}

            {formMode === 'forgot' ? (
              <>
                <form className="space-y-5" onSubmit={handleForgotSubmit}>
                  <input id="email" type="email" placeholder="Email" required value={formData.email} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button type="submit" disabled={isLoading}
                    className="w-full py-3 bg-sky-500 text-slate-900 font-bold rounded-lg hover:bg-sky-400 disabled:opacity-50"
                  >
                    {isLoading ? 'Wait...' : 'Send reset link (local token)'}
                  </button>
                </form>
                {devReset && (
                  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[10px] text-amber-200/90 space-y-2">
                    <p className="font-bold uppercase tracking-wider text-amber-300">Development only</p>
                    <p>Copy this token into the reset page (non-production API exposes it instead of email).</p>
                    <p className="font-mono break-all text-slate-200">{devReset.token}</p>
                    <Link
                      to={`/reset-password?email=${encodeURIComponent(devReset.email)}&token=${encodeURIComponent(devReset.token)}`}
                      className="inline-block mt-1 text-sky-400 font-semibold hover:underline"
                    >
                      Open reset page
                    </Link>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setFormMode('login'); setMessage(null); setDevReset(null) }}
                  className="w-full mt-6 text-sm text-slate-400 hover:text-sky-400"
                >
                  Back to sign in
                </button>
                <Link to="/reset-password" className="w-full mt-3 block text-center text-sm text-slate-500 hover:text-sky-400">
                  Already have a token?
                </Link>
              </>
            ) : (
              <>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  {formMode === 'signup' && (
                    <input id="name" type="text" placeholder="Name" required value={formData.name} onChange={handleChange}
                      className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  )}
                  <input id="email" type="email" placeholder="Email" required value={formData.email} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <input id="password" type="password" placeholder="Password" required value={formData.password} onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button type="submit" disabled={isLoading}
                    className="w-full py-3 bg-sky-500 text-slate-900 font-bold rounded-lg hover:bg-sky-400 disabled:opacity-50"
                  >
                    {isLoading ? 'Wait...' : 'Continue'}
                  </button>
                </form>

                {formMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setFormMode('forgot'); setMessage(null); setDevReset(null) }}
                    className="w-full mt-4 text-sm text-slate-500 hover:text-sky-400"
                  >
                    Forgot password?
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setFormMode((m) => (m === 'login' ? 'signup' : 'login'))
                    setMessage(null)
                    setDevReset(null)
                  }}
                  className="w-full mt-6 text-sm text-slate-400 hover:text-sky-400"
                >
                  {formMode === 'login' ? 'Need an account? Sign up' : 'Have an account? Login'}
                </button>
              </>
            )}
          </main>
        </div>
      } />

      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/landing" element={<Landing />} />
      {/* Order review; redirects browser to Stripe-hosted payment. */}
      <Route path="/checkout" element={<Checkout />} />
      {/* Returned after Stripe payment or local demo; verifies session_id when applicable. */}
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}