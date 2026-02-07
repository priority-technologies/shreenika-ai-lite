import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import User from "./user.model.js";
import Agent from "../agent/agent.model.js";
import Subscription from "../billing/subscription.model.js";
import { sendVerificationEmail, sendMail } from "../../utils/mailer.js";


/* =========================
   REGISTER (EMAIL + PASSWORD)
========================= */
export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");

    // ✅ FOR DEVELOPMENT: Auto-verify localhost emails
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const autoVerify = isDevelopment && email.includes('localhost');

    const user = await User.create({
      email,
      name: name || email.split('@')[0],
      password: hashedPassword,
      role: "user",
      emailVerified: autoVerify || false,
      emailVerificationToken: autoVerify ? undefined : emailVerificationToken,
      isActive: true
    });

    // ✅ CREATE DEFAULT AGENT FOR NEW USER
    console.log(`🤖 Creating default agent for new user: ${user.email}`);

    await Agent.create({
      userId: user._id,
      name: `${user.name}'s Agent`,
      title: 'AI Assistant',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`,
      prompt: 'You are a helpful AI assistant. Customize this prompt to define your role and behavior.',
      welcomeMessage: 'Hello! How can I help you today?',
      characteristics: ['Helpful', 'Professional'],
      language: 'English',
      voiceId: 'en-US-Neural2-A',
      maxCallDuration: 300,
      voicemailDetection: false,
      voicemailAction: 'Hang up',
      voicemailMessage: '',
      silenceDetectionMs: 30,
      voiceSpeed: 1.0,
      interruptionSensitivity: 0.5,
      responsiveness: 0.5,
      emotionLevel: 0.5,
      backgroundNoise: 'None',
      knowledgeBase: [],
    });

    console.log('✅ Default agent created for new user');

    // ✅ CREATE DEFAULT SUBSCRIPTION (Starter Plan)
    await Subscription.create({
      userId: user._id,
      plan: 'Starter',
      status: 'ACTIVE',
      agentLimit: 1,
      docLimit: 0,
      knowledgeBaseEnabled: false,
      addOnsEnabled: false,
      activationFeePaid: true, // Starter has $0 activation fee
      activationFeeAmount: 0,
    });

    console.log('✅ Default subscription created (Starter plan)');

    // ✅ FOR DEVELOPMENT: Skip email verification and return token
    if (autoVerify) {
      const token = jwt.sign(
        { id: user._id.toString(), role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(201).json({
        message: "Account created successfully",
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          emailVerified: true
        }
      });
    }

    // Send verification email for production (non-blocking)
    try {
      await sendVerificationEmail(user.email, emailVerificationToken);
    } catch (emailErr) {
      console.error("⚠️ Failed to send verification email:", emailErr.message);
      // Don't fail registration if email sending fails
    }

    return res.status(201).json({
      message: "Account created. Please check your email to verify your account."
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   VERIFY EMAIL
========================= */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({ emailVerificationToken: token });
    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();

    return res.json({ message: "Email verified successfully" });
  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   LOGIN
========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ message: "Email not verified" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ CHECK IF USER HAS ANY AGENTS - CREATE DEFAULT IF NONE
    const agentCount = await Agent.countDocuments({ userId: user._id });

    if (agentCount === 0) {
      console.log(`🤖 Creating default agent for user: ${user.email}`);

      await Agent.create({
        userId: user._id,
        name: `${user.name || user.email.split('@')[0]}'s Agent`,
        title: 'AI Assistant',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`,
        prompt: 'You are a helpful AI assistant. Customize this prompt to define your role and behavior.',
        welcomeMessage: 'Hello! How can I help you today?',
        characteristics: ['Helpful', 'Professional'],
        language: 'English',
        voiceId: 'en-US-Neural2-A',
        maxCallDuration: 300,
        voicemailDetection: false,
        voicemailAction: 'Hang up',
        voicemailMessage: '',
        silenceDetectionMs: 30,
        voiceSpeed: 1.0,
        interruptionSensitivity: 0.5,
        responsiveness: 0.5,
        emotionLevel: 0.5,
        backgroundNoise: 'None',
        knowledgeBase: [],
      });

      console.log('✅ Default agent created successfully');
    }

    // ✅ CHECK IF USER HAS SUBSCRIPTION - CREATE IF MISSING (Safety net for existing users)
    const existingSubscription = await Subscription.findOne({ userId: user._id });

    if (!existingSubscription) {
      console.log(`⚠️ No subscription found for user ${user.email}, creating default...`);

      await Subscription.create({
        userId: user._id,
        plan: 'Starter',
        status: 'ACTIVE',
        agentLimit: 1,
        docLimit: 0,
        knowledgeBaseEnabled: false,
        addOnsEnabled: false,
        activationFeePaid: true,
        activationFeeAmount: 0,
      });

      console.log('✅ Default subscription created');
    }

    const token = jwt.sign(
      { id: user._id.toString(), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   FORGOT PASSWORD
========================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "If account exists, reset link sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendMail({
      to: user.email,
      subject: "Reset your Shreenika AI password",
      html: `
        <p>You requested a password reset.</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link expires in 15 minutes.</p>
      `
    });

    return res.json({ message: "Reset link sent" });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   RESET PASSWORD
========================= */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
