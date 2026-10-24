const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/Users');
const {
  sendSignupVerificationEmail,
  sendLoginOtpEmail,
  testEmailConfig
} = require('../utils/emailService');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'aura_super_secure_jwt_secret_key_2026';
const SALT_ROUNDS = 10;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';

// Helper: Password length validation (minimum 6 characters)
const validatePasswordLength = (password) => {
  return password && typeof password === 'string' && password.trim().length >= 6;
};

// Helper: 6-Digit random OTP generator
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper: 1 Day JWT Token generation
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '1d' }
  );
};

// Helper: Cookie options
const getCookieOptions = () => ({
  httpOnly: true,
  secure: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RAILWAY_STATIC_URL)),
  sameSite: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RAILWAY_STATIC_URL)) ? 'none' : 'lax',
  maxAge: 24 * 60 * 60 * 1000 // 1 day
});

// Helper: Cookie clear options
const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RAILWAY_STATIC_URL)),
  sameSite: (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || Boolean(process.env.RAILWAY_ENVIRONMENT) || Boolean(process.env.RAILWAY_STATIC_URL)) ? 'none' : 'lax'
});

// Helper to format sanitized user object
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
    isVerified: !!user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// ==========================================
// 1. OPTIONS ROUTE
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

// 2A. Get all users and count
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

// 2B. Single user profile by email
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

// 2C. Verify JWT Token & Get Current User
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

// 2D. Check Email Registration Status
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });

    return res.status(200).json({
      success: true,
      isRegistered: !!user,
      exists: !!user,
      isVerified: !!user?.isVerified,
      email: normalizedEmail,
      firstName: user?.firstName || '',
    });
  } catch (err) {
    console.error('Check email error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2E. Verify Email by Token (Resend Clickable Link Handler)
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${FRONTEND_URL}/#/verify-email?status=failed&message=Verification+token+missing`);
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.redirect(`${FRONTEND_URL}/#/verify-email?status=failed&message=Verification+link+is+invalid+or+has+expired`);
    }

    // Mark as verified & clear verification tokens
    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpires = null;
    user.verificationOtp = null;
    user.verificationOtpExpires = null;
    await user.save();

    // Redirect to login page with verified=true parameter
    const redirectUrl = `${FRONTEND_URL}/#/login?verified=true&email=${encodeURIComponent(user.email)}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('Verify email link route error:', err);
    return res.redirect(`${FRONTEND_URL}/#/verify-email?status=failed&message=${encodeURIComponent(err.message)}`);
  }
});

// 2F. Diagnostic Route: Check Resend API key & connectivity
router.get('/email-status', async (req, res) => {
  try {
    const { to } = req.query;
    const result = await testEmailConfig(to);
    return res.status(result.configured && result.verified ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. POST ROUTES
// ==========================================

// 3A. SIGNUP ROUTE (Register new user with Resend email verification code & link)
router.post('/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, phone, dateOfBirth, gender } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required!" });
    }

    if (!validatePasswordLength(password)) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long!"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const fName = (firstName || (name ? name.split(' ')[0] : '')).trim();
    const lName = (lastName || (name ? name.split(' ').slice(1).join(' ') : '')).trim();

    let parsedDob;
    if (dateOfBirth) {
      const parsed = new Date(dateOfBirth);
      if (!isNaN(parsed.getTime())) {
        parsedDob = parsed;
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    // Generate 6-Digit OTP & 32-Byte Verification Token
    const verificationOtp = generateOtp();
    const verificationOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${verificationToken}`;

    if (existingUser) {
      // If already verified, ask to sign in
      if (existingUser.isVerified) {
        return res.status(400).json({
          success: false,
          error: "An account already exists with this email. Please sign in instead."
        });
      }

      // If user exists but is not verified yet, update password/details and re-send code
      const salt = await bcrypt.genSalt(SALT_ROUNDS);
      existingUser.password = await bcrypt.hash(password, salt);
      if (fName) existingUser.firstName = fName;
      if (lName) existingUser.lastName = lName;
      if (phone) existingUser.phone = phone.trim();
      if (parsedDob) existingUser.dateOfBirth = parsedDob;
      if (gender) existingUser.gender = gender;

      existingUser.verificationOtp = verificationOtp;
      existingUser.verificationOtpExpires = verificationOtpExpires;
      existingUser.verificationToken = verificationToken;
      existingUser.verificationTokenExpires = verificationTokenExpires;
      await existingUser.save();

      // Dispatch verification email via Resend
      await sendSignupVerificationEmail(
        existingUser.email,
        `${existingUser.firstName || fName} ${existingUser.lastName || lName}`.trim(),
        verificationOtp,
        verificationLink
      );

      return res.status(200).json({
        success: true,
        requiresVerification: true,
        verificationRequired: true,
        verificationType: 'otp_and_link',
        message: "Account already registered but not yet verified. A fresh verification code and link have been sent to your email via Resend.",
        email: existingUser.email,
        user: formatUser(existingUser),
        devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? verificationOtp : undefined
      });
    }

    // New User registration
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      email: normalizedEmail,
      password: hashedPassword,
      firstName: fName,
      lastName: lName,
      phone: (phone || '').trim(),
      dateOfBirth: parsedDob,
      gender: gender || '',
      isVerified: false,
      verificationOtp,
      verificationOtpExpires,
      verificationToken,
      verificationTokenExpires,
    });
    await newUser.save();

    // Dispatch verification email via Resend
    await sendSignupVerificationEmail(
      newUser.email,
      `${fName} ${lName}`.trim(),
      verificationOtp,
      verificationLink
    );

    res.status(201).json({
      success: true,
      requiresVerification: true,
      verificationRequired: true,
      verificationType: 'otp_and_link',
      message: "Account created successfully! A 6-digit verification code and link have been sent to your email via Resend. Please verify your email before logging in.",
      email: newUser.email,
      user: formatUser(newUser),
      devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? verificationOtp : undefined
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3B. LOGIN ROUTE (Validate credentials, check isVerified, send 6-digit Login OTP via Resend)
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
    if (user.password && user.password.startsWith('$2')) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = (user.password === password);
      if (isMatch) {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
      }
    }

    if (!isMatch) {
      return res.status(400).json({ success: false, error: "Invalid email or password!" });
    }

    // Step 1: Ensure user is verified. Unverified users cannot login!
    if (!user.isVerified) {
      const verificationOtp = generateOtp();
      const verificationOtpExpires = new Date(Date.now() + 15 * 60 * 1000);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${verificationToken}`;

      user.verificationOtp = verificationOtp;
      user.verificationOtpExpires = verificationOtpExpires;
      user.verificationToken = verificationToken;
      user.verificationTokenExpires = verificationTokenExpires;
      await user.save();

      await sendSignupVerificationEmail(
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        verificationOtp,
        verificationLink
      );

      return res.status(403).json({
        success: false,
        requiresVerification: true,
        verificationRequired: true,
        message: "Your email address is not verified yet. We have sent a verification code to your email via Resend. Please verify your email before logging in.",
        email: user.email,
        devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? verificationOtp : undefined
      });
    }

    // Step 2: User is verified. Generate 6-digit Login OTP and send via Resend!
    const loginOtp = generateOtp();
    const loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    user.loginOtp = loginOtp;
    user.loginOtpExpires = loginOtpExpires;
    await user.save();

    // Dispatch Login 2FA OTP via Resend
    await sendLoginOtpEmail(
      user.email,
      `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      loginOtp
    );

    return res.status(200).json({
      success: true,
      requiresLoginOtp: true,
      requiresOtp: true,
      email: user.email,
      message: "A 6-digit sign-in code has been sent to your email via Resend. Please enter the code to complete your login.",
      devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? loginOtp : undefined
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3C. VERIFY LOGIN OTP ROUTE (Completes login after user enters 6-digit code received via Resend)
router.post('/verify-login-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: "Email and 6-digit code are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, error: "No account found with this email." });
    }

    if (!user.loginOtp || user.loginOtp !== cleanOtp) {
      return res.status(400).json({ success: false, error: "Invalid sign-in code. Please check your email and try again." });
    }

    if (!user.loginOtpExpires || new Date(user.loginOtpExpires).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: "This sign-in code has expired. Please request a new code." });
    }

    // Code is valid! Clear login OTP
    user.loginOtp = null;
    user.loginOtpExpires = null;
    await user.save();

    // Generate JWT Token & Set Cookie
    const token = generateToken(user);
    res.cookie('token', token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful! Welcome back.",
      token,
      user: formatUser(user)
    });
  } catch (err) {
    console.error('Verify login OTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3D. UNIVERSAL VERIFY OTP ROUTE (Handles both Login OTP and Signup Email Verification OTP)
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, type } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: "Email and 6-digit code are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, error: "No account found with this email address." });
    }

    const isLoginOtpMatch = user.loginOtp && user.loginOtp === cleanOtp;
    const isLoginOtpActive = isLoginOtpMatch && user.loginOtpExpires && new Date(user.loginOtpExpires).getTime() >= Date.now();

    const isVerificationOtpMatch = (user.verificationOtp && user.verificationOtp === cleanOtp) || (user.verificationToken && user.verificationToken === cleanOtp);
    const isVerificationOtpActive = isVerificationOtpMatch && user.verificationOtpExpires && new Date(user.verificationOtpExpires).getTime() >= Date.now();

    // 1. If Login OTP was provided and is valid
    if (isLoginOtpActive && type !== 'signup') {
      user.loginOtp = null;
      user.loginOtpExpires = null;
      await user.save();

      const jwtToken = generateToken(user);
      res.cookie('token', jwtToken, getCookieOptions());

      return res.status(200).json({
        success: true,
        type: 'login',
        message: "Login successful! Welcome back to AURA.",
        token: jwtToken,
        user: formatUser(user)
      });
    }

    // 2. If Signup Email Verification OTP was provided and is valid
    if (isVerificationOtpActive) {
      user.isVerified = true;
      user.verificationOtp = null;
      user.verificationOtpExpires = null;
      user.verificationToken = null;
      user.verificationTokenExpires = null;
      await user.save();

      return res.status(200).json({
        success: true,
        type: 'signup_verified',
        isVerified: true,
        message: "Account verified successfully! You can now log in with your password.",
        user: formatUser(user)
      });
    }

    // Check for expiration
    if (isLoginOtpMatch && !isLoginOtpActive) {
      return res.status(400).json({ success: false, error: "This sign-in code has expired. Please request a new one." });
    }
    if (isVerificationOtpMatch && !isVerificationOtpActive) {
      return res.status(400).json({ success: false, error: "This verification code has expired. Please request a new one." });
    }

    return res.status(400).json({
      success: false,
      error: "Invalid code. Please check your email and enter the latest 6-digit code sent via Resend."
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3E. RESEND OTP / VERIFICATION CODE ROUTE (Supports both Login 2FA OTP and Signup Verification via Resend)
router.post(['/resend-otp', '/resend-verification'], async (req, res) => {
  try {
    const { email, type } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required!" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: "No account found with this email address." });
    }

    // If type is explicitly 'login' or user is already verified and didn't ask for signup
    if (type === 'login' || (user.isVerified && type !== 'signup')) {
      const loginOtp = generateOtp();
      user.loginOtp = loginOtp;
      user.loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendLoginOtpEmail(
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        loginOtp
      );

      return res.status(200).json({
        success: true,
        type: 'login',
        message: "A fresh 6-digit sign-in code has been sent to your email via Resend.",
        devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? loginOtp : undefined
      });
    }

    // Otherwise, resend signup verification OTP & Link
    const verificationOtp = generateOtp();
    const verificationOtpExpires = new Date(Date.now() + 15 * 60 * 1000);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${verificationToken}`;

    user.verificationOtp = verificationOtp;
    user.verificationOtpExpires = verificationOtpExpires;
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = verificationTokenExpires;
    await user.save();

    await sendSignupVerificationEmail(
      user.email,
      `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      verificationOtp,
      verificationLink
    );

    return res.status(200).json({
      success: true,
      type: 'signup',
      message: "A fresh verification code and link have been sent to your email via Resend.",
      devOtp: (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_OTP === 'true') ? verificationOtp : undefined
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3F. CREATE USER (Admin or direct API user creation)
router.post(['/', '/create-user'], async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required!" });
    }

    if (!validatePasswordLength(password)) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters long!"
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "User already exists with this email!" });
    }

    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      ...req.body,
      email: normalizedEmail,
      password: hashedPassword,
      isVerified: true // Admin created users are pre-verified
    });
    await newUser.save();

    const token = generateToken(newUser);
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

// 3G. LOGOUT ROUTE (Clears authentication cookies)
router.all(['/logout', '/signout'], (req, res) => {
  try {
    const clearOpts = getClearCookieOptions();
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

// 3H. CHANGE PASSWORD ROUTE
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
// 4. PUT ROUTES (Full updates)
// ==========================================
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
// 5. PATCH ROUTES (Partial updates)
// ==========================================
router.patch(['/', '/update-user'], async (req, res) => {
  try {
    const email = req.body.email || req.query.email;
    if (!email) {
      return res.status(400).json({ success: false, error: "Email is required to patch user" });
    }

    const updateData = { ...req.body };

    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters long!" });
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
// 7. PARAMETRIZED ROUTES (/:id)
// ==========================================
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

router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters long!" });
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

router.patch('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (updateData.password) {
      if (!validatePasswordLength(updateData.password)) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters long!" });
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

router.options('/:id', (req, res) => {
  res.setHeader('Allow', 'GET, PUT, PATCH, DELETE, OPTIONS');
  res.status(200).json({
    success: true,
    allowedMethods: ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
});

module.exports = router;
