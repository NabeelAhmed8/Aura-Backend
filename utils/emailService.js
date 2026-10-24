const dns = require('dns');
if (dns.setDefaultResultOrder) {
  // Prevent IPv6 connection delays on cloud containers
  dns.setDefaultResultOrder('ipv4first');
}

const nodemailer = require('nodemailer');

let cachedTransporter = null;

// Helper to create & pool transport for local or direct SMTP
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

  // Default to port 465 SSL, fallback to 587 if configured
  const smtpPort = parseInt(process.env.EMAIL_PORT || '465', 10);
  const isSecure = smtpPort === 465;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: isSecure,
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
 * Dispatch an email via Brevo REST API (HTTPS port 443 - 100% works on Railway & cloud)
 */
const sendViaBrevo = async (toEmail, recipientName, subject, htmlContent, textContent) => {
  const apiKey = process.env.BREVO_API_KEY.trim();
  const senderEmail = (process.env.EMAIL_USER || process.env.BREVO_SENDER || 'no-reply@auraclothing.com').trim();
  const senderName = process.env.EMAIL_SENDER_NAME || 'AURA Luxury';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail.trim(), name: recipientName }],
      subject: subject,
      htmlContent: htmlContent,
      textContent: textContent
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Brevo API HTTP ${response.status}`);
  }
  return { provider: 'brevo', messageId: data.messageId || 'brevo-sent' };
};

/**
 * Dispatch an email via Resend REST API (HTTPS port 443)
 */
const sendViaResend = async (toEmail, recipientName, subject, htmlContent, textContent) => {
  const apiKey = process.env.RESEND_API_KEY.trim();
  const from = process.env.RESEND_FROM || `AURA Luxury <onboarding@resend.dev>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [toEmail.trim()],
      subject: subject,
      html: htmlContent,
      text: textContent
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Resend API HTTP ${response.status}`);
  }
  return { provider: 'resend', messageId: data.id || 'resend-sent' };
};

/**
 * Master dispatcher: selects Brevo, Resend, or Nodemailer SMTP
 */
const dispatchEmail = async ({ toEmail, recipientName, subject, htmlContent, textContent }) => {
  // 1. Try Brevo API if key is present (Best for cloud containers like Railway)
  if (process.env.BREVO_API_KEY && process.env.BREVO_API_KEY.trim()) {
    return await sendViaBrevo(toEmail, recipientName, subject, htmlContent, textContent);
  }

  // 2. Try Resend API if key is present
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return await sendViaResend(toEmail, recipientName, subject, htmlContent, textContent);
  }

  // 3. Fallback to Nodemailer SMTP (Gmail App Password)
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Email credentials not configured. Please set EMAIL_USER/EMAIL_PASS, BREVO_API_KEY, or RESEND_API_KEY.');
  }

  const fromAddress = (process.env.EMAIL_USER || 'no-reply@auraclothing.com').trim();
  const info = await transporter.sendMail({
    from: `"AURA Luxury" <${fromAddress}>`,
    to: toEmail.trim(),
    subject: subject,
    text: textContent,
    html: htmlContent,
  });

  return { provider: 'smtp', messageId: info.messageId };
};

/**
 * Send a 100% real OTP verification code to the user via email
 * @param {string} toEmail 
 * @param {string} userName 
 * @param {string} otpCode 
 * @param {'signup'|'login'} type
 */
const sendOtpEmail = async (toEmail, userName, otpCode, type = 'signup') => {
  // Always log OTP prominently in console (helpful for server logs on Railway/local debugging)
  console.log(`\n======================================================`);
  console.log(`🔐 [AURA OTP CODE] Recipient: ${toEmail} | Code: ${otpCode} | Type: ${type}`);
  console.log(`======================================================\n`);

  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const isLogin = type === 'login';

  const emailSubject = isLogin 
    ? `Your AURA Sign-In Code: ${otpCode}` 
    : `Your AURA Verification Code: ${otpCode}`;

  const heading = isLogin ? 'Sign-In Verification Code' : 'Verify Your Email Address';
  const bodyText = isLogin 
    ? 'A sign-in request was initiated for your AURA account. Please use the 6-digit code below to complete your login:'
    : 'Welcome to AURA. Please enter the 6-digit verification code below to activate your account:';

  const textContent = `Hello ${recipientName},\n\n${bodyText}\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code will expire in 15 minutes.\n\nThank you,\nAURA Studio`;

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

  try {
    const result = await dispatchEmail({
      toEmail,
      recipientName,
      subject: emailSubject,
      htmlContent,
      textContent
    });

    console.log(`✅ [Email Service] OTP successfully dispatched to ${toEmail} via ${result.provider} (ID: ${result.messageId})`);
    return {
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      otpCode
    };
  } catch (err) {
    console.error(`❌ [Email Service] Error sending OTP email to ${toEmail}:`, err.message);
    return {
      success: false,
      error: err.message,
      otpCode
    };
  }
};

/**
 * Send an email verification link (Click to verify & login)
 */
const sendVerificationEmail = async (toEmail, userName, verificationLink, type = 'signup') => {
  // Always log link prominently in console (helpful for server logs)
  console.log(`\n======================================================`);
  console.log(`🔗 [AURA VERIFICATION LINK] Recipient: ${toEmail} | Link: ${verificationLink} | Type: ${type}`);
  console.log(`======================================================\n`);

  const recipientName = (userName && userName.trim()) || 'Valued Member';
  const isLogin = type === 'login';

  const emailSubject = isLogin ? 'Verify Your AURA Sign In' : 'Activate Your AURA Account';
  const heading = isLogin ? 'Sign-In Verification' : 'Verify Your Email Address';
  const bodyText = isLogin 
    ? 'A sign-in request was initiated for your AURA account. Please click the button below to verify your email and securely log in to your account:'
    : 'Welcome to AURA. Please verify your email address to activate your account and complete your registration:';
  const buttonText = isLogin ? 'Verify & Sign In' : 'Activate Account & Log In';

  const textContent = `Hello ${recipientName},\n\n${bodyText}\n\nVerification Link: ${verificationLink}\n\nThis link is valid for 24 hours.\n\nThank you,\nAURA Studio`;

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
          max-width: 560px;
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
          padding: 36px 20px;
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
          padding: 40px 36px;
          line-height: 1.6;
        }
        .content h2 {
          font-size: 18px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 0;
          color: #0a0a0a;
        }
        .content p {
          font-size: 14px;
          color: #404040;
          margin: 16px 0;
        }
        .btn-box {
          text-align: center;
          margin: 36px 0;
        }
        .btn {
          display: inline-block;
          background-color: #0a0a0a;
          color: #ffffff !important;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 16px 36px;
          border-radius: 2px;
        }
        .link-fallback {
          background-color: #f9f9f8;
          border: 1px solid #eeeeed;
          padding: 12px 16px;
          border-radius: 4px;
          word-break: break-all;
          font-size: 12px;
          color: #555555;
          margin-top: 24px;
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
          padding: 24px;
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

          <div class="btn-box">
            <a href="${verificationLink}" target="_blank" class="btn">${buttonText}</a>
          </div>

          <p style="font-size: 12px; color: #737373; margin-bottom: 6px;">
            If the button above does not work, click or copy this direct link:
          </p>
          <div class="link-fallback">
            <a href="${verificationLink}" style="color: #0a0a0a; text-decoration: underline;">${verificationLink}</a>
          </div>

          <p class="note">
            <strong>Security Notice:</strong> This link is valid for <strong>24 hours</strong>. If you did not request this verification, you can safely ignore this email.
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
      recipientName,
      subject: emailSubject,
      htmlContent,
      textContent
    });

    console.log(`✅ [Email Service] Verification link dispatched to ${toEmail} via ${result.provider} (ID: ${result.messageId})`);
    return {
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      verificationLink
    };
  } catch (err) {
    console.error(`❌ [Email Service] Error dispatching verification link to ${toEmail}:`, err.message);
    return {
      success: false,
      error: err.message,
      verificationLink
    };
  }
};

/**
 * Diagnostic tool to verify live email credentials & dispatch test email
 */
const testEmailConfig = async (toEmail) => {
  const brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  const activeProvider = brevoKey ? 'brevo' : resendKey ? 'resend' : (emailUser && emailPass ? 'smtp' : 'none');

  if (activeProvider === 'none') {
    return {
      configured: false,
      activeProvider: 'none',
      error: 'No email service configured. Please provide BREVO_API_KEY (recommended for Railway) or EMAIL_USER/EMAIL_PASS.',
      hasBrevo: false,
      hasResend: false,
      hasSmtp: false
    };
  }

  try {
    let sendResult = null;
    if (toEmail) {
      const result = await dispatchEmail({
        toEmail: toEmail.trim(),
        recipientName: 'Test Recipient',
        subject: 'AURA Verification Test Email',
        textContent: 'This is a test email from AURA Clothing Brand to verify live email delivery.',
        htmlContent: '<p>This is a test email from <strong>AURA Clothing Brand</strong> to verify live delivery.</p>'
      });
      sendResult = result;
    } else if (activeProvider === 'brevo') {
      const accRes = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': brevoKey.trim(), 'accept': 'application/json' }
      });
      if (!accRes.ok) {
        const accData = await accRes.json().catch(() => ({}));
        throw new Error(accData.message || `Invalid Brevo API Key (${accRes.status})`);
      }
    } else if (activeProvider === 'smtp') {
      const transporter = createTransporter();
      await transporter.verify();
    }

    return {
      configured: true,
      verified: true,
      activeProvider,
      emailUser: emailUser ? `${emailUser.slice(0, 3)}***@${emailUser.split('@')[1] || ''}` : undefined,
      railwayNotice: activeProvider === 'smtp' 
        ? 'NOTE: Standard SMTP (ports 465/587) works locally but is blocked by Railway network firewall. Add BREVO_API_KEY in Railway Variables for seamless cloud delivery.'
        : 'Active cloud HTTP provider configured.',
      sendResult
    };
  } catch (err) {
    return {
      configured: true,
      verified: false,
      activeProvider,
      error: err.message,
      code: err.code,
      cloudHint: err.code === 'ETIMEDOUT' 
        ? 'Railway network blocks SMTP ports 465 & 587. Please add BREVO_API_KEY (free at brevo.com) in Railway Variables.'
        : undefined
    };
  }
};

module.exports = {
  sendOtpEmail,
  sendVerificationEmail,
  testEmailConfig,
  createTransporter,
  dispatchEmail
};
