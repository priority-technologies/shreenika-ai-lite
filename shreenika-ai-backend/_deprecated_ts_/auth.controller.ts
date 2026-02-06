import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/user.model';
import { signToken } from '../utils/jwt';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { sendEmail } from '../services/email.service';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ================= REGISTER ================= */
export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Weak password' });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ message: 'User already exists' });
  }

  const hashed = await bcrypt.hash(password, 10);

  const verifyToken = crypto.randomBytes(32).toString('hex');

  const user = await User.create({
    email,
    password: hashed,
    accountId: `acc_${Date.now()}`,
    emailVerificationToken: verifyToken,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await sendEmail(
    user.email,
    'Verify your email',
    `<a href="${process.env.FRONTEND_URL}/verify/${verifyToken}">Verify Email</a>`
  );

  res.json({ message: 'Registration successful. Verify email.' });
};

/* ================= LOGIN ================= */
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user || !user.password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken({
    userId: user._id,
    accountId: user.accountId,
    role: user.role,
  });

  res.json({ token, user });
};

/* ================= GOOGLE LOGIN ================= */
export const googleLogin = async (req: Request, res: Response) => {
  const { token } = req.body;

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    return res.status(401).json({ message: 'Google auth failed' });
  }

  let user = await User.findOne({ email: payload.email });

  if (!user) {
    user = await User.create({
      email: payload.email,
      googleId: payload.sub,
      accountId: `acc_${Date.now()}`,
      emailVerified: true,
    });
  }

  const jwtToken = signToken({
    userId: user._id,
    accountId: user.accountId,
    role: user.role,
  });

  res.json({ token: jwtToken, user });
};

/* ================= FORGOT PASSWORD ================= */
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.json({ message: 'If exists, email sent' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');

  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  await sendEmail(
    email,
    'Reset Password',
    `<a href="${process.env.FRONTEND_URL}/reset/${resetToken}">Reset Password</a>`
  );

  res.json({ message: 'Reset link sent' });
};

/* ================= RESET PASSWORD ================= */
export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({ message: 'Weak password' });
  }

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired token' });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();
  res.json({ message: 'Password updated' });
};

/* ================= VERIFY EMAIL ================= */
export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.params;

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired link' });
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;

  await user.save();
  res.json({ message: 'Email verified' });
};
