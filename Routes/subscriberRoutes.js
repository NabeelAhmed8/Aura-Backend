const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');

// ==========================================
// 1. OPTIONS ROUTE (Allowed HTTP Methods Check)
// ==========================================
router.options('/', (req, res) => {
  res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    message: 'Allowed methods: GET, POST, PUT, PATCH, DELETE, OPTIONS',
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

// ==========================================
// 2. GET ROUTES
// ==========================================
// 2A. Saare subscribers aur total count fetch karein (/ ya /list)
router.get(['/', '/list', '/List'], async (req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      totalSubscribers: subscribers.length,
      subscribers
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2B. Email se single subscriber search karein (/find?email=...)
router.get('/find', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email query parameter is required.' });
    }

    const subscriber = await Subscriber.findOne({ email: email.trim().toLowerCase() });
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }

    res.status(200).json({ success: true, subscriber });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. POST ROUTES
// ==========================================
// 3A. Naya subscriber add / subscribe karein (/ ya /subscribe-add)
router.post(['/', '/subscribe'], async (req, res) => {
  try {
    const { email, status } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check karein kya yeh email pehle se exist karti hai
    const existing = await Subscriber.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'This email is already subscribed.',
        subscriber: existing
      });
    }

    const newSubscriber = new Subscriber({
      email: cleanEmail,
      status: status || 'active'
    });
    const saved = await newSubscriber.save();

    return res.status(201).json({
      success: true,
      message: 'Subscribed successfully.',
      subscriber: saved,
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

// ==========================================
// 4. PUT ROUTES (Full Update)
// ==========================================
// 4A. Email ke zariye update karein (/ ya /update)
router.put(['/', '/update'], async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    const { newEmail, status } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Target email is required.' });
    }

    const subscriber = await Subscriber.findOne({ email: email.trim().toLowerCase() });
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }

    if (newEmail) subscriber.email = newEmail.trim().toLowerCase();
    if (status) subscriber.status = status;

    await subscriber.save();

    res.status(200).json({
      success: true,
      message: 'Subscriber updated successfully.',
      subscriber
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. PATCH ROUTES (Partial Update / Status Change)
// ==========================================
// 5A. Email ke zariye status update / toggle karein
router.patch(['/', '/update-status'], async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required to patch subscriber.' });
    }

    const updatedSubscriber = await Subscriber.findOneAndUpdate(
      { email: email.trim().toLowerCase() },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedSubscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Subscriber patched successfully.',
      subscriber: updatedSubscriber
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 6. DELETE ROUTES
// ==========================================
// 6A. Email ke zariye subscriber delete karein (/ ya /delete)
router.delete(['/', '/delete'], async (req, res) => {
  try {
    const email = req.query.email || req.body.email;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required to delete subscriber.' });
    }

    const deleted = await Subscriber.findOneAndDelete({ email: email.trim().toLowerCase() });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }

    res.status(200).json({
      success: true,
      message: `Subscriber ${email} deleted successfully.`,
      deletedSubscriber: deleted
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 7. PARAMETRIZED ROUTES (/:id) - MongoDB ID ke Zariye
// ==========================================

// 7A. GET: ID ke zariye subscriber fetch karein
router.get('/:id', async (req, res) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
    res.status(200).json({ success: true, subscriber });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid subscriber ID.' });
  }
});

// 7B. PUT: ID ke zariye subscriber update karein
router.put('/:id', async (req, res) => {
  try {
    const updated = await Subscriber.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Subscriber updated successfully.',
      subscriber: updated
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Invalid subscriber ID.' });
  }
});

// 7C. PATCH: ID ke zariye partial update karein
router.patch('/:id', async (req, res) => {
  try {
    const updated = await Subscriber.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Subscriber patched successfully.',
      subscriber: updated
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message || 'Invalid subscriber ID.' });
  }
});

// 7D. DELETE: ID ke zariye subscriber delete karein
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Subscriber.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    }
    res.status(200).json({
      success: true,
      message: 'Subscriber deleted successfully.',
      deletedSubscriber: deleted
    });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Invalid subscriber ID.' });
  }
});

// 7E. OPTIONS: ID ke liye allowed methods
router.options('/:id', (req, res) => {
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    allowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

module.exports = router;