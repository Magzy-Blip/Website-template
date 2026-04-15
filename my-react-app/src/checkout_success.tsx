import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { read_pending_checkout, record_completed_order } from './order_storage.ts';

const thank_you_key = 'checkout_thankyou';

type thank_you_payload = {
  total: string;
  fulfillment: string;
  loyalty: boolean;
};

export function CheckoutSuccess() {
  const [payload, set_payload] = useState<thank_you_payload | null | undefined>(undefined);

  useEffect(() => {
    sessionStorage.removeItem('checkout_cart');
    sessionStorage.setItem('clear_cart_after_checkout', '1');

    const pending = read_pending_checkout();
    if (pending) {
      const order = record_completed_order(pending);
      const next: thank_you_payload = {
        total: order.total,
        fulfillment: order.fulfillment,
        loyalty: order.loyaltyDiscountApplied,
      };
      sessionStorage.setItem(thank_you_key, JSON.stringify(next));
      set_payload(next);
      return;
    }

    try {
      const raw = sessionStorage.getItem(thank_you_key);
      if (raw) {
        const p = JSON.parse(raw) as thank_you_payload;
        if (p && typeof p.total === 'string') {
          set_payload(p);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    set_payload(null);
  }, []);

  if (payload === undefined) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 animate-pulse">Loading</p>
      </div>
    );
  }

  if (payload === null) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
        <p className="text-slate-400 mb-6 text-center max-w-sm">Return to the shop and try checkout again.</p>
        <Link
          to="/landing"
          className="px-6 py-3 rounded-xl bg-sky-500 text-slate-900 font-bold hover:bg-sky-400 transition-colors"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  const fulfillment_label = payload.fulfillment === 'delivery' ? 'Delivery' : 'Collection';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-400">
          OK
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Thank you for your purchase!</h1>
        <p className="mt-3 text-sm font-semibold text-sky-300/90">
          Delivery type: <span className="text-white">{fulfillment_label}</span>
        </p>
        {payload.loyalty && (
          <p className="mt-2 text-sm text-emerald-400/90">Loyalty discount applied on this order.</p>
        )}
        <p className="mt-6 text-lg font-semibold text-sky-400 tabular-nums">Order total: £{payload.total}</p>
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
