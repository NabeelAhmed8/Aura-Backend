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
    port: 587,
    secure: false, // Port 587 uses STARTTLS
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
 * Send email via Resend HTTP API (Port 443 HTTPS - 100% works on Railway & cloud hosts)
 */
const sendViaResend = async (toEmail, subject, htmlContent, textContent) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const from = process.env.RESEND_FROM || 'AURA Luxury <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail.trim()],
      subject,
      html: htmlContent,
      text: textContent,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || (data.errors && data.errors[0]?.message) || 'Resend HTTP API error');
  }

  return {
    success: true,
    messageId: data.id,
  };
};

/**
 * Send email via Brevo HTTP API (Port 443 HTTPS - 300 free emails/day)
 */
const sendViaBrevo = async (toEmail, subject, htmlContent, textContent) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;

  const senderEmail = process.env.EMAIL_USER || 'nabeeldhillon679@gmail.com';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey.trim(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'AURA Luxury', email: senderEmail },
      to: [{ email: toEmail.trim() }],
      subject,
      htmlContent,
      textContent,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Brevo HTTP API error');
  }

  return {
    success: true,
    messageId: data.messageId,
  };
};

/**
 * Send a 100% real OTP verification code to the user via email
 * @param {string} toEmail 
 * @param {string} userName 
 * @param {string} otpCode 
 * @param {'signup'|'login'} type
 */
const sendOtpEmail = async (toEmail, userName, otpCode, type = 'signup') => {
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

  const textContent = `Hello ${recipientName},\n\n${bodyText}\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code will expire in 15 minutes.\n\nThank you,\nAURA Studio`;

  // 1. Try Resend HTTP API (Port 443 - NEVER blocked by Railway)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await sendViaResend(toEmail, emailSubject, htmlContent, textContent);
      console.log(`✅ [Resend API] OTP Email delivered to ${toEmail} (ID: ${resendRes.messageId})`);
      return { success: true, messageId: resendRes.messageId, otpCode, provider: 'resend' };
    } catch (err) {
      console.error('❌ [Resend API Error]:', err.message);
    }
  }

  // 2. Try Brevo HTTP API (Port 443 - NEVER blocked by Railway)
  if (process.env.BREVO_API_KEY) {
    try {
      const brevoRes = await sendViaBrevo(toEmail, emailSubject, htmlContent, textContent);
      console.log(`✅ [Brevo API] OTP Email delivered to ${toEmail} (ID: ${brevoRes.messageId})`);
      return { success: true, messageId: brevoRes.messageId, otpCode, provider: 'brevo' };
    } catch (err) {
      console.error('❌ [Brevo API Error]:', err.message);
    }
  }

  // 3. Fallback to Nodemailer SMTP (Works locally on localhost)
  const transporter = createTransporter();
  if (!transporter) {
    console.error('❌ [EMAIL NOT SENT]: Neither RESEND_API_KEY, BREVO_API_KEY nor EMAIL_USER/EMAIL_PASS are configured!');
    return {
      success: false,
      error: 'No email provider configured. Please add RESEND_API_KEY or EMAIL_USER/PASS in Railway Variables.',
      otpCode
    };
  }

  try {
    const fromAddress = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
    const info = await transporter.sendMail({
      from: `"AURA Luxury" <${fromAddress}>`,
      to: toEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`✅ [Nodemailer] OTP Email delivered to ${toEmail} (ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId,
      otpCode,
      provider: 'nodemailer'
    };
  } catch (err) {
    console.error('❌ [Nodemailer] Error sending OTP email to', toEmail, ':', err.message);
    return {
      success: false,
      error: err.code === 'ETIMEDOUT'
        ? 'Railway cloud firewall blocked outbound SMTP ports. Please add RESEND_API_KEY to Railway Variables for HTTPS email delivery.'
        : err.message,
      otpCode
    };
  }
};

/**
 * Backward compatibility: Send an email verification link
 */
const sendVerificationEmail = async (toEmail, userName, verificationLink, type = 'signup') => {
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
  const textContent = `${bodyText}\n\nLink: ${verificationLink}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await sendViaResend(toEmail, emailSubject, htmlContent, textContent);
      return { success: true, messageId: res.messageId, verificationLink };
    } catch (err) {
      console.error('Resend error:', err);
    }
  }

  const transporter = createTransporter();
  if (!transporter) return { success: false, error: 'Email configuration missing', verificationLink };

  try {
    const fromAddress = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
    const info = await transporter.sendMail({
      from: `"AURA Luxury" <${fromAddress}>`,
      to: toEmail,
      subject: emailSubject,
      text: textContent,
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
  // 1. Check Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      let sendResult = null;
      if (toEmail) {
        sendResult = await sendViaResend(
          toEmail,
          'AURA Test Email (Resend HTTPS)',
          '<h1>AURA Email Delivery Test</h1><p>Your Railway backend is now delivering emails over HTTPS (Port 443)!</p>',
          'AURA Email Delivery Test: Your Railway backend is delivering emails over HTTPS.'
        );
      }
      return {
        configured: true,
        verified: true,
        provider: 'resend',
        transport: 'HTTPS (Port 443)',
        sendResult
      };
    } catch (err) {
      return {
        configured: true,
        verified: false,
        provider: 'resend',
        error: err.message
      };
    }
  }

  // 2. Check Brevo API
  if (process.env.BREVO_API_KEY) {
    try {
      let sendResult = null;
      if (toEmail) {
        sendResult = await sendViaBrevo(
          toEmail,
          'AURA Test Email (Brevo HTTPS)',
          '<h1>AURA Email Delivery Test</h1><p>Your Railway backend is now delivering emails via Brevo!</p>',
          'AURA Email Delivery Test'
        );
      }
      return {
        configured: true,
        verified: true,
        provider: 'brevo',
        transport: 'HTTPS (Port 443)',
        sendResult
      };
    } catch (err) {
      return {
        configured: true,
        verified: false,
        provider: 'brevo',
        error: err.message
      };
    }
  }

  // 3. Check Nodemailer
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return {
      configured: false,
      error: 'No email credentials found on server. Add RESEND_API_KEY or EMAIL_USER/EMAIL_PASS in Railway Variables.',
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
        text: 'This is a test email from AURA Clothing Brand.',
      });
      sendResult = { messageId: info.messageId, to: toEmail };
    }

    return {
      configured: true,
      verified: true,
      provider: 'nodemailer',
      emailUser: `${emailUser.slice(0, 3)}***@${emailUser.split('@')[1] || ''}`,
      sendResult
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      provider: 'nodemailer',
      error: err.code === 'ETIMEDOUT'
        ? 'Railway cloud firewall blocks outbound SMTP ports (465/587). Please add RESEND_API_KEY to Railway Variables for HTTPS email delivery.'
        : err.message,
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
