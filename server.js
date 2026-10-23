const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 1. Express app initialize & Reverse Proxy Configuration (Railway / Render / Cloudflare support)
const app = express();
app.set('trust proxy', 1);

// 2. CORS (Cross-Origin Resource Sharing) Configuration
// Supports Railway (*.railway.app, *.up.railway.app), GitHub Pages (*.github.io), Vercel, Netlify, Render, and Localhost
const rawAllowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null,
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];

const allowedOrigins = rawAllowedOrigins
  .filter(Boolean)
  .flatMap(url => {
    const trimmed = url.trim().replace(/\/+$/, '');
    try {
      const u = new URL(trimmed);
      return [trimmed, u.origin];
    } catch {
      return [trimmed];
    }
  });

const corsOptions = {
  origin: function (origin, callback) {
    // A. Allow non-browser requests (e.g. Postman, curl, server-to-server webhooks like Stripe/Safepay)
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/+$/, '');

    // B. Whitelist check (FRONTEND_URL, ALLOWED_ORIGINS, localhost)
    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    // C. Allow any localhost or 127.0.0.1 port (Local frontend development)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
      return callback(null, true);
    }

    // D. Allow cloud deployment & static host domains (Railway, GitHub Pages, Vercel, Netlify, Render)
    if (
      /^https:\/\/([a-zA-Z0-9-]+\.)*(vercel\.app|onrender\.com|netlify\.app|github\.io|railway\.app|up\.railway\.app)$/.test(cleanOrigin)
    ) {
      return callback(null, true);
    }

    // E. Dynamic fallback: allow in non-production or when STRICT_CORS is false
    if (process.env.NODE_ENV !== 'production' || process.env.STRICT_CORS !== 'true') {
      return callback(null, true);
    }

    return callback(new Error(`CORS Error: Origin ${origin} not permitted by policy.`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Set-Cookie', 'Authorization'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));

// Body Parsers & Cookie Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Folder (Agar backend se images serve karni hon)
app.use('/uploads', express.static('uploads'));

// Root health check route (Railway health check / monitoring)
app.get('/', (req, res) => {
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.status(200).json({
    status: 'success',
    message: 'AURA API Server is running successfully.',
    database: dbStates[mongoose.connection.readyState] || 'unknown',
    environment: process.env.NODE_ENV || (process.env.RAILWAY_ENVIRONMENT ? 'production' : 'development'),
    timestamp: new Date().toISOString()
  });
});

// 3. Routes register karein
const authRoutes = require('./Routes/authRoutes');
app.use('/api/users', authRoutes);
app.use('/api/auth', authRoutes);

const productRoutes = require('./Routes/productRoutes');
app.use('/api/products', productRoutes);

const contactRoutes = require('./Routes/contactRoutes');
app.use('/api/contact', contactRoutes);

const newsletterRoutes = require('./Routes/subscriberRoutes');
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/subscribers', newsletterRoutes);

const orderRoutes = require('./Routes/orderRoutes');
app.use('/api/orders', orderRoutes);

const reviewRoutes = require('./Routes/reviewRoutes');
app.use('/api/reviews', reviewRoutes);


// 4. Catch-All for undefined routes (JSON Response with explicit header)
app.use((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`
  });
});

// 5. Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Internal Error:', err);
  res.setHeader('Content-Type', 'application/json');
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 6. MongoDB Connection (Supports MONGO_URI, MONGO_URL from Railway MongoDB plugin, or Atlas)
const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URL;
if (!mongoUri) {
  console.error('WARNING: Neither MONGO_URI nor MONGO_URL found in environment variables!');
} else {
  mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  })
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch((err) => console.error('DB Connection Error:', err.message));
}

// 7. Server Start (Listen on 0.0.0.0 for Railway / Container environments)
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
