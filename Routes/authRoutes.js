const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/Users');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'aura_super_secure_jwt_secret_key_2026';
const SALT_ROUNDS = 10; // Bcrypt salt rounds (quantity: 10)

// Helper: Password length check (kam az kam 6 characters)
const validatePasswordLength = (password) => {
  return password && typeof password === 'string' && password.trim().length >= 6;
};

// Helper: 1 Din (1 day) ke liye JWT Token generate karein
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '1d' } // 1 day expiry
  );
};

// Helper: Cookie options (1 din ke liye valid, secure & httpOnly)
const getCookieOptions = () => ({
  httpOnly: true, // XSS attack protection (Frontend JavaScript isay read nahi kar sakti)
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000 // 1 din (24 hours in milliseconds)
});

// Helper: Cookie clear options
const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
});

// Helper to format sanitized user object (passwords chupa kar safe data return karne ke liye)
const formatUser = (user) => {
  let dobStr = '';
  if (user.dateOfBirth) {
    try {
      dobStr = user.dateOfBirth instanceof Date 
        ? user.dateOfBirth.toISOString().split('T')[0] 
        : String(user.dateOfBirth).split('T')[0];
    } catch {
      dobStr = String(user.dateOfBirth);
    }
  }

  const fName = user.firstName || (user.name ? user.name.split(' ')[0] : '');
  const lName = user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : '');

  return {
    _id: user._id,
    id: user._id,
    email: user.email,
    firstName: fName,
    lastName: lName,
    name: user.name || `${fName} ${lName}`.trim(),
    phone: user.phone || '',
    dateOfBirth: dobStr,
    gender: user.gender || '',
    addresses: user.addresses || [],
    paymentMethods: user.paymentMethods || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// ==========================================
// 1. OPTIONS ROUTE (Allowed HTTP Methods check karne ke liye)
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
// 2A. Saare users aur total count fetch karein
router.get(['/', '/all-users'], async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const users = await User.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      totalUsers,
      users: users.map(formatUser)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2B. Single user fetch karein email se (/user-profile?email=...)
router.get('/user-profile', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      user: formatUser(user),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2C. Verify JWT Token & Get Current User (/verify-token)
router.get('/verify-token', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies && req.cookies.token;
    let token = null;

    if (cookieToken) {
      token = cookieToken;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: "Access token missing in Cookies or Authorization header!" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    res.status(200).json({
      success: true,
      message: "Token is valid!",
      user: formatUser(user)
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Token expired or invalid: " + err.message });
  }
});

// ==========================================
// 3. POST ROUTES
// ==========================================
// 3A. SIGNUP ROUTE (Naya account register karein - Bcrypt Hash + 1 Day Token)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, phone, dateOfBirth, gender } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required!" });
    }

    // Password quantity / length check (kam az kam 10 characters)
    if (!validatePasswordLength(password)) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 10 characters long! (Password kam az kam 10 characters ka hona chahiye)" 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "User already exists with this email!" });
    }

    // Bcrypt Password Hashing (Salt Rounds: 10)
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const fName = (firstName || (name ? name.split(' ')[0] : '')).trim();
    const lName = (lastName || (name ? name.split(' ').slice(1).join(' ') : '')).trim();

    let parsedDob;
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        parsedDob = parsed;
      }
    }

    const newUser = new User({
      email: normalizedEmail,
      password: hashedPassword, // Hashed password database mein save hoga
      firstName: fName,
      lastName: lName,
      phone: (phone || '').trim(),
      dateOfBirth: parsedDob,
      gender: gender || ''
    });
    await newUser.save();

    // 1 Din ke liye JWT Token
    const token = generateToken(newUser);
    
    // Cookie mein token store karein (1 day expiry)
    res.cookie('token', token, getCookieOptions());

    res.status(201).json({ 
      success: true,
      message: "User registered successfully!", 
      token,
      expiresIn: "1d",
      user: formatUser(newUser)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3B. LOGIN ROUTE (Bcrypt Compare + 1 Din Expire Token + Cookie Set)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required!" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, error: "Invalid email or password!" });
    }

    let isMatch = false;

    // Check karein kya database mein password bcrypt hash hai ($2a$, $2b$, $2y$)
    if (user.password && user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // Agar pehle se database mein plain text password tha:
      isMatch = (user.password === password);
      if (isMatch) {
        // Auto-hash and save so password gets secured right now:
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Invalid email or password!" });
    }

    // 1 Day Expiry JWT Token Generate Karein
    const token = generateToken(user);

    // Cookie mein token store karein (1 day expiry)
    res.cookie('token', token, getCookieOptions());

    res.status(200).json({ 
      success: true,
      message: "Login successful!", 
      token,
      expiresIn: "1d",
      user: formatUser(user)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3C. CREATE USER (Admin ya Postman se complete user add karein - Bcrypt Hash + Token)
router.post(['/', '/create-user'], async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required!" });
    }

    // Password quantity / length check (kam az kam 10 characters)
    if (!validatePasswordLength(password)) {
      return res.status(400).json({ 
        success: false, 
        error: "Password must be at least 10 characters long! (Password kam az kam 10 characters ka hona chahiye)" 
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "User already exists with this email!" });
    }

    // Bcrypt Hash (Salt Rounds: 10)
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      ...req.body,
      email: normalizedEmail,
      password: hashedPassword
    });
    await newUser.save();

    const token = generateToken(newUser);

    // Cookie mein token store karein
    res.cookie('token', token, getCookieOptions());

    res.status(201).json({
      success: true,
      message: "User created successfully!",
      token,
      expiresIn: "1d",
      user: formatUser(newUser)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3D. LOGOUT ROUTE (Cookies clear karne ke liye - GET ya POST dono se kaam karega)
router.all(['/logout', '/signout'], (req, res) => {
  try {
    const clearOpts = getClearCookieOptions();

    // Cookies clear karein
    res.clearCookie('token', clearOpts);
    res.clearCookie('authToken', clearOpts);
    res.clearCookie('user', clearOpts);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully! Cookies have been cleared."
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3E. CHANGE PASSWORD ROUTE (Verify current password & hash new password)
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: "Email, current password, and new password are required." });
    }

    if (!validatePasswordLength(newPassword)) {
      return res.status(400).json({ success: false, error: "New password must be at least 6 characters long." });
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User account not found." });
    }

    let isMatch = false;
    if (user.password && user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(currentPassword, user.password);
    } else {
      isMatch = (user.password === currentPassword);
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Current password does not match our records." });
    }

    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully in database!"
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, error: err.message || "Failed to change password." });
  }
});


// ==========================================
// 4. PUT ROUTES (Full / Model field updates)
// ==========================================
// 4A. Email ke zariye user profile update karein
router.put(['/', '/update-user'], async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, gender, addresses, paymentMethods } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required to update profile" });
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (password) {
      if (!validatePasswordLength(password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters long!" });
      }
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      user.password = await bcrypt.hash(password, salt);
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (gender !== undefined) user.gender = gender;
    if (addresses !== undefined) user.addresses = addresses;
    if (paymentMethods !== undefined) user.paymentMethods = paymentMethods;

    await user.save();

    res.status(200).json({
      success: true,
      message: "User profile updated successfully!",
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. PATCH ROUTES (Partial updates - sirf specific fields update karne ke liye)
// ==========================================
// 5A. Email se partial update karein
router.patch(['/', '/update-user'], async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required to patch user" });
    }

    const updateData = { ...req.body };

    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 10 characters long!" });
      }
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${email.trim()}$`, 'i') } },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "User updated partially (PATCH) successfully!",
      user: formatUser(updatedUser),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. DELETE ROUTES
// ==========================================
// 6A. Email se user delete karein (/delete-user?email=... ya body)
router.delete(['/', '/delete-user'], async (req, res) => {
  try {
    const email = req.query.email || req.body.email;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required to delete user" });
    }

    const deletedUser = await User.findOneAndDelete({
      email: { $regex: new RegExp(`^${email.trim()}$`, 'i') }
    });

    if (!deletedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: `User with email ${email} deleted successfully!`,
      deletedUser: formatUser(deletedUser)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. PARAMETRIZED ROUTES (/:id) - Hamesha Static Routes Ke Baad
// ==========================================

// 7A. GET: ID ke zariye user fetch karein
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.status(200).json({ success: true, user: formatUser(user) });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid user ID" });
  }
});

// 7B. PUT: ID ke zariye user full update karein
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 10 characters long!" });
      }
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.status(200).json({
      success: true,
      message: "User updated successfully!",
      user: formatUser(updatedUser)
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7C. PATCH: ID ke zariye partial update karein
router.patch('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 10 characters long!" });
      }
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.status(200).json({
      success: true,
      message: "User patched successfully!",
      user: formatUser(updatedUser)
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 7D. DELETE: ID ke zariye user delete karein
router.delete('/:id', async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.status(200).json({
      success: true,
      message: "User deleted successfully!",
      deletedUser: formatUser(deletedUser)
    });
  } catch (err) {
    res.status(400).json({ success: false, error: "Invalid user ID" });
  }
});

// 7E. OPTIONS: Specific user ID ke liye allowed options check karein
router.options('/:id', (req, res) => {
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    allowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

module.exports = router;