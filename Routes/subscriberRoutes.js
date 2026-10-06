const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber'); // Folder capitalization check karein

// POST: Naya subscriber add karne ke liye
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

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
      });
    }

    const newSubscriber = new Subscriber({ email: cleanEmail });
    const saved = await newSubscriber.save();

    return res.status(201).json({
      success: true,
      message: 'Subscribed successfully.',
      data: saved,
    });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
});

// GET: Sab subscribers ki list dekhne ke liye (Admin verification)
router.get('/', async (req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, count: subscribers.length, subscribers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;