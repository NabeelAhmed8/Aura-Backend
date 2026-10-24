const dns = require('dns');
if (dns.setDefaultResultOrder) {
  // Prevent 5-10s IPv6 connection timeouts on cloud containers (Railway, Docker)
  dns.setDefaultResultOrder('ipv4first');
}

const nodemailer = require('nodemailer');

let cachedTransporter = null;

// Helper to create & pool transport
const createTransporter = () => {
  const emailUser = process.env.EMAIL_USER;
  let emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  // Strip spaces from Google App Password
  emailPass = String(emailPass).replace(/\s+/g, '');

  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: emailUser.trim(),
      pass: emailPass,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateLimit: 5,
    rateDelta: 1000,
    connectionTimeout: 8000,
    greetingTimeout: 4000,
    socketTimeout: 10000,
    tls: {
      rejectUnauthorized: false
    }
  });

  return cachedTransporter;
};

/**
 * Send a 100% real OTP verification code to the user via email
 * @param {string} toEmail 
 * @param {string} userName 
 * @param {string} otpCode 
 * @param {'signup'|'login'} type
 */
const sendOtpEmail = async (toEmail, userName, otpCode, type = 'signup') => {
  const transporter = createTransporter();

  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const isLogin = type === 'login';

  const emailSubject = isLogin 
    ? `Your AURA Sign-In Code: ${otpCode}` 
    : `Your AURA Verification Code: ${otpCode}`;

  const heading = isLogin ? 'Sign-In Verification Code' : 'Verify Your Email Address';
  const bodyText = isLogin 
    ? 'A sign-in request was initiated for your AURA account. Please use the 6-digit code below to complete your login:'
    : 'Welcome to AURA. Please enter the 6-digit verification code below to activate your account:';

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
          padding: 18px 32px 18px 44px;
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
          <h2>${heading}</h2>
          <p>Hello <strong>${recipientName}</strong>,</p>
          <p>${bodyText}</p>

          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>

          <p class="note">
            <strong>Security Notice:</strong> This 6-digit code will expire in <strong>15 minutes</strong>. For your security, never share this code with anyone.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AURA Clothing Brand. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  if (!transporter) {
    console.error('❌ [EMAIL NOT SENT]: EMAIL_USER or EMAIL_PASS missing in environment variables!');
    return {
      success: false,
      error: 'Email configuration missing on server',
      otpCode
    };
  }

  try {
    const fromAddress = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
    const info = await transporter.sendMail({
      from: `"AURA Luxury" <${fromAddress}>`,
      to: toEmail,
      subject: emailSubject,
      text: `Hello ${recipientName},\n\n${bodyText}\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code will expire in 15 minutes.\n\nThank you,\nAURA Studio`,
      html: htmlContent,
    });

    console.log(`✅ [Nodemailer] OTP Email delivered to ${toEmail} (ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      otpCode
    };
  } catch (err) {
    console.error('❌ [Nodemailer] Error sending OTP email to', toEmail, ':', err.message);
    return {
      success: false,
      error: err.message,
      otpCode
    };
  }
};

/**
 * Backward compatibility: Send an email verification link
 */
const sendVerificationEmail = async (toEmail, userName, verificationLink, type = 'signup') => {
  const transporter = createTransporter();
  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const isLogin = type === 'login';

  const emailSubject = isLogin ? 'Verify Your AURA Sign In' : 'Verify Your AURA Account';
  const heading = isLogin ? 'Sign In Verification' : 'Verify Your Email Address';
  const bodyText = isLogin 
    ? 'A sign in attempt was made for your account. Please click the button below to verify and log in to your account.'
    : 'Welcome to AURA. Please verify your email address to activate your account and complete your sign in.';
  const buttonText = isLogin ? 'Verify & Sign In' : 'Verify Account & Login';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${emailSubject}</title>
    </head>
    <body style="font-family: sans-serif; background: #f7f7f6; padding: 20px;">
      <div style="max-width: 540px; margin: 0 auto; background: #fff; padding: 30px; border: 1px solid #eee;">
        <h2>${heading}</h2>
        <p>Hello ${recipientName},</p>
        <p>${bodyText}</p>
        <p><a href="${verificationLink}" style="background:#000; color:#fff; padding:12px 24px; text-decoration:none; display:inline-block;">${buttonText}</a></p>
      </div>
    </body>
    </html>
  `;

  if (!transporter) return { success: false, error: 'Email configuration missing', verificationLink };

  try {
    const fromAddress = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
    const info = await transporter.sendMail({
      from: `"AURA Luxury" <${fromAddress}>`,
      to: toEmail,
      subject: emailSubject,
      text: `${bodyText}\n\nLink: ${verificationLink}`,
      html: htmlContent,
    });
    return { success: true, messageId: info.messageId, verificationLink };
  } catch (err) {
    console.error('Nodemailer Error:', err.message);
    return { success: false, error: err.message, verificationLink };
  }
};

/**
 * Diagnostic tool to verify live email credentials & dispatch test email
 */
const testEmailConfig = async (toEmail) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return {
      configured: false,
      error: 'EMAIL_USER or EMAIL_PASS environment variable is missing on server',
      hasEmailUser: !!emailUser,
      hasEmailPass: !!emailPass
    };
  }

  const transporter = createTransporter();
  try {
    await transporter.verify();

    let sendResult = null;
    if (toEmail) {
      const fromAddress = emailUser.trim();
      const info = await transporter.sendMail({
        from: `"AURA Luxury" <${fromAddress}>`,
        to: toEmail.trim(),
        subject: 'AURA Verification Test Email',
        text: 'This is a test email from AURA Clothing Brand to verify live email delivery.',
      });
      sendResult = { messageId: info.messageId, to: toEmail };
    }

    return {
      configured: true,
      verified: true,
      emailUser: `${emailUser.slice(0, 3)}***@${emailUser.split('@')[1] || ''}`,
      sendResult
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      error: err.message,
      code: err.code
    };
  }
};

module.exports = {
  sendOtpEmail,
  sendVerificationEmail,
  testEmailConfig,
  createTransporter,
};
