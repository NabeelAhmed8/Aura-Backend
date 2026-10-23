const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 1. Express app initialize & Reverse Proxy Configuration (Render / Cloudflare support)
const app = express();
app.set('trust proxy', 1);

// 2. CORS (Cross-Origin Resource Sharing) Configuration
// Production (Render.com), Preview Deployments (Vercel/Netlify), and Localhost Support
const rawAllowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
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
  .map(url => url.trim().replace(/\/+$/, ''));

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

    // D. Allow cloud deployment domains (Vercel, Netlify, Render preview & production)
    if (
      /^https:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(cleanOrigin) ||
      /^https:\/\/([a-zA-Z0-9-]+\.)*onrender\.com$/.test(cleanOrigin) ||
      /^https:\/\/([a-zA-Z0-9-]+\.)*netlify\.app$/.test(cleanOrigin)
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

// Root health check route (Render health check / monitoring)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'AURA API Server is running successfully on Render.',
    environment: process.env.NODE_ENV || 'development',
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

// 6. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch((err) => console.log('DB Connection Error:', err));

// 7. Server Start
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
