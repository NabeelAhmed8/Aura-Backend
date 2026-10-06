const express = require('express');
const router = express.Router();

// Agar Models ka folder capital hai toh '../Models/Contact' likhein, 
// agar small hai toh '../models/Contact' likhein (Linux/Mac/Node mein case-sensitive hota hai)
const Contact = require('../models/Contact'); // 👈 Path check karein

// POST: Nayi inquiry create karna
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, orderNumber, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and message are required fields.' 
      });
    }

    const newInquiry = new Contact({
      name,
      email,
      subject: subject || 'General Inquiry',
      orderNumber: orderNumber || '',
      message,
    });

    const savedInquiry = await newInquiry.save();
    return res.status(201).json({ success: true, data: savedInquiry });
  } catch (error) {
    console.error('Detailed Contact Error:', error);
    // error.message bhej rahe hain taake agar abhi bhi koi issue ho toh exact pata chal sake
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET: All inquiries
router.get('/', async (req, res) => {
  try {
    const inquiries = await Contact.find().sort({ createdAt: -1 });
    return res.json(inquiries);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;