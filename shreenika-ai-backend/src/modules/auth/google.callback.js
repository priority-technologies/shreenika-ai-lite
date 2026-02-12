import jwt from "jsonwebtoken";
import Agent from "../agent/agent.model.js";
import Subscription from "../billing/subscription.model.js";
import User from "./user.model.js";

export const googleCallback = async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  try {
    const user = req.user;

    // Fetch the latest user data from DB to get hasOnboarded status
    const dbUser = await User.findById(user._id);
    if (!dbUser) {
      return res.redirect(`${FRONTEND_URL}/login?error=user_not_found`);
    }

    // ✅ CHECK IF USER HAS ANY AGENTS - CREATE DEFAULT IF NONE
    const agentCount = await Agent.countDocuments({ userId: user._id });

    if (agentCount === 0) {
      console.log(`🤖 Creating default agent for new user: ${user.email}`);

      await Agent.create({
        userId: user._id,
        name: `${user.name || user.email.split('@')[0]}'s Agent`,
        title: 'AI Assistant',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name || 'Agent'}`,
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

    // ✅ CHECK IF USER HAS SUBSCRIPTION - CREATE IF MISSING
    const existingSubscription = await Subscription.findOne({ userId: user._id });

    if (!existingSubscription) {
      console.log(`💳 Creating default subscription for user: ${user.email}`);

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
      { id: dbUser._id, role: dbUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "48h" } // ⏱ mandatory rule
    );

    // Redirect to root with token in query params so frontend can extract and store it
    // Use dbUser.hasOnboarded to check if user has completed onboarding
    res.redirect(
      `${FRONTEND_URL}/?token=${token}&firstLogin=${!dbUser.hasOnboarded}`
    );
  } catch (err) {
    console.error("Google callback error:", err);
    res.redirect(`${FRONTEND_URL}/login?error=google`);
  }
};
