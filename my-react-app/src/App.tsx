import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Landing } from './Landing' 

export function App() {
  const [isLogin, setIsLogin] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
    if (message) setMessage(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)
    console.log("Form submission started...");

    try {
      const endpoint = isLogin ? '/api/login' : '/api/signup'
      // MAKE SURE THIS URL MATCHES YOUR BACKEND PORT
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      console.log("Backend Response:", data);

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed')
      }

      setMessage({ type: 'success', text: isLogin ? 'Welcome back!' : 'Account created!' })
      
      if (data.token) {
        localStorage.setItem('token', data.token)
        console.log("Token saved to localStorage");
      }

      // REDIRECT LOGIC
      console.log("Attempting redirect to /landing in 1.5s...");
      setTimeout(() => {
        console.log("Executing navigate('/landing') now!");
        navigate('/landing')
      }, 1500)

    } catch (err: any) {
      console.error("Submit Error:", err.message);
      setMessage({ type: 'error', text: err.message })
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
                {isLogin ? 'Sign In' : 'Sign Up'}
              </h1>
            </header>

            {message && (
              <div className={`mb-6 p-3 rounded-lg text-xs text-center border ${
                message.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
              }`}>
                {message.text}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {!isLogin && (
                <input id="name" type="text" placeholder="Name" value={formData.name} onChange={handleChange}
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

            <button onClick={() => setIsLogin(!isLogin)} className="w-full mt-6 text-sm text-slate-400 hover:text-sky-400">
              {isLogin ? "Need an account? Sign up" : "Have an account? Login"}
            </button>
          </main>
        </div>
      } />

      <Route path="/landing" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}