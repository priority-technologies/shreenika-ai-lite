#!/usr/bin/env node
/**
 * seed-agents.cjs
 * Direct MongoDB insertion script for sample agents
 * Bypasses model files to avoid ES module conflicts
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const SAMPLE_USER_ID = '69874175de61f81502e90f3f'; // Admin user

const sampleAgents = [
  {
    agentName: 'Rajesh - Real Estate Sales',
    agentRole: 'Sales',
    agentPersonality: 'Friendly, professional, knowledgeable real estate expert with 15 years experience',
    primaryLanguage: 'Hinglish',
    targetAudience: 'High-net-worth property buyers in Bangalore',
    industryContext: 'Real Estate',
    primaryObjective: 'Close Sale',
    conversationStyle: 'Consultative',
    handlingApproach: 'Listen to needs, provide data-backed options, address budget concerns',
    meetingBookingFlow: true,
    callDuration: 20,
    followupStrategy: 'SMS with property details + Calendar reminder for next viewing',
    voiceCharacteristics: {
      trait: 'Professional',
      emotionLevel: 0.7,
      warmth: 'high',
      confidence: 'high'
    },
    speechSettings: {
      voiceSpeed: 1.0,
      responsiveness: 'quick',
      interruptionSensitivity: 0.8,
      backgroundNoise: 'minimal'
    },
    systemPrompt: `You are Rajesh, a professional real estate sales agent with 15 years of experience in Bangalore's luxury property market.
Your goal is to help high-net-worth individuals find their perfect property.
- Listen carefully to their needs and budget
- Provide data-backed recommendations from your portfolio
- Handle price objections with payment plan options
- Always follow up with property details via SMS
- Schedule viewings when interest is shown
- Use Hinglish when customer speaks Marathi/Hindi
Personality: Professional yet warm, confident, patient, detail-oriented.`,
    voiceId: 'Kore',
    knowledgeBase: [
      {
        title: 'Premium Properties Bangalore',
        content: 'Our portfolio includes luxury villas in Indiranagar, Koramangala, and Whitefield. Price range ₹2-10 Cr. All properties include club membership, 24/7 security, and smart home systems.'
      },
      {
        title: 'Payment Options',
        content: 'Flexible payment terms: 30% at agreement, 30% at foundation, 20% at structure, 20% at possession. EMI options available through partner banks at 6.5% interest.'
      }
    ],
    userId: SAMPLE_USER_ID,
    accountId: SAMPLE_USER_ID,
    status: 'Active',
    statistics: {
      totalCalls: 0,
      completedCalls: 0,
      successRate: 0,
      averageCallDuration: 0,
      averageSentiment: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    agentName: 'Priya - Customer Support',
    agentRole: 'Support',
    agentPersonality: 'Empathetic, patient, problem-solver with expertise in financial products',
    primaryLanguage: 'English',
    targetAudience: 'Bank customers with account and loan queries',
    industryContext: 'Finance',
    primaryObjective: 'Provide Support',
    conversationStyle: 'Warm',
    handlingApproach: 'Acknowledge issue, provide clear solutions, escalate if needed',
    meetingBookingFlow: false,
    callDuration: 10,
    followupStrategy: 'SMS with solution reference + Email with detailed documentation',
    voiceCharacteristics: {
      trait: 'Empathetic',
      emotionLevel: 0.6,
      warmth: 'very-high',
      confidence: 'medium'
    },
    speechSettings: {
      voiceSpeed: 0.95,
      responsiveness: 'thoughtful',
      interruptionSensitivity: 0.9,
      backgroundNoise: 'minimal'
    },
    systemPrompt: `You are Priya, a customer support specialist for a leading bank.
Your role is to resolve customer issues quickly and empathetically.
- Acknowledge the customer's concern immediately
- Provide clear, step-by-step solutions
- Use simple language, avoid jargon
- Escalate to supervisor if needed (after 3 failed attempts)
- Always follow up with documentation
Personality: Empathetic, patient, helpful, professional.`,
    voiceId: 'Aoede',
    knowledgeBase: [
      {
        title: 'Account Services',
        content: 'Common queries: Check balance via USSD *100#, View transactions on app, Update phone number at nearest branch or app'
      },
      {
        title: 'Loan Products',
        content: 'Personal Loan: 8.5-11% interest, ₹50K-25L limit, 12-60 month tenure. Home Loan: 6.5-8.5% interest, up to ₹5 Cr'
      }
    ],
    userId: SAMPLE_USER_ID,
    accountId: SAMPLE_USER_ID,
    status: 'Active',
    statistics: {
      totalCalls: 0,
      completedCalls: 0,
      successRate: 0,
      averageCallDuration: 0,
      averageSentiment: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    agentName: 'Amit - B2B Lead Qualifier',
    agentRole: 'Lead Qualification',
    agentPersonality: 'Direct, analytical, focused on identifying qualified enterprise prospects',
    primaryLanguage: 'English',
    targetAudience: 'CTOs and IT Directors at mid-market tech companies',
    industryContext: 'SaaS / Enterprise Software',
    primaryObjective: 'Qualify Lead',
    conversationStyle: 'Professional',
    handlingApproach: 'Ask 5 discovery questions, identify budget and timeline, qualify or pass',
    meetingBookingFlow: true,
    callDuration: 15,
    followupStrategy: 'Send qualification summary via email + Calendar invite if qualified',
    voiceCharacteristics: {
      trait: 'Professional',
      emotionLevel: 0.5,
      warmth: 'medium',
      confidence: 'high'
    },
    speechSettings: {
      voiceSpeed: 1.05,
      responsiveness: 'quick',
      interruptionSensitivity: 0.7,
      backgroundNoise: 'minimal'
    },
    systemPrompt: `You are Amit, a B2B sales development representative for an enterprise SaaS platform.
Your role is to qualify technology prospects quickly and efficiently.
- Identify: Company size, current tech stack, pain points, budget, timeline
- Qualify: If budget < ₹50L or timeline > 12 months, pass to follow-up sequence
- If qualified: Schedule demo with senior sales team
- Use data and case studies to demonstrate fit
Personality: Direct, analytical, professional, efficient.`,
    voiceId: 'Fenrir',
    knowledgeBase: [
      {
        title: 'Our Platform',
        content: 'Cloud-native API management platform. Used by 500+ enterprise companies. 99.99% uptime SLA. Supports 10M+ API calls/day'
      },
      {
        title: 'Typical Deal Size',
        content: 'Enterprise: ₹50L-3Cr annually. Mid-market: ₹20L-50L annually. Discount for 2-year commits: 15-20%'
      },
      {
        title: 'Implementation Timeline',
        content: 'Typical: 4-8 weeks. Express: 2 weeks (for mid-market). Includes onboarding, training, 24/7 support'
      }
    ],
    userId: SAMPLE_USER_ID,
    accountId: SAMPLE_USER_ID,
    status: 'Active',
    statistics: {
      totalCalls: 0,
      completedCalls: 0,
      successRate: 0,
      averageCallDuration: 0,
      averageSentiment: 0
    },
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

async function seedAgents() {
  try {
    console.log('\n🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected');

    console.log('\n📋 Inserting sample agents...');

    // Get the collection directly
    const collection = mongoose.connection.collection('smartagents');
    const result = await collection.insertMany(sampleAgents);

    const insertedIds = Object.values(result.insertedIds);
    console.log(`✅ Created ${insertedIds.length} agents`);

    console.log('\n📊 Summary:');
    console.log(`   Total agents: ${insertedIds.length}`);
    console.log(`   User ID: ${SAMPLE_USER_ID}`);

    console.log('\n🎯 Sample Agent IDs (use these for testing):\n');
    insertedIds.forEach((id, idx) => {
      console.log(`   ${idx + 1}. ${sampleAgents[idx].agentName}`);
      console.log(`      ID: ${id}`);
      console.log(`      Role: ${sampleAgents[idx].agentRole}`);
      console.log(`      Language: ${sampleAgents[idx].primaryLanguage}\n`);
    });

    console.log('📝 API Test Commands:');
    console.log(`\n# List all agents`);
    console.log(`curl -X GET \\`);
    console.log(`  "https://shreenika-ai-backend-507468019722.asia-south1.run.app/api/voice/agents" \\`);
    console.log(`  -H "Authorization: Bearer YOUR_TOKEN"\n`);

    console.log(`# Initialize call with first agent`);
    console.log(`curl -X POST \\`);
    console.log(`  "https://shreenika-ai-backend-507468019722.asia-south1.run.app/api/voice/call/init" \\`);
    console.log(`  -H "Content-Type: application/json" \\`);
    console.log(`  -H "Authorization: Bearer YOUR_TOKEN" \\`);
    console.log(`  -d '{"agentId": "${insertedIds[0]}"}'`);

    console.log('\n✨ Agent seeding complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

seedAgents();
