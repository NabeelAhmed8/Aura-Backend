const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 1. Express app initialize
const app = express();

// 2. CORS (Credentials & Cookies Support)
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Body Parsers & Cookie Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Folder (Agar backend se images serve karni hon)
app.use('/uploads', express.static('uploads'));

// Root health check route
app.get('/', (req, res) => {
  res.status(200).json({ status: 'success', message: 'AURA API Server is running.' });
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