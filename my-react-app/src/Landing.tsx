import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface Item {
  id: number;
  name: string;
  price: string;
}

export function Landing() {
  const navigate = useNavigate();
  
  // --- THEME & UI STATES ---
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [isDashOpen, setIsDashOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // --- DATA STATES ---
  const [items, setItems] = useState<Item[]>([]);
  const [newItem, setNewItem] = useState({ name: '', price: '' });

  const dashRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  // --- LOGIC: ADD ITEM ---
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) return;
    const itemToAdd: Item = { id: Date.now(), name: newItem.name, price: newItem.price };
    setItems([itemToAdd, ...items]);
    setNewItem({ name: '', price: '' });
    setIsDashOpen(false);
  };

  // --- EFFECTS ---
  useEffect(() => {
    const root = window.document.documentElement;
    isDark ? root.classList.add('dark') : root.classList.remove('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dashRef.current && !dashRef.current.contains(target)) setIsDashOpen(false);
      if (cartRef.current && !cartRef.current.contains(target)) setIsCartOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setIsAccountOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen transition-colors duration-500 bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white p-6 font-sans">
      
      {/* --- CENTERED NAVIGATION UNIT --- */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 w-full max-w-2xl px-4">
        
        {/* DASHBOARD (LEFT) */}
        <div className="relative" ref={dashRef}>
          <button onClick={() => setIsDashOpen(!isDashOpen)} className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full shadow-md transition-all active:scale-90 border ${isDashOpen ? 'bg-sky-500 border-sky-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </button>
          {isDashOpen && (
            <form onSubmit={handleAddItem} className="absolute left-0 mt-3 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in duration-200">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Create Item</p>
              <div className="space-y-3">
                <input required type="text" placeholder="Item Name" value={newItem.name} onChange={(e) => setNewItem({...newItem, name: e.target.value})} className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none border border-transparent focus:border-sky-500" />
                <input required type="number" placeholder="Price" value={newItem.price} onChange={(e) => setNewItem({...newItem, price: e.target.value})} className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg outline-none" />
                <button type="submit" className="w-full py-2 bg-sky-500 text-white text-sm font-bold rounded-lg hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20">Add to Gallery</button>
              </div>
            </form>
          )}
        </div>

        {/* SEARCH (CENTER) */}
        <div className="relative group flex-grow">
          <input type="text" placeholder="Search items..." className="w-full py-2.5 pl-11 pr-4 rounded-full outline-none transition-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md focus:ring-2 focus:ring-sky-500/50" />
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center"><svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
        </div>

        {/* CART (RIGHT) */}
        <div className="relative" ref={cartRef}>
          <button onClick={() => setIsCartOpen(!isCartOpen)} className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-full shadow-md transition-all active:scale-90 border ${isCartOpen ? 'bg-sky-500 border-sky-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
          </button>
          {isCartOpen && (
            <div className="absolute right-0 mt-3 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 animate-in fade-in zoom-in duration-200">
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Your Cart</p>
              <p className="text-center py-4 text-sm text-slate-500 italic">Cart is empty</p>
            </div>
          )}
        </div>
      </div>

      {/* --- SETTINGS/ACCOUNT (FAR RIGHT) --- */}
      <div className="fixed top-6 right-6 z-50" ref={accountRef}>
        <button onClick={() => setIsAccountOpen(!isAccountOpen)} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 pr-4 rounded-full shadow-md hover:shadow-lg transition-all active:scale-95">
          <div className="w-8 h-8 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] tracking-tighter">GLH</div>
          <span className="text-sm font-semibold hidden lg:inline">Account</span>
        </button>

        {isAccountOpen && (
          <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 animate-in fade-in zoom-in duration-200">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-2 mb-3">Appearance</p>
            <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-2">
               <div className={`absolute h-[calc(100%-8px)] w-[calc(50%-4px)] bg-white dark:bg-slate-600 rounded-lg shadow-sm transition-transform duration-300 ease-out ${isDark ? 'translate-x-full' : 'translate-x-0'}`} />
              <button onClick={() => setIsDark(false)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors ${!isDark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Light</button>
              <button onClick={() => setIsDark(true)} className={`relative z-10 flex-1 py-1.5 text-xs font-bold transition-colors ${isDark ? 'text-sky-600 dark:text-white' : 'text-slate-500'}`}>Dark</button>
            </div>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2 mx-1" />
            <button onClick={() => { localStorage.removeItem('token'); navigate('/'); }} className="w-full text-left px-3 py-2 text-sm text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">Sign Out</button>
          </div>
        )}
      </div>

      {/* --- ITEM GALLERY --- */}
      <div className="mt-32 max-w-6xl mx-auto px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div className="w-20 h-20 border-2 border-dashed border-slate-400 rounded-full mb-4 flex items-center justify-center text-3xl font-light text-slate-400">+</div>
            <p className="font-medium text-slate-500 italic">Dashboard is empty. Click the plus to begin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {items.map((item) => (
              <div key={item.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="aspect-square w-full bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 flex items-center justify-center text-4xl">📦</div>
                <h3 className="font-bold text-lg">{item.name}</h3>
                <p className="text-sky-500 font-black text-xl">${item.price}</p>
                <button className="mt-4 w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-xs opacity-0 group-hover:opacity-100 transition-all active:scale-95">Add to Cart</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}