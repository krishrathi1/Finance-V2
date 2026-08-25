/**
 * Reusable HTML email templates for the platform.
 * Pure functions that return HTML strings so they can be previewed
 * (see /email-preview) and sent via the SMTP transporter in lib/email.ts.
 */

import { SITE_NAME } from "@/shared/seo";

// Derived from SITE_NAME rather than hardcoded: these templates previously said
// "Financial Forensics AI" — a name the site no longer uses anywhere in its UI —
// so the first thing every new signup saw was a verification email for a
// product that appeared unrelated to the one they had just signed up for.
const BRAND = SITE_NAME;
const YEAR = 2026;

function shell(title: string, headerSubtitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .wrapper { padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.15); overflow: hidden; }
    .header { background: linear-gradient(135deg, #4F46E5 0%, #667eea 100%); padding: 36px 30px; text-align: center; color: #fff; }
    .header h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.95; }
    .content { padding: 36px 30px; color: #1f2937; line-height: 1.6; font-size: 15px; }
    .button-container { text-align: center; margin: 32px 0; }
    .button { display: inline-block; background: linear-gradient(135deg, #4F46E5 0%, #667eea 100%); color: #fff !important; padding: 14px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(79,70,229,0.3); }
    .panel { background: #f3f4f6; border-left: 4px solid #4F46E5; padding: 16px; border-radius: 8px; margin: 24px 0; font-size: 14px; color: #374151; }
    .backup-link { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 12px; word-break: break-all; }
    .backup-link a { color: #4F46E5; text-decoration: none; }
    .footer { background: #f9fafb; padding: 20px 30px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>🔍 ${BRAND}</h1>
        <p>${headerSubtitle}</p>
      </div>
      <div class="content">${body}</div>
      <div class="footer">© ${YEAR} ${BRAND}. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`;
}

export function getWelcomeEmailTemplate(userName: string, verificationLink?: string): string {
  const cta = verificationLink
    ? `<div class="button-container"><a href="${verificationLink}" class="button">Verify Email Address</a></div>
       <div class="backup-link">Or paste this link in your browser:<br><a href="${verificationLink}">${verificationLink}</a></div>`
    : "";
  return shell(
    `Welcome to ${BRAND}`,
    "Welcome aboard",
    `<p>Hey ${userName}! 👋</p>
     <p>Welcome to <strong>${BRAND}</strong> — your intelligent financial analysis companion. We're thrilled to have you on board.</p>
     <div class="panel">🎉 To unlock all features and start analyzing your investments, verify your email address below.</div>
     ${cta}
     <p style="font-size:13px;color:#6b7280;">Build and track portfolios, get AI-powered insights, analyze market trends, and receive premium alerts.</p>`
  );
}

export function getPremiumUpgradeTemplate(userName: string, premiumLink: string): string {
  return shell(
    `${BRAND} Premium`,
    "Your premium access",
    `<p>Hi ${userName},</p>
     <p>Great news — your account has been upgraded to <strong>Premium</strong>! You now have access to advanced screeners, AI research reports, and priority data refresh.</p>
     <div class="button-container"><a href="${premiumLink}" class="button">Explore Premium Features</a></div>
     <div class="panel">Premium unlocks deeper financial statements, brokerage research, and unlimited AI analysis.</div>
     <div class="backup-link">Or paste this link in your browser:<br><a href="${premiumLink}">${premiumLink}</a></div>`
  );
}

export function getPasswordResetTemplate(userName: string, resetLink: string): string {
  return shell(
    "Reset your password",
    "Password reset request",
    `<p>Hi ${userName},</p>
     <p>We received a request to reset your password. Click the button below to choose a new one.</p>
     <div class="button-container"><a href="${resetLink}" class="button">Reset Password</a></div>
     <div class="panel">⚠️ This link expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email — your password will not change.</div>
     <div class="backup-link">Or paste this link in your browser:<br><a href="${resetLink}">${resetLink}</a></div>`
  );
}
