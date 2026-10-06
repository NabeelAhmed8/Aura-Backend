const express = require('express');
const router = express.Router();
const User = require('../models/Users');

// Helper to format sanitized user object
const formatUser = (user) => ({
  _id: user._id,
  id: user._id,
  email: user.email,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  phone: user.phone || '',
  dateOfBirth: user.dateOfBirth || '',
  gender: user.gender || '',
  addresses: user.addresses || [],
  paymentMethods: user.paymentMethods || [],
});

// 1. SIGNUP ROUTE (Naya account register karne ke liye)
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email!" });
    }

    const newUser = new User({ email, password });
    await newUser.save();
    
    res.status(201).json({ 
      message: "User registered successfully!", 
      user: formatUser(newUser)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. LOGIN ROUTE (Login data verify karne ke liye)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password!" });
    }

    if (user.password !== password) {
      return res.status(400).json({ error: "Invalid email or password!" });
    }

    res.json({ 
      message: "Login successful!", 
      user: formatUser(user)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET USER PROFILE (Fetch latest profile, addresses & payment methods)
router.get('/user-profile', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: formatUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE USER (Update profile, addresses & payment methods in MongoDB)
router.put('/update-user', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, dateOfBirth, gender, addresses, paymentMethods } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required to update profile" });
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (gender !== undefined) user.gender = gender;
    if (addresses !== undefined) user.addresses = addresses;
    if (paymentMethods !== undefined) user.paymentMethods = paymentMethods;

    await user.save();

    res.json({
      success: true,
      message: "User profile updated successfully!",
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;