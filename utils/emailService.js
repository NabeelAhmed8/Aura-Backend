const dns = require('dns');
if (dns.setDefaultResultOrder) {
  // Prevent IPv6 timeout delays on cloud containers
  dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config();
const nodemailer = require('nodemailer');

let cachedTransporter = null;

/**
 * Create or reuse pooled Nodemailer transporter
 */
const createTransporter = () => {
  const emailUser = process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '';
  let emailPass = process.env.EMAIL_PASS ? String(process.env.EMAIL_PASS).trim() : '';

  if (!emailUser || !emailPass) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  // Strip spaces from Google App Password (e.g. "fckq aehq jlho ervb" -> "fckqaehqjlhoervb")
  emailPass = emailPass.replace(/\s+/g, '');

  const smtpHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.EMAIL_PORT || '465', 10);
  const isSecure = smtpPort === 465 || process.env.EMAIL_SECURE === 'true';

  cachedTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: isSecure,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5,
    rateDelta: 1000,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 12000,
    tls: {
      rejectUnauthorized: false
    }
  });

  return cachedTransporter;
};

/**
 * Dispatch an email via Nodemailer
 */
const dispatchEmail = async ({ toEmail, subject, htmlContent, textContent }) => {
  const transporter = createTransporter();

  if (!transporter) {
    const errorMsg = 'Nodemailer credentials not configured. Please set EMAIL_USER and EMAIL_PASS in your .env file.';
    console.warn(`⚠️ [Email Service] ${errorMsg}`);
    return {
      success: false,
      provider: 'nodemailer',
      warning: errorMsg,
      simulated: true
    };
  }

  const senderEmail = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
  const senderName = process.env.EMAIL_SENDER_NAME || 'AURA Luxury';
  const fromAddress = `"${senderName}" <${senderEmail}>`;

  const info = await transporter.sendMail({
    from: fromAddress,
    to: toEmail.trim(),
    subject,
    text: textContent,
    html: htmlContent,
  });

  console.log(`✅ [Email Service] Email successfully sent to ${toEmail} via Nodemailer. ID: ${info.messageId}`);
  return {
    success: true,
    provider: 'nodemailer',
    messageId: info.messageId
  };
};

/**
 * Send Signup Email Verification (Includes both 6-Digit OTP & One-Click Verification Link)
 */
const sendSignupVerificationEmail = async (toEmail, userName, otpCode, verificationLink) => {
  console.log(`\n======================================================`);
  console.log(`📧 [AURA SIGNUP VERIFICATION EMAIL]`);
  console.log(`👤 Recipient: ${toEmail}`);
  console.log(`🔐 OTP Code:  ${otpCode}`);
  if (verificationLink) console.log(`🔗 Link:      ${verificationLink}`);
  console.log(`======================================================\n`);

  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const emailSubject = `Your AURA Verification Code: ${otpCode}`;

  const textContent = `Hello ${recipientName},\n\nWelcome to AURA. Please verify your email address to activate your account.\n\nYour 6-Digit Verification Code: ${otpCode}\n(Expires in 15 minutes)\n\nOr click the link below to verify your account directly:\n${verificationLink}\n\nThank you,\nAURA Studio`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${emailSubject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f7f7f6;
          margin: 0;
          padding: 0;
          color: #171717;
        }
        .container {
          max-width: 540px;
          margin: 40px auto;
          background: #ffffff;
          border: 1px solid #e5e5e5;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }
        .header {
          background-color: #0a0a0a;
          color: #ffffff;
          text-align: center;
          padding: 32px 20px;
          letter-spacing: 0.25em;
        }
        .header h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .header p {
          margin: 6px 0 0 0;
          font-size: 11px;
          color: #a3a3a3;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .content {
          padding: 36px 32px;
          line-height: 1.6;
        }
        .content h2 {
          font-size: 16px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 0;
          color: #0a0a0a;
        }
        .content p {
          font-size: 14px;
          color: #404040;
          margin: 14px 0;
        }
        .otp-box {
          text-align: center;
          margin: 28px 0;
        }
        .otp-code {
          display: inline-block;
          background-color: #0a0a0a;
          color: #ffffff !important;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 12px;
          padding: 16px 32px 16px 44px;
          border-radius: 4px;
          font-family: 'Courier New', Courier, monospace;
          border: 1px solid #262626;
        }
        .btn-box {
          text-align: center;
          margin: 24px 0 20px;
        }
        .btn {
          display: inline-block;
          background-color: #171717;
          color: #ffffff !important;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 14px 30px;
          border-radius: 2px;
        }
        .divider {
          text-align: center;
          margin: 24px 0;
          position: relative;
        }
        .divider span {
          background: #fff;
          padding: 0 12px;
          color: #888;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        .divider::before {
          content: "";
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #eee;
          z-index: -1;
        }
        .note {
          font-size: 12px;
          color: #737373;
          background-color: #f5f5f4;
          padding: 14px 16px;
          border-left: 3px solid #0a0a0a;
          margin-top: 24px;
        }
        .footer {
          border-top: 1px solid #f0f0f0;
          background-color: #fafafa;
          padding: 20px;
          text-align: center;
          font-size: 11px;
          color: #a3a3a3;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AURA</h1>
          <p>Independent Luxury Studio</p>
        </div>
        <div class="content">
          <h2>Verify Your Email Address</h2>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>Welcome to AURA. Please enter the 6-digit verification code below to verify your email and activate your account:</p>

          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>

          ${verificationLink ? `
          <div class="divider"><span>OR CLICK DIRECT LINK</span></div>
          <div class="btn-box">
            <a href="${verificationLink}" target="_blank" class="btn">Activate Account</a>
          </div>
          ` : ''}

          <p class="note">
            <strong>Security Notice:</strong> The verification code is valid for <strong>15 minutes</strong>. If you did not create an account on AURA, you can safely ignore this email.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AURA Clothing Brand. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await dispatchEmail({
      toEmail,
      subject: emailSubject,
      htmlContent,
      textContent
    });

    return {
      success: true,
      provider: 'nodemailer',
      messageId: result.messageId,
      otpCode
    };
  } catch (err) {
    console.error(`❌ [Email Service] Error sending signup email to ${toEmail}:`, err.message);
    return {
      success: false,
      provider: 'nodemailer',
      error: err.message,
      otpCode
    };
  }
};

/**
 * Send Login 2FA OTP Code via Nodemailer
 */
const sendLoginOtpEmail = async (toEmail, userName, otpCode) => {
  console.log(`\n======================================================`);
  console.log(`🔐 [AURA SIGN-IN OTP CODE]`);
  console.log(`👤 Recipient: ${toEmail}`);
  console.log(`🔑 Login Code: ${otpCode}`);
  console.log(`======================================================\n`);

  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const emailSubject = `Your AURA Sign-In Code: ${otpCode}`;

  const textContent = `Hello ${recipientName},\n\nA sign-in request was initiated for your AURA account.\n\nYour 6-Digit Sign-In Code: ${otpCode}\n(Expires in 10 minutes)\n\nIf you did not request this code, please secure your account immediately.\n\nThank you,\nAURA Studio`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${emailSubject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #f7f7f6;
          margin: 0;
          padding: 0;
          color: #171717;
        }
        .container {
          max-width: 540px;
          margin: 40px auto;
          background: #ffffff;
          border: 1px solid #e5e5e5;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03);
        }
        .header {
          background-color: #0a0a0a;
          color: #ffffff;
          text-align: center;
          padding: 32px 20px;
          letter-spacing: 0.25em;
        }
        .header h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .header p {
          margin: 6px 0 0 0;
          font-size: 11px;
          color: #a3a3a3;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .content {
          padding: 36px 32px;
          line-height: 1.6;
        }
        .content h2 {
          font-size: 16px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 0;
          color: #0a0a0a;
        }
        .content p {
          font-size: 14px;
          color: #404040;
          margin: 14px 0;
        }
        .otp-box {
          text-align: center;
          margin: 32px 0;
        }
        .otp-code {
          display: inline-block;
          background-color: #0a0a0a;
          color: #ffffff !important;
          font-size: 32px;
          font-weight: 800;
          letter-spacing: 12px;
          padding: 16px 32px 16px 44px;
          border-radius: 4px;
          font-family: 'Courier New', Courier, monospace;
          border: 1px solid #262626;
        }
        .note {
          font-size: 12px;
          color: #737373;
          background-color: #f5f5f4;
          padding: 14px 16px;
          border-left: 3px solid #0a0a0a;
          margin-top: 24px;
        }
        .footer {
          border-top: 1px solid #f0f0f0;
          background-color: #fafafa;
          padding: 20px;
          text-align: center;
          font-size: 11px;
          color: #a3a3a3;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AURA</h1>
          <p>Independent Luxury Studio</p>
        </div>
        <div class="content">
          <h2>Sign-In Verification Code</h2>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>A sign-in request was initiated for your AURA account. Please enter the 6-digit code below to securely complete your login:</p>

          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>

          <p class="note">
            <strong>Security Notice:</strong> This sign-in code will expire in <strong>10 minutes</strong>. Never share this code with anyone. AURA staff will never ask for your code.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AURA Clothing Brand. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const result = await dispatchEmail({
      toEmail,
      subject: emailSubject,
      htmlContent,
      textContent
    });

    return {
      success: true,
      provider: 'nodemailer',
      messageId: result.messageId,
      otpCode
    };
  } catch (err) {
    console.error(`❌ [Email Service] Error sending login OTP email to ${toEmail}:`, err.message);
    return {
      success: false,
      provider: 'nodemailer',
      error: err.message,
      otpCode
    };
  }
};

/**
 * Diagnostic tool to verify live Nodemailer SMTP configuration & optionally send test email
 */
const testEmailConfig = async (toEmail) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return {
      configured: false,
      activeProvider: 'nodemailer',
      verified: false,
      error: 'EMAIL_USER or EMAIL_PASS missing in environment variables.'
    };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();

    let sendResult = null;
    if (toEmail) {
      sendResult = await dispatchEmail({
        toEmail: toEmail.trim(),
        subject: 'AURA - Nodemailer Test Email',
        textContent: 'This is a test email confirming that Nodemailer is properly configured for AURA Clothing Brand.',
        htmlContent: '<p>This is a test email confirming that <strong>Nodemailer</strong> is properly configured for AURA Clothing Brand.</p>'
      });
    }

    return {
      configured: true,
      verified: true,
      activeProvider: 'nodemailer',
      senderEmail: emailUser,
      sendResult
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      activeProvider: 'nodemailer',
      error: err.message
    };
  }
};

// Aliases for compatibility
const sendOtpEmail = async (toEmail, userName, otpCode, type = 'signup') => {
  if (type === 'login') {
    return await sendLoginOtpEmail(toEmail, userName, otpCode);
  }
  return await sendSignupVerificationEmail(toEmail, userName, otpCode, null);
};

const sendVerificationEmail = async (toEmail, userName, verificationLink, type = 'signup') => {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  return await sendSignupVerificationEmail(toEmail, userName, otpCode, verificationLink);
};

module.exports = {
  sendSignupVerificationEmail,
  sendLoginOtpEmail,
  sendOtpEmail,
  sendVerificationEmail,
  dispatchEmail,
  createTransporter,
  testEmailConfig
};
