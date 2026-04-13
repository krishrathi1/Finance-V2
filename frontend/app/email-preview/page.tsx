'use client';

import { useState } from 'react';
import { getWelcomeEmailTemplate, getPremiumUpgradeTemplate, getPasswordResetTemplate } from '@/lib/backend/services/email-templates';

export default function EmailPreviewPage() {
  const [selectedEmail, setSelectedEmail] = useState<'verification' | 'welcome' | 'premium' | 'reset'>('verification');

  const getVerificationEmailHtml = () => {
    const frontendUrl = 'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`;

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email - Financial Forensics AI</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }
        .wrapper {
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #4F46E5 0%, #667eea 100%);
          padding: 40px 30px;
          text-align: center;
          color: white;
        }
        .header-icon {
          font-size: 48px;
          margin-bottom: 15px;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header p {
          margin: 8px 0 0 0;
          font-size: 14px;
          opacity: 0.95;
          font-weight: 500;
        }
        .content {
          padding: 40px 30px;
        }
        .greeting {
          font-size: 16px;
          color: #1f2937;
          margin: 0 0 20px 0;
          line-height: 1.6;
        }
        .greeting strong {
          color: #4F46E5;
        }
        .message {
          background: #f3f4f6;
          border-left: 4px solid #4F46E5;
          padding: 15px;
          border-radius: 8px;
          margin: 25px 0;
          font-size: 14px;
          color: #374151;
          line-height: 1.6;
        }
        .button-container {
          text-align: center;
          margin: 35px 0;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #4F46E5 0%, #667eea 100%);
          color: white;
          padding: 14px 40px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
          border: none;
          cursor: pointer;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 25px rgba(79, 70, 229, 0.4);
        }
        .footer-text {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.6;
          margin: 25px 0 0 0;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }
        .footer-text strong {
          color: #374151;
        }
        .footer-text a {
          color: #4F46E5;
          text-decoration: none;
        }
        .footer-text a:hover {
          text-decoration: underline;
        }
        .backup-link {
          background: #f9fafb;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 12px;
          word-break: break-all;
        }
        .backup-link strong {
          display: block;
          color: #374151;
          margin-bottom: 8px;
        }
        .backup-link a {
          color: #4F46E5;
          text-decoration: none;
        }
        .features {
          background: #f3f4f6;
          padding: 20px;
          border-radius: 8px;
          margin: 25px 0;
          font-size: 13px;
          color: #4b5563;
        }
        .features h3 {
          margin: 0 0 12px 0;
          color: #1f2937;
          font-size: 14px;
        }
        .features ul {
          margin: 0;
          padding-left: 20px;
          list-style: none;
        }
        .features li {
          margin: 8px 0;
          padding-left: 20px;
          position: relative;
        }
        .features li:before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #4F46E5;
          font-weight: bold;
        }
        .bottom-footer {
          background: #f9fafb;
          padding: 20px 30px;
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
          border-top: 1px solid #e5e7eb;
        }
        .bottom-footer a {
          color: #4F46E5;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="container">
          <div class="header">
            <div class="header-icon">🔍</div>
            <h1>Financial Forensics AI</h1>
            <p>Verify Your Email Address</p>
          </div>

          <div class="content">
            <p class="greeting">
              Hey there! 👋
            </p>
            <p class="greeting">
              Welcome to <strong>Financial Forensics AI</strong> – your intelligent financial analysis companion. We're thrilled to have you on board!
            </p>

            <div class="message">
              🎉 To unlock all features and start analyzing your investments, please verify your email address below.
            </div>

            <div class="button-container">
              <a href="${verificationLink}" class="button">Verify Email Address</a>
            </div>

            <div class="features">
              <h3>What You Can Do:</h3>
              <ul>
                <li>Build and track your investment portfolio</li>
                <li>Get AI-powered financial insights</li>
                <li>Analyze market trends with advanced tools</li>
                <li>Receive premium alerts and recommendations</li>
              </ul>
            </div>

            <div class="backup-link">
              <strong>Didn't click the button?</strong>
              Copy and paste this link in your browser:
              <br><br>
              <a href="${verificationLink}">${verificationLink}</a>
            </div>

            <div class="footer-text">
              <strong>Why verify?</strong> Email verification keeps your account secure and ensures you receive important updates about your portfolio and exclusive features.
              <br><br>
              <strong>Didn't create this account?</strong> If you didn't sign up for Financial Forensics AI, please disregard this email. Your email address will not be activated without your verification.
              <br><br>
              This verification link expires in <strong>24 hours</strong> for your security.
            </div>
          </div>

          <div class="bottom-footer">
            <p style="margin: 0;">
              © 2026 Financial Forensics AI. All rights reserved.<br>
              <a href="#">Privacy Policy</a> • <a href="#">Terms of Service</a> • <a href="#">Contact Support</a>
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
  };

  const emailOptions = {
    verification: {
      name: 'Email Verification',
      html: getVerificationEmailHtml(),
    },
    welcome: {
      name: 'Welcome Email',
      html: getWelcomeEmailTemplate('John Doe'),
    },
    premium: {
      name: 'Premium Upgrade',
      html: getPremiumUpgradeTemplate('John Doe', 'https://financial-forensics-ai-india.onrender.com/premium'),
    },
    reset: {
      name: 'Password Reset',
      html: getPasswordResetTemplate('John Doe', 'https://financial-forensics-ai-india.onrender.com/reset-password?token=xyz123'),
    },
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ color: '#1f2937', marginBottom: '30px' }}>Email Template Preview</h1>

        {/* Selector */}
        <div style={{ marginBottom: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {(Object.keys(emailOptions) as Array<keyof typeof emailOptions>).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedEmail(key)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: selectedEmail === key ? '600' : '500',
                backgroundColor: selectedEmail === key ? '#4F46E5' : '#e5e7eb',
                color: selectedEmail === key ? 'white' : '#1f2937',
                transition: 'all 0.3s ease',
              }}
            >
              {emailOptions[key].name}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
          }}
        >
          <iframe
            srcDoc={emailOptions[selectedEmail].html}
            style={{
              width: '100%',
              height: '800px',
              border: 'none',
              display: 'block',
            }}
            title="Email Preview"
          />
        </div>

        <p style={{ color: '#6b7280', marginTop: '20px', fontSize: '14px' }}>
          💡 These emails are automatically sent to users. Customize them by editing{' '}
          <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>
            /lib/backend/services/email-templates.ts
          </code>
        </p>
      </div>
    </div>
  );
}
