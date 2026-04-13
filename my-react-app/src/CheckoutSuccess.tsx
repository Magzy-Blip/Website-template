/**
 * Post-purchase thank-you page at /checkout/success.
 * Two entry paths:
 * 1) Real Stripe: ?session_id=... — we verify payment with GET /api/checkout-session-summary.
 * 2) Local demo: ?demo=1 — reads total from sessionStorage (no Stripe call).
 *
 * After payment is confirmed (either path), reads **pending checkout** from sessionStorage and:
 * - Appends an **OrderRecord** to local order history (with fulfillment + trace lines).
 * - **Decrements stock** on each listing referenced by listingId (transparent inventory).
 * In both cases we set flags so Landing clears the cart when the user returns.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CHECKOUT_RECORDED_KEY,
  readPendingCheckout,
  recordCompletedOrder,
  type PendingCheckout,
} from './orderStorage';
import { adjustListingStockOnServer } from './api';

const API_BASE = 'http://localhost:5000';

async function syncServerStockFromPending(pending: PendingCheckout | null) {
  if (!pending) return;
  for (const line of pending.lines) {
    const lid = line.listingId;
    if (lid === undefined || !Number.isFinite(lid)) continue;
    try {
      await adjustListingStockOnServer(lid, -line.quantity);
    } catch {
      /* local catalog already adjusted in recordCompletedOrder */
    }
  }
}

export function CheckoutSuccess() {
  const [params] = useSearchParams();
  /** Stripe appends this query param on success_url after payment completes. */
  const sessionId = params.get('session_id');
  /** Local demo flow sets this; skips Stripe verification. */
  const demo = params.get('demo') === '1';

  /** Formatted order total for display (e.g. "£12.34") once known. */
  const [totalDisplay, setTotalDisplay] = useState<string | null>(null);
  /** Non-fatal error if session verification fails (network, etc.). */
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True when user arrived via ?demo=1 — copy explains no charge occurred. */
  const [isDemo, setIsDemo] = useState(false);
  /**
   * True while we are calling the backend to confirm a real Stripe session.
   * Initial value: we need confirmation only when sessionId exists and it is not demo.
   */
  const [confirming, setConfirming] = useState(() => Boolean(!demo && sessionId));
  /** Fulfillment method from the completed order (shown on thank-you for clarity). */
  const [fulfillmentLabel, setFulfillmentLabel] = useState<string | null>(null);

  useEffect(() => {
    /* Invalid URL: no session and not demo — do not touch sessionStorage or cart flags. */
    if (!demo && !sessionId) {
      return;
    }

    /* Successful or demo completion: drop persisted checkout draft and tell Landing to empty cart. */
    sessionStorage.removeItem('checkout_cart');
    sessionStorage.setItem('clear_cart_after_checkout', '1');

    if (demo) {
      const t = sessionStorage.getItem('checkout_demo_total');
      setTotalDisplay(t ? `£${t}` : null);
      sessionStorage.removeItem('checkout_demo_total');
      setIsDemo(true);
      setConfirming(false);
      /**
       * Record demo order + update inventory from pending snapshot (written on Checkout page).
       * Idempotent: refreshing the thank-you page must not create duplicate orders.
       */
      const recordKey = 'demo';
      if (sessionStorage.getItem(CHECKOUT_RECORDED_KEY) !== recordKey) {
        const pending = readPendingCheckout();
        if (pending) {
          sessionStorage.setItem('last_order_fulfillment', pending.fulfillment);
          recordCompletedOrder(pending, 'demo');
          sessionStorage.setItem(CHECKOUT_RECORDED_KEY, recordKey);
          void syncServerStockFromPending(pending);
        }
      }
      const f = sessionStorage.getItem('last_order_fulfillment');
      setFulfillmentLabel(f === 'delivery' ? 'Delivery' : f === 'collection' ? 'Collection' : null);
      return;
    }

    /* Real payment: retrieve session from Stripe via our backend (secret key stays server-side). */
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/checkout-session-summary?session_id=${encodeURIComponent(sessionId!)}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || 'Could not confirm payment.');
        }
        const gbp = (Number(data.amount_total) / 100).toFixed(2);
        if (!cancelled) setTotalDisplay(`£${gbp}`);
        /** Paid: finalize local order history + stock using the pending checkout saved before redirect. */
        if (!cancelled && sessionId) {
          const recordKey = sessionId;
          if (sessionStorage.getItem(CHECKOUT_RECORDED_KEY) !== recordKey) {
            const pending = readPendingCheckout();
            if (pending) {
              sessionStorage.setItem('last_order_fulfillment', pending.fulfillment);
              recordCompletedOrder(pending, 'stripe');
              sessionStorage.setItem(CHECKOUT_RECORDED_KEY, recordKey);
              void syncServerStockFromPending(pending);
            }
          }
          const f = sessionStorage.getItem('last_order_fulfillment');
          setFulfillmentLabel(f === 'delivery' ? 'Delivery' : f === 'collection' ? 'Collection' : null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setConfirming(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, demo]);

  if (!demo && !sessionId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 mb-6 text-center max-w-sm">No purchase information was found.</p>
        <Link
          to="/landing"
          className="px-6 py-3 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 animate-pulse">Confirming your payment…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">
          ✓
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Thank you for your purchase!</h1>
        <p className="mt-4 text-slate-400 leading-relaxed">
          {isDemo
            ? 'This was a local demo (no payment was processed).'
            : 'Your payment was received. We appreciate your order.'}
        </p>
        {fulfillmentLabel && (
          <p className="mt-3 text-sm font-semibold text-sky-300/90">
            Fulfillment: <span className="text-white">{fulfillmentLabel}</span>
          </p>
        )}
        {totalDisplay && (
          <p className="mt-6 text-lg font-semibold text-sky-400 tabular-nums">Order total: {totalDisplay}</p>
        )}
        {loadError && !isDemo && (
          <p className="mt-4 text-sm text-amber-300/90">
            {loadError} If you completed payment, your bank statement will show the charge. You can still return to
            the shop.
          </p>
        )}
        <Link
          to="/landing"
          className="mt-10 inline-flex px-8 py-3 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors"
        >
          Back to shop
        </Link>
      </div>
    </div>
  );
}
