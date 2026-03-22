import { useState, type ChangeEvent, type FormEvent } from 'react'

export function App() {
  const [isLogin, setIsLogin] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  // 1. State to hold the data for your SQL database
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  })

  // 2. Function to update the state as the user types
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value })
    if (message) setMessage(null) // Clear errors when user types
  }

  // 3. Function to send the data to your Node.js/SQL backend
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    try {
      const endpoint = isLogin ? '/api/login' : '/api/signup'
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.message || 'Authentication failed')

      setMessage({ type: 'success', text: isLogin ? 'Welcome back!' : 'Account created successfully!' })
      
      // If login is successful, store the token
      if (data.token) localStorage.setItem('token', data.token)

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200">
      
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-sky-500 p-2 text-slate-900 rounded-md">
        Skip to content
      </a>

      <main id="main-content" className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8">
        
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {isLogin ? 'Sign In' : 'Create Account'}
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Please enter your credentials to {isLogin ? 'access your account' : 'get started'}.
          </p>
        </header>

        {/* FEEDBACK: Display success or error messages */}
        {message && (
          <div role="alert" className={`mb-6 p-3 rounded-lg text-xs text-center border ${
            message.type === 'error' ? 'bg-red-500/10 border-red-500/50 text-red-400' : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
          }`}>
            {message.text}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="space-y-1">
              <label htmlFor="name" className="sr-only">Full Name</label>
              <input 
                id="name"
                type="text" 
                placeholder="Name" 
                autoComplete="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" 
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="sr-only">Email Address</label>
            <input 
              id="email"
              type="email" 
              placeholder="Email" 
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" 
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="sr-only">Password</label>
            <input 
              id="password"
              type="password" 
              placeholder="Password" 
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 p-3 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all placeholder:text-slate-600" 
            />
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-900 font-bold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-sky-500/10 focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : (isLogin ? 'Continue' : 'Get Started')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => { setIsLogin(!isLogin); setMessage(null); }}
            className="text-sm text-slate-400 hover:text-sky-400 transition-colors focus:underline outline-none"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </main>

      <footer className="mt-12 text-center">
        <p className="opacity-40 text-[10px] uppercase tracking-widest font-mono mb-2">
          Encrypted & SQL Secured
        </p>
        <div className="flex gap-4 opacity-50 text-[10px]">
          <a href="/privacy" className="hover:underline">Privacy Policy</a>
          <a href="/terms" className="hover:underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  )
}