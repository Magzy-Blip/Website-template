import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { Landing } from './landing.tsx'
import { Checkout } from './checkout.tsx'
import { CheckoutSuccess } from './checkout_success.tsx'
import { ResetPassword } from './reset_password.tsx'
import { is_valid_email_format, validate_password_strength } from './password_rules.ts'
import { login_user, register_user } from './auth_storage.ts'
import { save_account_profile } from './order_storage.ts'

type auth_form_mode = 'login' | 'signup'

export function App() {
  const [form_mode, set_form_mode] = useState<auth_form_mode>('login')
  const [is_loading, set_is_loading] = useState(false)
  const [message, set_message] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const navigate = useNavigate()

  const [form_data, set_form_data] = useState({
    name: '',
    email: '',
    password: '',
  })

  const handle_change = (e: ChangeEvent<HTMLInputElement>) => {
    set_form_data({ ...form_data, [e.target.id]: e.target.value })
    if (message) set_message(null)
  }

  const handle_submit = async (e: FormEvent) => {
    e.preventDefault()
    set_is_loading(true)
    set_message(null)

    try {
      if (!is_valid_email_format(form_data.email)) {
        set_message({ type: 'error', text: 'Enter a valid email address.' })
        return
      }
      if (form_mode === 'signup') {
        const pw_err = validate_password_strength(form_data.password)
        if (pw_err) {
          set_message({ type: 'error', text: pw_err })
          return
        }
        const reg = register_user(form_data.name, form_data.email, form_data.password)
        if (!reg.ok) {
          set_message({ type: 'error', text: reg.message })
          return
        }
        const email = form_data.email.trim().toLowerCase()
        localStorage.setItem('accountEmail', email)
        localStorage.setItem('accountDisplayName', form_data.name.trim())
        save_account_profile(email, { displayName: form_data.name.trim() })
        set_message({ type: 'success', text: 'Account created. Redirecting.' })
        setTimeout(() => navigate('/landing'), 800)
        return
      }

      const result = login_user(form_data.email, form_data.password)
      if (!result.ok) {
        set_message({ type: 'error', text: result.message })
        return
      }

      const email = form_data.email.trim().toLowerCase()
      localStorage.setItem('accountEmail', email)
      localStorage.setItem('accountDisplayName', result.name)
      save_account_profile(email, { displayName: result.name })

      set_message({ type: 'success', text: 'Welcome back!' })
      setTimeout(() => navigate('/landing'), 800)
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err)
      set_message({ type: 'error', text })
    } finally {
      set_is_loading(false)
    }
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
            <main className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
              <header className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white uppercase tracking-widest">
                  {form_mode === 'login' ? 'Sign In' : 'Sign Up'}
                </h1>
                {form_mode === 'signup' && (
                  <p className="mt-2 text-[10px] text-slate-500 leading-relaxed px-1">
                    Password: 8+ chars, upper and lower case, a digit, and a symbol.
                  </p>
                )}
              </header>

              {message && (
                <div
                  className={`mb-6 p-3 rounded-lg text-xs text-center border ${
                    message.type === 'error'
                      ? 'bg-red-500/10 border-red-500/50 text-red-400'
                      : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
                  }`}
                >
                  {message.text}
                </div>
              )}

              <form className="space-y-5" onSubmit={handle_submit}>
                {form_mode === 'signup' && (
                  <input
                    id="name"
                    type="text"
                    placeholder="Name"
                    required
                    value={form_data.name}
                    onChange={handle_change}
                    className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                  />
                )}
                <input
                  id="email"
                  type="email"
                  placeholder="Email"
                  required
                  value={form_data.email}
                  onChange={handle_change}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  id="password"
                  type="password"
                  placeholder="Password"
                  required
                  value={form_data.password}
                  onChange={handle_change}
                  className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={is_loading}
                  className="w-full py-3 bg-sky-500 text-slate-900 font-bold rounded-lg hover:bg-sky-400 disabled:opacity-50"
                >
                  {is_loading ? 'Wait.' : 'Continue'}
                </button>
              </form>

              <Link
                to="/reset-password"
                className="w-full mt-4 block text-center text-sm text-slate-500 hover:text-sky-400"
              >
                Forgot password?
              </Link>

              <button
                type="button"
                onClick={() => {
                  set_form_mode((m) => (m === 'login' ? 'signup' : 'login'))
                  set_message(null)
                }}
                className="w-full mt-6 text-sm text-slate-400 hover:text-sky-400"
              >
                {form_mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Login'}
              </button>
            </main>
          </div>
        }
      />

      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/landing" element={<Landing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/checkout/success" element={<CheckoutSuccess />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
