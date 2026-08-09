import nodemailer from 'nodemailer';

import { SITE_NAME, SITE_URL } from '@/shared/seo';

/** Escape untrusted text before interpolating into an HTML email template. */
function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escape untrusted text for use inside an href="..." attribute. */
function escapeHtmlAttr(value: string): string {
  return escapeHtml(value);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'mail.voreva.in',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_EMAIL || 'noreply@mystockvision.com',
    pass: process.env.SMTP_PASSWORD || '',
  },
});

export async function sendOtpEmail(email: string, otp: string, userName: string) {
  try {
    const safeUserName = escapeHtml(userName);
    const safeOtp = escapeHtml(otp);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .otp-box { background: white; border: 2px solid #667eea; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
            .footer { color: #999; font-size: 12px; margin-top: 20px; text-align: center; }
            .warning { color: #e74c3c; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${SITE_NAME}</h1>
              <p>Password Reset Request</p>
            </div>
            <div class="content">
              <p>Hi ${safeUserName},</p>
              <p>We received a request to reset your password. Use the OTP below to verify your identity and create a new password.</p>

              <div class="otp-box">
                <p>Your OTP is:</p>
                <div class="otp-code">${safeOtp}</div>
                <p style="color: #999; margin: 10px 0 0 0;">Valid for 10 minutes</p>
              </div>

              <p><span class="warning">⚠️ Important:</span></p>
              <ul>
                <li>Never share this OTP with anyone</li>
                <li>This OTP will expire in 10 minutes</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>

              <p>If you have any issues, contact our support team.</p>

              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL || 'noreply@mystockvision.com',
      to: email,
      subject: `Password Reset OTP - ${SITE_NAME}`,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}

export type TriggeredAlertEmailItem = {
  symbol: string;
  condition: 'above' | 'below';
  targetPrice: number;
  triggeredPrice: number;
  note?: string | null;
};

const inrFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatInr(value: number): string {
  return Number.isFinite(value) ? `Rs ${inrFormatter.format(value)}` : '--';
}

/**
 * Notify a user that one or more price alerts fired.
 *
 * Sent as a single digest rather than one mail per alert: a broad market move
 * can trip a dozen alerts in the same sweep, and twelve separate emails is how
 * a useful notification turns into something the user filters to spam.
 *
 * Every interpolated value is escaped even though symbols and prices are
 * server-derived — `note` is free text the user typed, and it reaches this
 * template unchanged.
 */
export async function sendPriceAlertEmail(
  email: string,
  userName: string,
  alerts: TriggeredAlertEmailItem[]
) {
  if (alerts.length === 0) return false;

  try {
    const safeUserName = escapeHtml(userName);
    const alertsUrl = `${SITE_URL}/alerts`;

    const rows = alerts
      .map((alert) => {
        const safeSymbol = escapeHtml(alert.symbol);
        const direction = alert.condition === 'above' ? 'rose above' : 'fell below';
        const color = alert.condition === 'above' ? '#16a34a' : '#dc2626';
        const safeNote = alert.note ? escapeHtml(alert.note) : '';
        return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #eee;">
              <div style="font-size:15px;font-weight:bold;">${safeSymbol}</div>
              <div style="font-size:13px;color:#555;">
                ${direction} your target of ${escapeHtml(formatInr(alert.targetPrice))}
              </div>
              ${safeNote ? `<div style="font-size:12px;color:#888;font-style:italic;">${safeNote}</div>` : ''}
            </td>
            <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;">
              <div style="font-size:15px;font-weight:bold;color:${color};">
                ${escapeHtml(formatInr(alert.triggeredPrice))}
              </div>
              <div style="font-size:11px;color:#999;">at trigger</div>
            </td>
          </tr>`;
      })
      .join('');

    const heading =
      alerts.length === 1
        ? '1 price alert triggered'
        : `${alerts.length} price alerts triggered`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .button { background: #f59e0b; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; display: inline-block; margin: 20px 0; }
            .footer { color: #999; font-size: 12px; margin-top: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${SITE_NAME}</h1>
              <p>${escapeHtml(heading)}</p>
            </div>
            <div class="content">
              <p>Hi ${safeUserName},</p>
              <p>The following price ${alerts.length === 1 ? 'target has' : 'targets have'} been reached:</p>

              <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                ${rows}
              </table>

              <a href="${escapeHtmlAttr(alertsUrl)}" class="button">View all alerts</a>

              <p style="font-size:12px;color:#777;">
                Prices are sourced from public market data and may be delayed. This is an
                automated notification, not investment advice.
              </p>

              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL || 'noreply@mystockvision.com',
      to: email,
      subject: `${heading} - ${SITE_NAME}`,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error('Price alert email error:', error);
    return false;
  }
}

export async function sendWelcomeEmail(email: string, userName: string, verificationLink: string) {
  try {
    const safeUserName = escapeHtml(userName);
    // Only allow http(s) links through to the href — blocks javascript:/data:
    // URIs, then HTML/attribute-escape what's left before interpolating.
    const safeVerificationLink = /^https?:\/\//i.test(verificationLink)
      ? escapeHtmlAttr(verificationLink)
      : '#';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
            .button { background: #667eea; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; display: inline-block; margin: 20px 0; }
            .footer { color: #999; font-size: 12px; margin-top: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ${SITE_NAME}!</h1>
            </div>
            <div class="content">
              <p>Hi ${safeUserName},</p>
              <p>Thank you for signing up! We're excited to have you on board.</p>

              <p>Click the button below to verify your email address:</p>
              <a href="${safeVerificationLink}" class="button">Verify Email</a>

              <p>Or copy this link: <br>${safeVerificationLink}</p>

              <p>Once verified, you can start exploring stocks, building portfolios, and getting AI-powered insights!</p>

              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_EMAIL || 'noreply@mystockvision.com',
      to: email,
      subject: `Welcome to ${SITE_NAME} - Verify Your Email`,
      html: htmlContent,
    });

    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
}
