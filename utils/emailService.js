const nodemailer = require('nodemailer');

// Helper to create transport
const createTransporter = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    return null;
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
};

/**
 * Send an email verification link to the user
 * @param {string} toEmail 
 * @param {string} userName 
 * @param {string} verificationLink 
 * @param {'signup'|'login'} type
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
          font-size: 18px;
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
        .btn-wrapper {
          text-align: center;
          margin: 32px 0;
        }
        .verify-btn {
          display: inline-block;
          background-color: #0a0a0a;
          color: #ffffff !important;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 16px 36px;
          border-radius: 2px;
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
          <p>Hello ${recipientName},</p>
          <p>${bodyText}</p>
          
          <div class="btn-wrapper">
            <a href="${verificationLink}" target="_blank" class="verify-btn">${buttonText}</a>
          </div>

          <p class="note">
            <strong>Security Notice:</strong> This verification link will expire in 24 hours. If you did not make this request with AURA, please disregard this email.
          </p>

          <p style="font-size: 12px; color: #737373; word-break: break-all; margin-top: 20px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${verificationLink}" style="color: #0a0a0a;">${verificationLink}</a>
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AURA Clothing Brand. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;

  // Always log to console for development / backup visibility
  console.log('\n============================================================');
  console.log(`📧 [EMAIL VERIFICATION DISPATCHED (${isLogin ? 'LOGIN' : 'SIGNUP'})]`);
  console.log(`To: ${toEmail}`);
  console.log(`Verification URL: ${verificationLink}`);
  if (!transporter) {
    console.log('⚠️ Notice: EMAIL_USER / EMAIL_PASS not set in .env. Email link printed above for testing.');
  }
  console.log('============================================================\n');

  if (!transporter) {
    return {
      success: true,
      simulated: true,
      message: 'Email credentials not provided in .env; verification link logged to console.',
      verificationLink
    };
  }

  try {
    const info = await transporter.sendMail({
      from: `"AURA Luxury" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: emailSubject,
      text: `Hello ${recipientName},\n\n${bodyText}\n\nClick the link below:\n${verificationLink}\n\nThis link will expire in 24 hours.\n\nThank you,\nAURA Studio`,
      html: htmlContent,
    });

    return {
      success: true,
      messageId: info.messageId,
      verificationLink
    };
  } catch (err) {
    console.error('❌ Nodemailer Error sending verification email:', err.message);
    // Don't crash auth if email fails, return simulated so user can still see link in console
    return {
      success: false,
      error: err.message,
      verificationLink
    };
  }
};

module.exports = {
  sendVerificationEmail,
};
