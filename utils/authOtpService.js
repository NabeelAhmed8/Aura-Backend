const crypto = require('crypto');
const { sendSignupVerificationEmail, sendLoginOtpEmail } = require('./emailService');

/**
 * Generate cryptographically secure numeric OTP
 * @param {number} length Default 6
 * @returns {string}
 */
const generateOtp = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max + 1).toString();
};

/**
 * Prepare Signup OTP, Verification Token & Link with Expirations
 * @param {string} backendUrl Base backend URL for the verification link
 * @returns {object}
 */
const createSignupVerificationData = (backendUrl = '') => {
  const verificationOtp = generateOtp(6);
  const verificationOtpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  const cleanBase = (backendUrl || '').replace(/\/+$/, '');
  const verificationLink = `${cleanBase}/api/auth/verify-email?token=${verificationToken}`;

  return {
    verificationOtp,
    verificationOtpExpires,
    verificationToken,
    verificationTokenExpires,
    verificationLink
  };
};

/**
 * Prepare Login 2FA OTP with Expiration
 * @returns {object}
 */
const createLoginOtpData = () => {
  const loginOtp = generateOtp(6);
  const loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  return {
    loginOtp,
    loginOtpExpires
  };
};

/**
 * Dispatch Signup Verification Email Asynchronously (Non-blocking)
 * Prevents HTTP request from waiting 5-10 seconds on SMTP network roundtrip
 * @param {object} params { email, name, otp, link }
 */
const dispatchSignupVerificationAsync = ({ email, name, otp, link }) => {
  // Fire-and-forget in background with proper error catching
  setImmediate(() => {
    sendSignupVerificationEmail(email, name, otp, link)
      .then((result) => {
        if (!result.success) {
          console.warn(`⚠️ [Background Email] Signup OTP email notice for ${email}:`, result.warning || result.error);
        }
      })
      .catch((err) => {
        console.error(`❌ [Background Email] Failed sending signup verification to ${email}:`, err.message);
      });
  });
};

/**
 * Dispatch Login 2FA OTP Email Asynchronously (Non-blocking)
 * Prevents HTTP request from waiting on SMTP network roundtrip
 * @param {object} params { email, name, otp }
 */
const dispatchLoginOtpAsync = ({ email, name, otp }) => {
  // Fire-and-forget in background with proper error catching
  setImmediate(() => {
    sendLoginOtpEmail(email, name, otp)
      .then((result) => {
        if (!result.success) {
          console.warn(`⚠️ [Background Email] Login OTP email notice for ${email}:`, result.warning || result.error);
        }
      })
      .catch((err) => {
        console.error(`❌ [Background Email] Failed sending login OTP to ${email}:`, err.message);
      });
  });
};

module.exports = {
  generateOtp,
  createSignupVerificationData,
  createLoginOtpData,
  dispatchSignupVerificationAsync,
  dispatchLoginOtpAsync
};
