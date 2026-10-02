import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'UniIntern <onboarding@resend.dev>';

export const sendOTPEmail = async (email: string, otp: string): Promise<void> => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'Your UniIntern Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #1a2b4a; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎓 UniIntern</h1>
        </div>
        
        <h2 style="color: #1a2b4a;">Verify Your Email Address</h2>
        <p style="color: #6b7280;">Thank you for joining UniIntern. Use the verification code below to complete your registration.</p>
        
        <div style="background-color: #f0f2f5; border-radius: 10px; padding: 30px; text-align: center; margin: 20px 0;">
          <p style="color: #6b7280; margin: 0 0 10px;">Your verification code is:</p>
          <h1 style="color: #1a2b4a; font-size: 48px; letter-spacing: 10px; margin: 0;">${otp}</h1>
          <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0;">This code expires in 10 minutes</p>
        </div>
        
        <p style="color: #6b7280; font-size: 12px;">If you did not create an account with UniIntern, please ignore this email.</p>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 20px; padding-top: 20px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px;">© 2024 UniIntern Application Tracking System</p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  resetToken: string,
  frontendUrl: string,
) => {
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  await resend.emails.send({
    from: 'UniIntern <noreply@uniintern.com>',
    to: email,
    subject: 'Reset Your UniIntern Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2b4a; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0;">UniIntern</h1>
        </div>
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1a2b4a;">Reset Your Password</h2>
          <p style="color: #666;">You requested a password reset. Click the button below to set a new password.</p>
          <a href="${resetUrl}" 
             style="display: inline-block; background: #00c896; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 20px 0;">
            Reset Password
          </a>
          <p style="color: #999; font-size: 12px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color: #999; font-size: 12px;">Or copy this link: ${resetUrl}</p>
        </div>
      </div>
    `,
  });
};
