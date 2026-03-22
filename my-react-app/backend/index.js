const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db'); 
require('dotenv').config();

const app = express();

// 1. CORS: Explicitly allow your Vite frontend port
app.use(cors({ origin: 'http://localhost:5173' })); 
app.use(express.json());

// 2. Health Check (Test by visiting http://localhost:5000/ in your browser)
app.get('/', (req, res) => {
    res.json({ status: "Backend is running!" });
});

// 3. SIGNUP ROUTE
app.post('/api/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.run(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        res.status(201).json({ message: "Account created locally in SQLite!" });
    } catch (err) {
        console.error("Signup Error:", err.message);
        const msg = err.message.includes('UNIQUE') ? "Email already exists" : err.message;
        res.status(500).json({ message: "Database error: " + msg });
    }
});

// 4. LOGIN ROUTE 
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Search for the user in your SQLite file
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.status(401).json({ message: "User not found. Please sign up first." });
        }

        // Compare the typed password with the hashed one in the DB
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        // Success!
        res.status(200).json({ 
            message: "Welcome back!", 
            token: "mock-session-token-123" // In a real app, use JWT here
        });

    } catch (err) {
        console.error("Login Error:", err.message);
        res.status(500).json({ message: "Server error during login" });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));