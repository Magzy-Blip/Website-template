/**
 * Checkout review page shown at /checkout.
 * - Loads the cart from React Router location.state or sessionStorage (Stripe cancel recovery).
 * - Lets the shopper choose **collection vs delivery** (stored with the order and on Stripe metadata).
 * - Persists a **pending checkout** snapshot before leaving for Stripe so success page can finalize inventory + order history.
 * - Calls POST /api/create-checkout-session to get a Stripe-hosted payment URL.
 * - Never collects card numbers; the user completes payment on Stripe’s site.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { CheckoutCartSnapshot } from './checkoutTypes';
import type { FulfillmentMethod } from './shopTypes';
import { clearPendingCheckout, savePendingCheckout } from './orderStorage';

/** Express API origin (must match backend CORS and Vite dev server). */
const API_BASE = 'http://localhost:5000';

/**
 * Restores the cart snapshot from navigation state (preferred) or sessionStorage fallback.
 * Used when the user returns from Stripe with ?canceled=1 so React state may be empty.
 */
function loadSnapshot(state: unknown): CheckoutCartSnapshot | null {
  if (state && typeof state === 'object' && 'lines' in state) {
    const s = state as CheckoutCartSnapshot;
    if (Array.isArray(s.lines) && s.lines.length > 0) return s;
  }
  try {
    const raw = sessionStorage.getItem('checkout_cart');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutCartSnapshot;
    if (Array.isArray(parsed.lines) && parsed.lines.length > 0) return parsed;
  } catch {
    /* Invalid JSON or missing key — treat as no snapshot. */
  }
  return null;
}

/** Computes subtotal for one line (quantity × unit price) for the order summary UI. */
function lineTotal(line: { quantity: number; unitPrice: string }): number {
  const u = Number.parseFloat(line.unitPrice);
  if (!Number.isFinite(u)) return 0;
  return u * line.quantity;
}

export function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  /** Set by Stripe cancel_url (?canceled=1) so we can show a friendly message. */
  const canceled = params.get('canceled') === '1';

  /** Memoized cart payload so we do not re-parse sessionStorage on every render. */
  const snapshot = useMemo(() => loadSnapshot(location.state), [location.state]);
  const [error, setError] = useState<string | null>(null);
  /** When the API returns STRIPE_NOT_CONFIGURED we show setup hints + optional dev demo. */
  const [stripeCode, setStripeCode] = useState<string | null>(null);
  /** True while waiting for create-checkout-session before full-page redirect. */
  const [loading, setLoading] = useState(false);
  /**
   * Whether the customer will pick up in-store or receive delivery — passed to the backend
   * (Stripe metadata) and stored in local order history after payment.
   */
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>('collection');

  /** Sum of all line totals for display and for the Stripe minimum check. */
  const orderTotal = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.lines.reduce((s, l) => s + lineTotal(l), 0);
  }, [snapshot]);

  /** Stripe card payments in GBP require at least £0.30 — block pay until cart meets this. */
  const belowStripeMinimum = orderTotal > 0 && orderTotal < 0.3;

  useEffect(() => {
    if (canceled) setError('You left the payment page. Your cart is unchanged. Try again when you are ready.');
  }, [canceled]);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 mb-6">Nothing to check out.</p>
        <Link
          to="/landing"
          className="px-6 py-3 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  /**
   * Writes pending checkout to sessionStorage so /checkout/success can record order + inventory
   * after Stripe redirects back (SPA state would otherwise be lost).
   */
  function persistPendingForAfterPayment() {
    const snap = snapshot;
    if (!snap) return;
    const customerEmail = localStorage.getItem('accountEmail');
    savePendingCheckout({
      lines: snap.lines,
      total: orderTotal.toFixed(2),
      fulfillment,
      customerEmail,
    });
  }

  /**
   * Asks the backend to create a Stripe Checkout Session and redirects the browser
   * to session.url (full navigation so we leave the SPA until Stripe sends the user back).
   */
  async function startStripeCheckout() {
    if (!snapshot) return;
    setLoading(true);
    setError(null);
    setStripeCode(null);
    try {
      persistPendingForAfterPayment();
      const res = await fetch(`${API_BASE}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: snapshot.lines, fulfillment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'STRIPE_NOT_CONFIGURED') {
          clearPendingCheckout();
          setStripeCode('STRIPE_NOT_CONFIGURED');
          setError(data.message || 'Stripe is not configured on the server.');
          return;
        }
        throw new Error(data.message || 'Could not start checkout.');
      }
      if (typeof data.url === 'string' && data.url.startsWith('http')) {
        window.location.assign(data.url);
        return;
      }
      throw new Error('Invalid checkout response.');
    } catch (e) {
      clearPendingCheckout();
      setError(e instanceof Error ? e.message : 'Checkout failed.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Dev-only path: skips Stripe and goes to the thank-you screen with a demo flag.
   * Stores order total for display and flags Landing to clear the cart on next visit.
   */
  function completeDemoThankYou() {
    persistPendingForAfterPayment();
    sessionStorage.setItem('checkout_demo_total', orderTotal.toFixed(2));
    sessionStorage.setItem('clear_cart_after_checkout', '1');
    sessionStorage.removeItem('checkout_cart');
    navigate('/checkout/success?demo=1');
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 flex flex-col items-center">
      <div className="w-full max-w-md mt-8">
        <Link to="/landing" className="text-sm text-sky-400 hover:text-sky-300 font-semibold">
          ← Continue shopping
        </Link>

        <header className="mt-8 mb-6">
          <h1 className="text-2xl font-bold text-white tracking-tight">Checkout</h1>
          <p className="text-sm text-slate-400 mt-2">
            Pay on Stripe&apos;s secure page. This app never collects or stores your card number.
          </p>
        </header>

        {/* Read-only summary of what will be sent to Stripe (prices recomputed server-side). */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">Order summary</p>
          <ul className="space-y-3 text-sm border-b border-slate-800 pb-4 mb-4">
            {snapshot.lines.map((line, i) => (
              <li key={`${line.name}-${i}`} className="flex justify-between gap-3">
                <span className="text-slate-300">
                  <span className="font-semibold text-white">{line.name}</span>
                  <span className="text-slate-500"> × {line.quantity}</span>
                </span>
                <span className="tabular-nums text-slate-300">£{lineTotal(line).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between items-baseline">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total</span>
            <span className="text-xl font-black text-sky-400 tabular-nums">£{orderTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Fulfillment choice: stored with the order and sent to Stripe session metadata. */}
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-3">How do you want your order?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFulfillment('collection')}
              className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ${
                fulfillment === 'collection'
                  ? 'border-sky-500 bg-sky-500/15 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Collection</span>
              Pick up in store
            </button>
            <button
              type="button"
              onClick={() => setFulfillment('delivery')}
              className={`rounded-xl border px-3 py-3 text-left text-xs font-semibold transition-colors ${
                fulfillment === 'delivery'
                  ? 'border-sky-500 bg-sky-500/15 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Delivery</span>
              Ship to your address
            </button>
          </div>
        </div>

        {error && (
          <div
            className={`mt-4 p-4 rounded-xl text-sm border ${
              stripeCode === 'STRIPE_NOT_CONFIGURED'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}
          >
            {error}
          </div>
        )}

        {stripeCode === 'STRIPE_NOT_CONFIGURED' && (
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">
            Copy <code className="text-slate-400">backend/.env.example</code> to{' '}
            <code className="text-slate-400">backend/.env</code>, add your Stripe test secret key, then restart the
            server.
          </p>
        )}

        {belowStripeMinimum && (
          <p className="mt-4 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            Card payments require at least <span className="font-semibold">£0.30</span> total (Stripe). Add more items
            to your cart.
          </p>
        )}

        <button
          type="button"
          disabled={loading || belowStripeMinimum}
          onClick={startStripeCheckout}
          className="mt-6 w-full py-3.5 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 disabled:opacity-50 transition-colors shadow-lg shadow-sky-500/20"
        >
          {loading ? 'Redirecting…' : 'Pay securely with Stripe'}
        </button>

        {/* Shown only in Vite dev when Stripe env is missing — no real charge. */}
        {import.meta.env.DEV && stripeCode === 'STRIPE_NOT_CONFIGURED' && (
          <button
            type="button"
            onClick={completeDemoThankYou}
            className="mt-3 w-full py-2.5 rounded-xl border border-slate-700 text-slate-400 text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            Skip to thank-you screen (local demo only — no charge)
          </button>
        )}

        <p className="mt-6 text-center text-[10px] text-slate-600">
          Secured by Stripe · PCI-DSS compliant hosted checkout
        </p>
      </div>
    </div>
  );
}
