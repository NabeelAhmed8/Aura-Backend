const express = require('express');
const Stripe = require('stripe');

// DHYAN DEIN: Agar aapka model folder 'Models' (Capital M) hai to '../Models/order' hoga
// Agar 'models' (Small m) hai to '../models/order' hoga.
let Order;
try {
  Order = require('../models/Order');
} catch (e) {
  try {
    Order = require('../models/Order');
  } catch (err) {
    Order = require('../models/Order');
  }
}

const router = express.Router();

// Stripe Init (Secret key check ke sath)
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY) 
  : null;

// In-Memory store for temporary test OTPs
const otpMemoryStore = {};

// =========================================================================
// 1. STRIPE PAYMENT INTENT (Card payments & 3D Secure OTP Popup)
// =========================================================================
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!stripe) {
      return res.status(500).json({ 
        message: 'Stripe Secret Key missing in backend .env file.' 
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      intentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe Intent Error:', error);
    res.status(500).json({ message: error.message || 'Payment intent creation failed.' });
  }
});

// =========================================================================
// 2. INITIATE LOCAL PAYMENT (JazzCash, EasyPaisa, Bank Transfer)
// =========================================================================
router.post('/initiate-local-payment', async (req, res) => {
  try {
    const { customer, items, totalAmount, paymentMethod, accountIdentifier, userId } = req.body;

    if (!customer || !items || !totalAmount || !accountIdentifier) {
      return res.status(400).json({ message: 'Missing required checkout information.' });
    }

    // Order create karein
    const order = new Order({
      userId: userId || null,
      customer,
      items,
      totalAmount,
      paymentMethod,
      senderNumber: accountIdentifier,
      paymentStatus: 'Pending',
      orderStatus: 'Processing',
    });

    await order.save();

    // 4-Digit OTP Generate karein (Test Code: 1234)
    const generatedOtp = '1234';
    otpMemoryStore[order._id.toString()] = generatedOtp;

    console.log(`[PAYMENT INITIATED] Method: ${paymentMethod} | Sender: ${accountIdentifier} | OTP: ${generatedOtp}`);

    res.status(200).json({
      success: true,
      orderId: order._id,
      message: `4-digit OTP dispatched to ${accountIdentifier}. (Test Code: 1234)`,
    });
  } catch (error) {
    console.error('Local Payment Initiate Error:', error);
    res.status(500).json({ message: error.message || 'Payment initiation failed.' });
  }
});

// =========================================================================
// 3. VERIFY LOCAL OTP & DEDUCT / CONFIRM PAYMENT
// =========================================================================
router.post('/verify-local-otp', async (req, res) => {
  try {
    const { orderId, otp } = req.body;

    if (!orderId || !otp) {
      return res.status(400).json({ message: 'Order ID and OTP code are required.' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order reference not found.' });
    }

    const expectedOtp = otpMemoryStore[orderId.toString()] || '1234';

    if (otp !== expectedOtp && otp !== '1234') {
      return res.status(400).json({ message: 'Invalid 4-digit OTP code. Please retry.' });
    }

    order.paymentStatus = 'Paid';
    order.transactionId = `${order.paymentMethod.toUpperCase()}-TXN-${Math.floor(10000000 + Math.random() * 90000000)}`;
    await order.save();

    delete otpMemoryStore[orderId.toString()];

    res.status(200).json({
      success: true,
      message: 'Payment authorized and debited successfully.',
      data: order,
    });
  } catch (error) {
    console.error('OTP Verification Error:', error);
    res.status(500).json({ message: error.message || 'OTP verification failed.' });
  }
});

// =========================================================================
// 4. PLACE ORDER (Cash on Delivery & Stripe Completed)
// =========================================================================
router.post('/place-order', async (req, res) => {
  try {
    const { customer, items, totalAmount, paymentMethod, stripePaymentIntentId, userId } = req.body;

    if (!customer || !items || !totalAmount) {
      return res.status(400).json({ message: 'Missing order details.' });
    }

    const isStripe = paymentMethod === 'Stripe';

    const order = new Order({
      userId: userId || null,
      customer,
      items,
      totalAmount,
      paymentMethod,
      paymentStatus: isStripe ? 'Paid' : 'Pending',
      orderStatus: 'Processing',
      stripePaymentIntentId: isStripe ? stripePaymentIntentId : null,
      transactionId: isStripe ? stripePaymentIntentId : `COD-${Date.now()}`,
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: order,
    });
  } catch (error) {
    console.error('Place Order Error:', error);
    res.status(500).json({ message: error.message || 'Order placement failed.' });
  }
});

// =========================================================================
// 5. GET USER ORDERS (Profile.jsx order history)
// =========================================================================
router.get('/user-orders', async (req, res) => {
  try {
    const { email, userId } = req.query;

    if (!email && !userId) {
      return res.status(400).json({ success: false, message: 'User email or userId is required' });
    }

    const queryConditions = [];
    if (email && email.trim()) {
      const emailRegex = new RegExp(`^${email.trim()}$`, 'i');
      queryConditions.push({ 'customer.email': { $regex: emailRegex } });
    }
    if (userId && userId.trim()) {
      queryConditions.push({ userId: userId.trim() });
    }

    const orders = await Order.find(
      queryConditions.length > 1 ? { $or: queryConditions } : queryConditions[0]
    ).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error('Fetch User Orders Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch user orders' });
  }
});

module.exports = router;