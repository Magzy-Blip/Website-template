//imported tools that are important towards the webpages function throughout.
const express = require('express');// helps interpret user requests like page shifting etc.
const cors = require('cors');// this import allows clear and fast communication between the backend and frontend like login proceccessing.
const bcrypt = require('bcryptjs');// used for password hashing and validation
const crypto = require('crypto');// this is used for scurely generating reset tokens for the user.
const db = require('./db');// local file storage for the for the websites assets and user information.
require('dotenv').config();// helps load condidential data in a secure way (.env) without risk of unwanted access.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Preparing user email for storage through format validation and state checking eg capitalization to lowercase letters. */
function normalizeEmail(raw) {
    if (typeof raw !== 'string') return null; /*if the user input is not a string the program retuns faulse instead of a crash*/
    const e = raw.trim().toLowerCase(); /*checks for accidental spacing and capitalizations and removes them as well as making the whole string lowercase*/
    if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null; /*final check uses three methods, empty input, length checking to make sure its withing standard and basic email format triats like @ and .com.*/
    return e;
}

/** preparing user password for storage through a series of tests to verify security and validity. */
function validatePasswordStrength(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return { ok: false, message: 'Password must be at least 8 characters.' }; /*checks if the password is is not a string and the legth is less the 8 which returns invalid if true to avoid a crash*/
    }
    if (password.length > 20) {
        return { ok: false, message: 'Password is too long.' };/* if the is greater than 20 characters it retuns false else pass*/
    }
    if (!/[a-z]/.test(password)) {
        return { ok: false, message: 'Password must include a lowercase letter.' };/* If the password doesnt contain a lowercase letter then the program will return false else pass*/
    }
    if (!/[A-Z]/.test(password)) {
        return { ok: false, message: 'Password must include an uppercase letter.' };/* If the password doesnt inlclude an uppercase letter it will return false else pass*/
    }
    if (!/[0-9]/.test(password)) {
        return { ok: false, message: 'Password must include a digit.' };/* if the password doesnt include a digit it will return false else pass*/
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return { ok: false, message: 'Password must include a symbol (e.g. !@#$%).' };/* if the password doesnt include special characters it will return false else pass*/
    }
    return { ok: true }; /* if all conditions are met then allow user to pass */
}

/* logs user login attemps and alows admin intervention to be affective if someone is trying a brute force attack*/ 
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

// 1. CORS: default Vite port; in dev allow any localhost port (Vite may use 5174 if 5173 is taken)
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

// Checks if the server is running before the validation begins.
app.get('/', (req, res) => {
    res.json({ status: "Backend is running!" });
});

// Signup process
app.post('/api/signup', async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body?.email ?? '');
    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Some fields are empty' }); /* if the user hasnt filled in any of the collumns then the program will check and retun false as well as an error messege*/ 
        }
        if (typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Name required' }); /* if the name enterred is not a string and is a different data fomrat like int the program will return flase as well as an error messege*/
        }

        const pw = validatePasswordStrength(password);
        if (!pw.ok) {
            return res.status(400).json({ message: pw.message }); /* checks for password strength using all the previous password validations*/ 
        }

        const hashedPassword = await bcrypt.hash(password, 10); /*hashing and salt esentially the first level of password security that scrambles user password which can be fetched by the code but cannot be interpretted by outside sources. */

        /*this is where the program saves user data into the = databse for the later login process fetching*/
        await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
            name.trim(),
            email,
            hashedPassword,
        ]);
        /* if the email is already in the database then the program will stop the signup process isntead of crashing aswell as retuning a messege to the user*/
        res.status(201).json({ message: 'Welcome!' });
    } catch (err) { 
        console.error('Signup Error:', err.message);
        const msg = err.message.includes('UNIQUE') ? 'Email already exists' : err.message;
        res.status(500).json({ message: 'Database error: ' + msg });
    }
});

// login proccess
//fetches data while using post to hide secure infomrtion away from outside intervention
app.post('/api/login', async (req, res) => {
    const { password } = req.body;
    const email = normalizeEmail(req.body?.email ?? '');
    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' }); /* checks if the email or password are empty then returns an error or continues if information is there*/
        }

        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]); /* essentially tells the program what collumns in the data base to select user information from*/

        /* if the user information has no error ut doesnt seem to be in the data base then the program will prompt the user to singup*/
        if (!user) {
            await logLoginAttempt(email, false);
            return res.status(401).json({ message: 'User not found. Please sign up first.' });
        }

        /* this compares the users enterred password to the hashed password in the database, this archieved but hashing the password enterred with the same exact salt to compare with the stored password*/
        const isMatch = await bcrypt.compare(password, user.password_hash);

        /* keeps a track of the amount of times the password has been enterred invalidly and returns an error if the password is invalid*/
        if (!isMatch) {
            await logLoginAttempt(email, false);
            return res.status(401).json({ message: 'Invalid password' });
        }
        
        /*--------------------------------------------------------*/
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

// Password reset token code --------------------------------------------------------------------------------------
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

// 
app.post('/api/reset-password', async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? '');
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const password = req.body?.password;
    if (!email || !token) {
        return res.status(400).json({ message: 'Email and reset token are required.' }); /* checks if the user has enterred the email and reset token*/
    }
    const pw = validatePasswordStrength(password); /* validates the strength of the new password */
    if (!pw.ok) {
        return res.status(400).json({ message: pw.message });
    }
    try {
        const row = await db.get('SELECT * FROM password_resets WHERE email = ? AND token = ?', [
            email,
            token,
        ]);
        if (!row) {
            return res.status(400).json({ message: 'Invalid or unknown reset token.' });/* checks the validity of the enterred reset token */
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            await db.run('DELETE FROM password_resets WHERE email = ?', [email]);
            return res.status(400).json({ message: 'Reset link has expired. Request a new reset.' }); /* makes sure the reset link being used hasnt expired and if expiry is true prompts user the get another link */
        }
        const hashedPassword = await bcrypt.hash(password, 10); /* new password is hashed and salt is added once again*/
        await db.run('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]); /* the new password password is added corresponding to the reset email*/
        await db.run('DELETE FROM password_resets WHERE email = ?', [email]);/* delets any old password from the database cleaning up the unused information */
        res.json({ message: 'Password updated. You can sign in now.' });/* returns a messege to let the user know the new password has been updated*/
    } catch (e) {
        console.error('reset-password:', e.message);
        res.status(500).json({ message: 'Could not reset password' });/* if the password couldnt be reset for any reason the program returns an error messege letting the user know that the proccess was unsecessful*/
    }
});

// This part of the code allows users from different devices to view the same catalogue
// Read query is used to as the code needs to have access to data stored in the backend database to help display information for the user
app.get('/api/listings', async (_req, res) => {
    try {
        const rows = await db.all(
            'SELECT id, name, price, stockUnits, supplier, lotId, packedOn, created_by_email FROM produce_listings ORDER BY id DESC',
        ); /* getting specific collumns of data instead of the whole database to help with fetching time efficiency */
        res.json({ listings: rows || [] });
    } catch (e) {
        console.error('listings GET:', e.message);
        res.status(500).json({ message: 'Could not load listings' });/* error catch if there is an error with the fetching the code returns an error and stops the whole program from crashing*/
    }
});

/* user inventory manager adds any new products and is resposible for input validation to make sure anything tht makes it into the data base is actually suitable, full and clean */

app.post('/api/listings', async (req, res) => {
    try {
        /* takes data sent by the code and scrubs it */
        const b = req.body || {};/* if the website returns empty strings it ensures it doesnt crash*/
        const id = Number(b.id);/* makes sure javascript treats the id as text not string*/
        const name = typeof b.name === 'string' ? b.name.trim() : '';/* checks if the name is string then uses trim to remove any unwanted space*/
        const price = /* this is the beggining of the amount display fomratting making sure that what the user sees is a polished error free price display*/
            typeof b.price === 'string'
                ? b.price
                : Number.isFinite(Number(b.price))
                  ? Number(b.price).toFixed(2)
                  : '';
        const stockUnits = Math.max(0, Math.min(99999, Math.floor(Number(b.stockUnits) || 0)));/* makes sure that the money always follows a float format like 1.50 and cant be anything else like 10.000001*/
        const supplier = typeof b.supplier === 'string' ? b.supplier.trim().slice(0, 200) : '';/* chops long strings to make sure that the page layout stays clean and consice same thing for the lot id and packedOn*/
        const lotId = typeof b.lotId === 'string' ? b.lotId.trim().slice(0, 120) : '';
        const packedOn = typeof b.packedOn === 'string' ? b.packedOn.trim().slice(0, 32) : '';
        const createdBy = /* labels the created listing with the persons email for later use and editing rights then any spaces are removed from the email its put in lowercase and sliced*/
            typeof b.created_by_email === 'string' 
                ? b.created_by_email.trim().toLowerCase().slice(0, 254)
                : null;
        /*id listing verification*/
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' });
        }
        if (!name || name.length > 120) {
            return res.status(400).json({ message: 'Invalid produce name' });
        }
        if (!price || price.length > 16) {
            return res.status(400).json({ message: 'Invalid price' });
        }
        /* this is where the listing is added to the database and saved for later viewing without dissapearing after page reload*/
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
        res.status(500).json({ message: 'Could not save listing' });/* if an error occurs the website will return an error*/
    }
});

/* verification for listing removal if a person did not add the item they cannot remove said item from the website*/
app.delete('/api/listings/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const email = normalizeEmail(req.body?.email ?? '');
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' }); /* the item itself*/
        }
        if (!email) {
            return res.status(400).json({ message: 'Valid email is required to remove a listing' });/* the email tired to the id is invalid*/
        }
        const row = await db.get(
            'SELECT id, created_by_email FROM produce_listings WHERE id = ?', /* the location of the item in th databse*/
            [id],
        );
        if (!row) {
            return res.status(404).json({ message: 'Listing not found' });/* if the listing wasnt found in the databse*/
        }
        const owner = row.created_by_email ? String(row.created_by_email).trim().toLowerCase() : '';
        if (!owner || owner !== email) {
            return res.status(403).json({ message: 'You can only remove listings you added while signed in.' });/* a different user from the one who created the listing tries to remove said item*/
        }
        await db.run('DELETE FROM produce_listings WHERE id = ?', [id]);
        res.json({ message: 'Listing removed' }); /* successful item removal from the databse*/
    } catch (e) {
        console.error('listings DELETE:', e.message);
        res.status(500).json({ message: 'Could not remove listing' });/* error removing item from databse as a result of other issues*/
    }
});

app.patch('/api/listings/:id/stock', async (req, res) => {
    try {
        const id = Number(req.params.id);/* the item quantity is part of the url and the constant uses this information*/
        if (!Number.isFinite(id) || id < 1) {
            return res.status(400).json({ message: 'Invalid listing id' }); /* checks whether the id is valid */
        }
        if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
            return res.status(400).json({ message: 'Invalid stock' });/* checks for a valid change using delta is works out if the difference is valid*/
        }
        if (Math.abs(delta) > 999999) {
            return res.status(400).json({ message: 'Stock too large' });/* stops user from adding too much quantity amount*/
        }
        await db.run(
            'UPDATE produce_listings SET stockUnits = MAX(0, stockUnits + ?) WHERE id = ?',
            [delta, id],
        );/* this helps prevent negative values if there is only 2 of an item left in stock you cant order more than than which stops negative values from appearing*/
        res.json({ message: 'Stock updated' });/* stock updated messege for he user green light conformation that the website worked*/
    } catch (e) {
        console.error('stock PATCH:', e.message);
        res.status(500).json({ message: 'Stock update failed' });/* lets the user know that the stock update has failed and something went wrong*/
    }
});

/* finds user specific shopping cart and items isnside this means thaht the user t=can keep saved items without worrying or being at risk of losing said items*/
app.get('/api/cart', async (req, res) => {
    const email = normalizeEmail(String(req.query.email || ''));
    if (!email) {
        return res.status(400).json({ message: 'email query parameter is required' });/* makes sure the email parametre is filled*/
    }
    /* this try statement retrieves the users cart data from the dat base*/
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
        res.status(500).json({ message: 'Could not load cart' });/* if cart doesnt exist or failed to be retrieved then the javascript returns an error to stop the website from crashing*/
    }
});

/* this code is used for overwriting the shopping cart*/
app.put('/api/cart', async (req, res) => {
    const email = normalizeEmail(req.body?.email ?? '');
    if (!email) {
        return res.status(400).json({ message: 'Invalid email' });/* another email validation for the user saved data */
    }
    const cart = req.body?.cart;
    if (!Array.isArray(cart)) {
        return res.status(400).json({ message: 'cart must be an array' });/* verifys item intergrity and not a random combination of data*/
    }
    try {
        const payload = JSON.stringify(cart.slice(0, 200));
        await db.run(
            `INSERT INTO user_carts (email, payload) VALUES (?, ?)
             ON CONFLICT(email) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP`,
            [email, payload],
        ); /* this is where the items inside the cart are sent and saved to the database*/
        res.json({ message: 'Cart saved' });
    } catch (e) {
        console.error('cart PUT:', e.message);
        res.status(500).json({ message: 'Could not save cart' }); /* an error is returned incase the data couldnt be saved or an error occurred*/
    }
});

// url must match the backend and frontend 
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Stripe secret key fetching 
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? require('stripe')(stripeSecret) : null;

/**
 * Validates cart line items from the client and converts to integer **pence** per line (GBP).
 * Rejects bad shapes, huge orders, and totals under Stripe’s typical UK card minimum (£0.30).
 */
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
        const qty = Number(raw.quantity); // whole units only
        const unit = Number.parseFloat(raw.unitPrice); // GBP per unit from client
        if (!name || name.length > 120) {
            return { error: 'Invalid product name' };
        }
        if (!Number.isFinite(qty) || qty < 1 || qty > 999 || !Number.isInteger(qty)) {
            return { error: 'Invalid quantity' };
        }
        if (!Number.isFinite(unit) || unit < 0 || unit > 500) {
            return { error: 'Invalid unit price' };
        }
        const unitPence = Math.round(unit * 100); // Stripe GBP amounts are in pence
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

/** Creates a Stripe Checkout Session and returns session.url for a full-page redirect. */
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
        // fulfillment: 'collection' | 'delivery' — stored on the Stripe session for bookkeeping (optional).
        const fulfill =
            fulfillment === 'delivery' || fulfillment === 'collection' ? fulfillment : 'collection';
        const session = await stripe.checkout.sessions.create({
            mode: 'payment', // one-time payment (not subscription)
            payment_method_types: ['card'],
            // One Stripe line item per validated cart row
            line_items: parsed.lines.map((l) => ({
                quantity: l.quantity,
                price_data: {
                    currency: 'gbp',
                    unit_amount: l.unitPence,
                    product_data: { name: l.name },
                },
            })),
            // Stripe replaces {CHECKOUT_SESSION_ID} in the redirect URL
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

/** Lets the thank-you page confirm payment_status and read amount_total using the server secret. */
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
app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));