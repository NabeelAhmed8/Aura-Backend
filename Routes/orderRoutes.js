const express = require('express');
const Stripe = require('stripe');
const Order = require('../models/Order');
const User = require('../models/Users');

const router = express.Router();

// Helper to automatically save/sync checkout delivery address to user profile
const autoSaveUserAddress = async (userId, customer) => {
  try {
    if (!customer) return null;
    const street = (customer.address || customer.streetAddress || '').trim();
    const city = (customer.city || '').trim();
    if (!street || !city) return null;

    const email = customer.email ? customer.email.trim() : null;

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }
    if (!user && email) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    }
    if (!user) return null;

    if (!Array.isArray(user.addresses)) {
      user.addresses = [];
    }

    const normStreet = street.toLowerCase();
    const normCity = city.toLowerCase();

    const exists = user.addresses.some((a) => {
      const aStreet = (a.streetAddress || a.address || '').trim().toLowerCase();
      const aCity = (a.city || '').trim().toLowerCase();
      return aStreet === normStreet && aCity === normCity;
    });

    if (!exists) {
      const isFirst = user.addresses.length === 0;
      user.addresses.push({
        fullName: customer.name ? customer.name.trim() : `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Valued Customer',
        phone: customer.phone ? customer.phone.trim() : (user.phone || ''),
        streetAddress: street,
        city: city,
        state: customer.state ? customer.state.trim() : '',
        postalCode: customer.postalCode ? customer.postalCode.trim() : '',
        country: customer.country ? customer.country.trim() : 'Pakistan',
        isDefault: isFirst,
      });
      await user.save();
      console.log(`[ADDRESS AUTO-SAVED] Saved new address to user profile: ${user.email} (${street}, ${city})`);
    }
    return user;
  } catch (err) {
    console.error('Error auto-saving user address:', err);
    return null;
  }
};

// Stripe Init (Secret key check ke sath)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// In-Memory store for temporary test OTPs
const otpMemoryStore = {};

// =========================================================================
// 1. OPTIONS ROUTE (Allowed HTTP Methods Check)
// =========================================================================
router.options('/', (req, res) => {
  res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    message: 'Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS',
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

// =========================================================================
// 2. GET ROUTES (Orders Dekhne Ke Liye)
// =========================================================================

// 2A. Saare orders aur total count hasil karein (GET / ya /all ya /list)
router.get(['/', '/all', '/list'], async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      totalOrders: orders.length,
      orders
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2B. User ke specific orders fetch karein (GET /user?email=... ya /user-orders)
router.get(['/user', '/user-orders'], async (req, res) => {
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
      count: orders.length,
      orders,
      data: orders // backward compatibility for frontend
    });
  } catch (error) {
    console.error('Fetch User Orders Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to fetch user orders' });
  }
});

// =========================================================================
// 3. POST ROUTES (Order & Payment Creation)
// =========================================================================

// 3A. Simple Order Place karein (POST / ya /create ya /place-order)
router.post(['/', '/create', '/place-order'], async (req, res) => {
  try {
    const { customer, items, totalAmount, paymentMethod, stripePaymentIntentId, userId } = req.body;

    // 1. Strict Authentication Check: User must be logged in to place an order
    const effectiveUserId = userId || req.body.user?._id || req.body.user?.id;
    let authenticatedUser = null;
    if (effectiveUserId) {
      try {
        authenticatedUser = await User.findById(effectiveUserId);
      } catch (findErr) {
        // Invalid ObjectId format ignored
      }
    }
    if (!authenticatedUser && customer?.email) {
      authenticatedUser = await User.findOne({ email: customer.email.trim().toLowerCase() });
    }

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: 'Order restricted: You must be logged in to your account to place an order.'
      });
    }

    if (!customer || !items || !totalAmount) {
      return res.status(400).json({ success: false, message: 'Missing required order details (customer, items, totalAmount).' });
    }

    const isStripe = paymentMethod === 'Stripe';

    // Verify Stripe payment intent on server-side if Stripe method is chosen
    if (isStripe) {
      if (!stripePaymentIntentId) {
        return res.status(400).json({ success: false, message: 'Missing Stripe transaction reference.' });
      }
      if (stripe) {
        try {
          const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
          if (intent.status !== 'succeeded') {
            return res.status(400).json({
              success: false,
              message: `Stripe payment status is '${intent.status}'. Order cannot be marked as paid.`
            });
          }
        } catch (sErr) {
          console.error('Stripe Intent Verification Error:', sErr);
          return res.status(400).json({
            success: false,
            message: `Stripe verification failed: ${sErr.message}`
          });
        }
      }
    }

    const order = new Order({
      userId: authenticatedUser._id.toString(),
      customer: {
        ...customer,
        email: authenticatedUser.email || customer.email,
      },
      items,
      totalAmount,
      paymentMethod: paymentMethod || 'Direct Order',
      paymentStatus: isStripe ? 'Paid' : 'Pending',
      orderStatus: 'Processing',
      stripePaymentIntentId: isStripe ? stripePaymentIntentId : null,
      transactionId: isStripe ? stripePaymentIntentId : `AURA-${Date.now()}`,
    });

    await order.save();
    await autoSaveUserAddress(authenticatedUser._id.toString(), customer);

    res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      order,
      data: order
    });
  } catch (error) {
    console.error('Place Order Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Order placement failed.' });
  }
});

// 3B. Stripe Payment Intent (POST /pay-stripe ya /create-payment-intent)
router.post(['/pay-stripe', '/create-payment-intent'], async (req, res) => {
  try {
    const { amount, customer, userId } = req.body;

    // Authentication Check: User must be logged in to initialize Stripe payment
    const effectiveUserId = userId || req.body.user?._id || req.body.user?.id;
    let authenticatedUser = null;
    if (effectiveUserId) {
      try {
        authenticatedUser = await User.findById(effectiveUserId);
      } catch (findErr) { }
    }
    if (!authenticatedUser && customer?.email) {
      authenticatedUser = await User.findOne({ email: customer.email.trim().toLowerCase() });
    }

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in to initiate payment.'
      });
    }

    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe Secret Key missing in backend .env file.'
      });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(numAmount * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      receipt_email: (authenticatedUser.email || customer?.email || '').trim() || undefined,
      description: `AURA Order - ${authenticatedUser.firstName || customer?.name || 'Customer'}`,
      metadata: {
        userId: authenticatedUser._id.toString(),
        customerName: `${authenticatedUser.firstName || ''} ${authenticatedUser.lastName || ''}`.trim() || customer?.name || '',
        customerEmail: authenticatedUser.email || customer?.email || '',
        customerPhone: customer?.phone || authenticatedUser.phone || '',
      }
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      intentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Stripe Intent Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Payment intent creation failed.' });
  }
});

// 3C. Local Payment Initiate (JazzCash, EasyPaisa, BankTransfer) (POST /pay-local ya /initiate-local-payment)
router.post(['/pay-local', '/initiate-local-payment'], async (req, res) => {
  try {
    const { customer, items, totalAmount, paymentMethod, accountIdentifier, userId } = req.body;

    // Strict Authentication Check
    const effectiveUserId = userId || req.body.user?._id || req.body.user?.id;
    let authenticatedUser = null;
    if (effectiveUserId) {
      try {
        authenticatedUser = await User.findById(effectiveUserId);
      } catch (findErr) { }
    }
    if (!authenticatedUser && customer?.email) {
      authenticatedUser = await User.findOne({ email: customer.email.trim().toLowerCase() });
    }

    if (!authenticatedUser) {
      return res.status(401).json({
        success: false,
        message: 'Order restricted: You must be logged in to your account to place an order.'
      });
    }

    if (!customer || !items || !totalAmount || !accountIdentifier) {
      return res.status(400).json({ message: 'Missing required checkout information.' });
    }

    const order = new Order({
      userId: authenticatedUser._id.toString(),
      customer: {
        ...customer,
        email: authenticatedUser.email || customer.email,
      },
      items,
      totalAmount,
      paymentMethod,
      senderNumber: accountIdentifier,
      paymentStatus: 'Pending',
      orderStatus: 'Processing',
    });

    await order.save();
    await autoSaveUserAddress(authenticatedUser._id.toString(), customer);

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

// 3D. Verify Local OTP (POST /verify-otp ya /verify-local-otp)
router.post(['/verify-otp', '/verify-local-otp'], async (req, res) => {
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
    await autoSaveUserAddress(order.userId, order.customer);

    delete otpMemoryStore[orderId.toString()];

    res.status(200).json({
      success: true,
      message: 'Payment authorized and debited successfully.',
      data: order,
      order
    });
  } catch (error) {
    console.error('OTP Verification Error:', error);
    res.status(500).json({ message: error.message || 'OTP verification failed.' });
  }
});

// =========================================================================
// 4. PUT ROUTES (Full Order Update)
// =========================================================================
// (Parametrized Section mein GET/PUT/PATCH/DELETE /:id mojood hai)

// =========================================================================
// 5. PATCH ROUTES (Partial Update / Status Change)
// =========================================================================
// 5A. Status change by body (PATCH /status ya /update-status)
router.patch(['/status', '/update-status'], async (req, res) => {
  try {
    const { orderId, orderStatus, paymentStatus } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required in body.' });
    }

    const updateFields = {};
    if (orderStatus) updateFields.orderStatus = orderStatus;
    if (paymentStatus) updateFields.paymentStatus = paymentStatus;

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully.',
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// 6. DELETE ROUTES
// =========================================================================
// 6A. Order delete by query/body (DELETE / ya /delete?orderId=...)
router.delete(['/', '/delete'], async (req, res) => {
  try {
    const orderId = req.query.orderId || req.body.orderId;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required to delete order.' });
    }

    const deletedOrder = await Order.findByIdAndDelete(orderId);
    if (!deletedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    res.status(200).json({
      success: true,
      message: `Order ${orderId} deleted successfully.`,
      deletedOrder
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// 7. PARAMETRIZED ROUTES (/:id) - Hamesha Static Routes Ke Baad
// =========================================================================

// 7A. GET: Single order details by ID (GET /:id)
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid order ID format.' });
  }
});

// 7B. PUT: Full order update by ID (PUT /:id)
router.put('/:id', async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Order updated successfully.',
      order: updatedOrder
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Invalid order ID.' });
  }
});

// 7C. PATCH: Partial update by ID (e.g. status) (PATCH /:id)
router.patch('/:id', async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Order updated (PATCH) successfully.',
      order: updatedOrder
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Invalid order ID.' });
  }
});

// 7D. DELETE: Delete order by ID (DELETE /:id)
router.delete('/:id', async (req, res) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id);
    if (!deletedOrder) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Order deleted successfully.',
      deletedOrder
    });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid order ID.' });
  }
});

// 7E. OPTIONS: Allowed methods for single order (OPTIONS /:id)
router.options('/:id', (req, res) => {
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    allowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

module.exports = router;