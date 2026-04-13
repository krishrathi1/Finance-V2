import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

def send_verification_email(email: str, token: str):
    """
    Sends a verification email to the user.
    """
    settings = get_settings()
    
    # Verification link
    verification_link = f"{settings.frontend_url}/verify-email?token={token}"
    
    # Create message
    message = MIMEMultipart("alternative")
    message["Subject"] = "Verify your email - Stock Vision"
    message["From"] = f"Stock Vision <{settings.smtp_email}>"
    message["To"] = email
    
    # Text version
    text = f"Welcome to Stock Vision! Please verify your email by clicking the link below:\n\n{verification_link}"
    
    # HTML version (a bit more premium)
    html = f"""
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #4F46E5;">Welcome to Stock Vision!</h2>
          <p>Thank you for signing up. Please verify your email address to get started.</p>
          <div style="margin: 30px 0;">
            <a href="{verification_link}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          <p style="font-size: 0.8em; color: #666;">
            If the button above doesn't work, copy and paste this link into your browser:<br>
            <a href="{verification_link}">{verification_link}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 0.8em; color: #999;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      </body>
    </html>
    """
    
    part1 = MIMEText(text, "plain")
    part2 = MIMEText(html, "html")
    message.attach(part1)
    message.attach(part2)
    
    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_email, settings.smtp_password)
            server.sendmail(settings.smtp_email, email, message.as_string())
        logger.info(f"Verification email sent to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email to {email}: {e}")
        return False
