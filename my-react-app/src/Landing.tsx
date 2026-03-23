import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function Landing() {
  const navigate = useNavigate();
  
  // States for Theme and Dropdown
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle Theme switching
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <div className="min-h-screen transition-colors duration-500 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white p-6">
      
      {/* --- TOP RIGHT DROPDOWN SECTION --- */}
      <div className="fixed top-6 right-6 z-50" ref={dropdownRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 pr-4 rounded-full shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          {/* User Avatar Icon */}
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
            JD
          </div>
          <span className="text-sm font-semibold">Account</span>
          <svg className={`w-4 h-4 opacity-50 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown Menu Content */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-2 animate-in fade-in zoom-in duration-200">
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Settings</p>
            </div>

            <button
              onClick={() => { setIsDark(!isDark); setIsOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
            >
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold mt-1"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/*PAGE ASSETS*/}
      <div className="flex flex-col items-center justify-center mt-32">
        <h1 className="text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-md text-center">
          You are currently logged in. Your session is protected by SQL-encrypted protocols.
        </p>
      </div>
    </div>
  );
}