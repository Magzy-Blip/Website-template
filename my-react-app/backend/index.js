const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
require('dotenv').config();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
    if (typeof raw !== 'string') return null;
    const e = raw.trim().toLowerCase();
    if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null;
    return e;
}

function validatePasswordStrength(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return { ok: false, message: 'Password must be at least 8 characters.' };
    }
    if (password.length > 20) {
        return { ok: false, message: 'Password is too long.' };
    }
    if (!/[a-z]/.test(password)) {
        return { ok: false, message: 'Password must include a lowercase letter.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { ok: false, message: 'Password must include an uppercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { ok: false, message: 'Password must include a digit.' };
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return { ok: false, message: 'Password must include a symbol (e.g. !@#$%).' };
    }
    return { ok: true };
}

async function logLoginAttempt(email, success) {
    try {
        await db.run('INSERT INTO login_events (email, success) VALUES (?, ?)', [
            email || '',
            success ? 1 : 0,
        ]);
    } catch (e) {
        console.error('login_events:', e.message);
    }
}

const app = express();

const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
const corsOrigin =
    process.env.NODE_ENV === 'production'
        ? defaultFrontend
        : (origin, cb) => {
              if (!origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
                  cb(null, true);
              } else {
                  cb(null, false);
              }
          };
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "Backend is running!" });
});

app.post('/api/signup', async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body?.email ?? '');
    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Some fields are empty' });
        }
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Name required' });
        }

        const pw = validatePasswordStrength(password);
        if (!pw.ok) {
            return res.status(400).json({ message: pw.message });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
            name.trim(),
            email,
            hashedPassword,
        ]);
        res.status(201).json({ message: 'Welcome!' });
    } catch (err) { 
        console.error('Signup Error:', err.message);
        const msg = err.message.includes('UNIQUE') ? 'Email already exists' : err.message;
        res.status(500).json({ message: 'Database error: ' + msg });
    }
});

app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    const email = normalizeEmail(req.body?.email ?? '');
    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            await logLoginAttempt(email, false);
            return res.status(401).json({ message: 'User not found. Please sign up first.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            await logLoginAttempt(email, false);
            return res.status(401).json({ message: 'Invalid password' });
        }
        
        await logLoginAttempt(email, true);

        res.status(200).json({
            message: 'Welcome back!',
            token: 'mock-session-token-123',
        });
    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ message: 'Server error during login' });
    }
});

app.post('/api/forgot-password', async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? '');
    if (!email) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    try {
        const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
        const baseMsg =
            'If that email is registered, you can complete reset on the reset-password page. In development, the API also returns a token you can paste there.';
        if (!user) {
            return res.json({ message: baseMsg });
        }
        const token = crypto.randomBytes(32).toString('hex');
        await db.run('DELETE FROM password_resets WHERE email = ?', [email]);
        const expiresAt = new Date(Date.now() + 3600000).toISOString();
        await db.run('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [
            email,
            token,
            expiresAt,
        ]);
        console.log(`[reset-password] ${email} token expires ${expiresAt}`);
        if (process.env.NODE_ENV !== 'production') {
            return res.json({
                message: baseMsg,
                devResetToken: token,
                devResetEmail: email,
            });
        }
        res.json({ message: baseMsg });
    } catch (e) {
        console.error('forgot-password:', e.message);
        res.status(500).json({ message: 'Could not start reset' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? '');
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = req.body?.password;
    if (!email || !token) {
        return res.status(400).json({ message: 'Email and reset token are required.' });
    }
    const pw = validatePasswordStrength(password);
    if (!pw.ok) {
        return res.status(400).json({ message: pw.message });
    }
    try {
        const row = await db.get('SELECT * FROM password_resets WHERE email = ? AND token = ?', [
            email,
            token,
        ]);
        if (!row) {
            return res.status(400).json({ message: 'Invalid or unknown reset token.' });
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            await db.run('DELETE FROM password_resets WHERE email = ?', [email]);
            return res.status(400).json({ message: 'Reset link has expired. Request a new reset.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);
        await db.run('DELETE FROM password_resets WHERE email = ?', [email]);
        res.json({ message: 'Password updated. You can sign in now.' });
    } catch (e) {
        console.error('reset-password:', e.message);
        res.status(500).json({ message: 'Could not reset password' });
    }
});

app.get('/api/listings', async (_req, res) => {
    try {
        const rows = await db.all(
            'SELECT id, name, price, stockUnits, supplier, lotId, packedOn, created_by_email FROM produce_listings ORDER BY id DESC',
        );
        res.json({ listings: rows || [] });
    } catch (e) {
        console.error('listings GET:', e.message);
        res.status(500).json({ message: 'Could not load listings' });
    }
});

app.post('/api/listings', async (req, res) => {
    try {
        const b = req.body || {};
        const id = Number(b.id);
        const name = typeof b.name === 'string' ? b.name.trim() : '';
        const price =
            typeof b.price === 'string'
                ? b.price
                : Number.isFinite(Number(b.price))
                  ? Number(b.price).toFixed(2)
                  : '';
        const stockUnits = Math.max(0, Math.min(99999, Math.floor(Number(b.stockUnits) || 0)));
        const supplier = typeof b.supplier === 'string' ? b.supplier.trim().slice(0, 200) : '';
        const lotId = typeof b.lotId === 'string' ? b.lotId.trim().slice(0, 120) : '';
        const packedOn = typeof b.packedOn === 'string' ? b.packedOn.trim().slice(0, 32) : '';
        const createdBy =
            typeof b.created_by_email === 'string' 
                ? b.created_by_email.trim().toLowerCase().slice(0, 254)
                : null;
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' });
        }
        if (!name || name.length > 120) {
            return res.status(400).json({ message: 'Invalid produce name' });
        }
        if (!price || price.length > 16) {
            return res.status(400).json({ message: 'Invalid price' });
        }
        await db.run(
            `INSERT INTO produce_listings (id, name, price, stockUnits, supplier, lotId, packedOn, created_by_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               price = excluded.price,
               stockUnits = excluded.stockUnits,
               supplier = excluded.supplier,
               lotId = excluded.lotId,
               packedOn = excluded.packedOn,
               created_by_email = excluded.created_by_email`,
            [id, name, price, stockUnits, supplier, lotId, packedOn, createdBy],
        );
        res.status(201).json({ message: 'Listing saved' });
    } catch (e) {
        console.error('listings POST:', e.message);
        res.status(500).json({ message: 'Could not save listing' });
    }
});

app.delete('/api/listings/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const email = normalizeEmail(req.body?.email ?? '');
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' });
        }
        if (!email) {
            return res.status(400).json({ message: 'Valid email is required to remove a listing' });
        }
        const row = await db.get(
            'SELECT id, created_by_email FROM produce_listings WHERE id = ?',
            [id],
        );
        if (!row) {
            return res.status(404).json({ message: 'Listing not found' });
        }
        const owner = row.created_by_email ? String(row.created_by_email).trim().toLowerCase() : '';
        if (!owner || owner !== email) {
            return res.status(403).json({ message: 'You can only remove listings you added while signed in.' });
        }
        await db.run('DELETE FROM produce_listings WHERE id = ?', [id]);
        res.json({ message: 'Listing removed' });
    } catch (e) {
        console.error('listings DELETE:', e.message);
        res.status(500).json({ message: 'Could not remove listing' });
    }
});

app.patch('/api/listings/:id/stock', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const delta = Number(req.body?.delta);
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' });
        }
        if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
            return res.status(400).json({ message: 'Invalid stock' });
        }
        if (Math.abs(delta) > 999999) {
            return res.status(400).json({ message: 'Stock too large' });
        }
        await db.run(
            'UPDATE produce_listings SET stockUnits = MAX(0, stockUnits + ?) WHERE id = ?',
            [delta, id],
        );
        res.json({ message: 'Stock updated' });
    } catch (e) {
        console.error('stock PATCH:', e.message);
        res.status(500).json({ message: 'Stock update failed' });
    }
});

app.get('/api/cart', async (req, res) => {
    const email = normalizeEmail(String(req.query.email || ''));
    if (!email) {
        return res.status(400).json({ message: 'email query parameter is required' });
    }
    try {
        const row = await db.get('SELECT payload FROM user_carts WHERE email = ?', [email]); 
        let cart = [];
        if (row && row.payload) {
            try {
                const parsed = JSON.parse(row.payload);
                cart = Array.isArray(parsed) ? parsed : [];
            } catch {
                cart = [];
            }
        }
        res.json({ cart });
    } catch (e) {
        console.error('cart GET:', e.message);
        res.status(500).json({ message: 'Could not load cart' });
    }
});

app.put('/api/cart', async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? '');
    if (!email) {
        return res.status(400).json({ message: 'Invalid email' });
    }
    const cart = req.body?.cart;
    if (!Array.isArray(cart)) {
        return res.status(400).json({ message: 'cart must be an array' });
    }
    try {
        const payload = JSON.stringify(cart.slice(0, 200));
        await db.run(
            `INSERT INTO user_carts (email, payload) VALUES (?, ?)
             ON CONFLICT(email) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP`,
            [email, payload],
        );
        res.json({ message: 'Cart saved' });
    } catch (e) {
        console.error('cart PUT:', e.message);
        res.status(500).json({ message: 'Could not save cart' });
    }
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

function normalizeCheckoutLines(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
        return { error: 'Cart is empty' };
    }
    if (lines.length > 100) {
        return { error: 'Too many line items' };
    }
    const out = [];
    let sumPence = 0;
    for (const raw of lines) {
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        const qty = Number(raw.quantity);
        const unit = Number.parseFloat(raw.unitPrice);
        if (!name || name.length > 120) {
            return { error: 'Invalid product name' };
        }
        if (!Number.isFinite(qty) || qty < 1 || qty > 999 || !Number.isInteger(qty)) {
            return { error: 'Invalid quantity' };
        }
        if (!Number.isFinite(unit) || unit < 0 || unit > 500) {
            return { error: 'Invalid unit price' };
        }
        const unitPence = Math.round(unit * 100);
        if (unitPence < 1) {
            return { error: 'Unit price too low' };
        }
        const linePence = unitPence * qty;
        sumPence += linePence;
        if (sumPence > 99999999) {
            return { error: 'Order total too large' };
        }
        out.push({ name, quantity: qty, unitPence });
    }
    if (sumPence < 30) {
        return { error: 'Minimum card charge is £0.30 GBP (Stripe). Add more to your cart.' };
    }
    return { lines: out, sumPence };
}

app.post('/api/create-checkout-session', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(503).json({
                code: 'STRIPE_NOT_CONFIGURED',
                message:
                    'Set STRIPE_SECRET_KEY in backend/.env (Dashboard → Developers → API keys → Secret test key).',
            });
        }
        const { lines, fulfillment } = req.body || {};
        const parsed = normalizeCheckoutLines(lines);
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error });
        }
        const fulfill =
            fulfillment === 'delivery' || fulfillment === 'collection' ? fulfillment : 'collection';
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: parsed.lines.map((l) => ({
                quantity: l.quantity,
                price_data: {
                    currency: 'gbp',
                    unit_amount: l.unitPence,
                    product_data: { name: l.name },
                },
            })),
            success_url: `${FRONTEND_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/checkout?canceled=1`,
            metadata: { app: 'produce_shop', fulfillment: fulfill },
        });
        res.json({ url: session.url });
    } catch (err) {
        console.error('Checkout session error:', err.message);
        res.status(500).json({ message: err.message || 'Could not start checkout' });
    }
});

app.get('/api/checkout-session-summary', async (req, res) => {
    try {
        if (!stripe) {
            return res.status(503).json({
                code: 'STRIPE_NOT_CONFIGURED',
                message: 'Stripe not configured',
            });
        }
        const sessionId = req.query.session_id;
        if (!sessionId || typeof sessionId !== 'string') {
            return res.status(400).json({ message: 'session_id is required' });
        }
        const s = await stripe.checkout.sessions.retrieve(sessionId);
        if (s.payment_status !== 'paid') {
            return res.status(400).json({ message: 'Payment not completed.' });
        }
        res.json({
            amount_total: s.amount_total,
            currency: s.currency || 'gbp',
            payment_status: s.payment_status,
        });
    } catch (err) {
        console.error('Session summary error:', err.message);
        res.status(500).json({ message: 'Could not verify session' });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(` Server: http://localhost:${PORT}`));
