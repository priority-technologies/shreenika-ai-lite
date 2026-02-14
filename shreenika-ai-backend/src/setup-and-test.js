#!/usr/bin/env node

/**
 * SETUP & TEST SCRIPT
 * 1. Creates test agent if none exist
 * 2. Assigns VOIP numbers to agent
 * 3. Runs full call diagnostics
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './modules/auth/user.model.js';
import Agent from './modules/agent/agent.model.js';
import { VoipProvider, VoipNumber } from './modules/voip/voip.model.js';
import Call from './modules/call/call.model.js';
import { getAgentProviderOrFallback, getAgentPhoneNumber } from './modules/call/helpers/getAgentProvider.js';
import { ProviderFactory } from './modules/call/providers/ProviderFactory.js';

dotenv.config();

const log = (section, message) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 ${section}`);
  console.log('='.repeat(80));
  console.log(message);
};

const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg) => console.log(`❌ ${msg}`);
const info = (msg) => console.log(`ℹ️  ${msg}`);

async function setupAndTest() {
  try {
    // Connect to MongoDB
    log('STEP 1: DATABASE CONNECTION', 'Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    success('Connected to MongoDB');

    // Get or create user
    log('STEP 2: USER SETUP', 'Getting test user...');
    let user = await User.findOne();
    if (!user) {
      error('No users found, creating test user...');
      user = await User.create({
        email: 'test@example.com',
        password: 'hashedPassword',
        firstName: 'Test',
        lastName: 'User'
      });
      success(`Created test user: ${user.email}`);
    } else {
      success(`Using existing user: ${user.email}`);
    }
    info(`User ID: ${user._id}`);

    // Get or create agent
    log('STEP 3: AGENT SETUP', 'Setting up test agent...');
    let agent = await Agent.findOne({ userId: user._id });

    if (!agent) {
      info('No agent for user, creating test agent...');
      agent = await Agent.create({
        userId: user._id,
        name: 'Shreenika - AI Assistant',
        title: 'Virtual Assistant',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Shreenika',
        prompt: 'You are a helpful AI assistant. Be friendly and professional.',
        welcomeMessage: 'Hello! How can I help you today?',
        isActive: true,
        voiceProfile: {
          language: 'English',
          voiceId: 'voice_1'
        },
        speechSettings: {
          voiceSpeed: 1.0,
          interruptionSensitivity: 0.5,
          responsiveness: 0.5,
          emotions: 0.5,
          backgroundNoise: 'office'
        },
        callSettings: {
          maxCallDuration: 300,
          silenceDetectionMs: 30,
          voicemailDetection: false,
          voicemailAction: 'hang-up'
        }
      });
      success(`Created test agent: ${agent.name}`);
    } else {
      success(`Using existing agent: ${agent.name}`);
    }
    info(`Agent ID: ${agent._id}`);

    // Check VOIP numbers
    log('STEP 4: VOIP NUMBER ASSIGNMENT', 'Checking and assigning VOIP numbers...');
    const voipNumbers = await VoipNumber.find({ userId: user._id });

    if (voipNumbers.length === 0) {
      error('No VOIP numbers found for user!');
      error('Please add a VOIP provider in Settings > VOIP Integration first');
      process.exit(1);
    }

    success(`Found ${voipNumbers.length} VOIP number(s)`);

    // Assign first unassigned number to agent
    let agentNumber = await VoipNumber.findOne({ assignedAgentId: agent._id });
    if (!agentNumber) {
      const unassigned = voipNumbers.find(n => !n.assignedAgentId);
      if (unassigned) {
        unassigned.assignedAgentId = agent._id;
        await unassigned.save();
        agentNumber = unassigned;
        success(`Assigned DID to agent: ${unassigned.phoneNumber}`);
      }
    } else {
      success(`Agent already has DID: ${agentNumber.phoneNumber}`);
    }

    if (!agentNumber) {
      error('Could not assign a phone number to agent');
      process.exit(1);
    }

    // Get VOIP provider
    log('STEP 5: VOIP PROVIDER CHECK', 'Verifying VOIP provider...');
    const voipProvider = await getAgentProviderOrFallback(agent._id);
    if (!voipProvider) {
      error('No VOIP provider found!');
      process.exit(1);
    }
    success(`Provider: ${voipProvider.provider}`);

    // Decrypt and validate credentials
    log('STEP 6: CREDENTIAL VALIDATION', 'Verifying credentials are accessible...');
    let decryptedCreds;
    try {
      if (voipProvider.getDecryptedCredentials) {
        decryptedCreds = voipProvider.getDecryptedCredentials();
      } else {
        decryptedCreds = voipProvider.credentials;
      }
      success('Credentials accessible');
    } catch (err) {
      error(`Credential access failed: ${err.message}`);
      process.exit(1);
    }

    // Validate phone numbers
    log('STEP 7: PHONE NUMBER FORMAT VALIDATION', 'Checking DID format...');
    const agentDID = agentNumber.phoneNumber;
    const didOnlyNumbers = agentDID.replace(/[\D]/g, '');

    info(`Agent DID: ${agentDID}`);
    info(`Numbers only: ${didOnlyNumbers} (${didOnlyNumbers.length} digits)`);

    if (didOnlyNumbers.length < 10) {
      error(`Invalid DID length: ${didOnlyNumbers.length} digits`);
      error('SansPBX requires at least 10 digit numbers');
      error('Please reconfigure your VOIP provider with a valid DID');
      process.exit(1);
    }
    success(`DID format valid: ${didOnlyNumbers.length} digits`);

    // Create provider instance
    log('STEP 8: PROVIDER INSTANTIATION', 'Creating provider object...');
    let provider;
    try {
      provider = ProviderFactory.createProvider(voipProvider);
      success(`Provider class: ${provider.constructor.name}`);
    } catch (err) {
      error(`Provider creation failed: ${err.message}`);
      process.exit(1);
    }

    // If SansPBX, test token generation
    if (voipProvider.provider === 'SansPBX') {
      log('STEP 9: SANSPBX AUTHENTICATION TEST', 'Testing token generation...');
      try {
        const token = await provider.generateToken();
        success(`Token generated successfully`);
        success(`Token (first 20 chars): ${token.substring(0, 20)}...`);
      } catch (err) {
        error(`Token generation failed: ${err.message}`);
        error('This means your SansPBX credentials are invalid or endpoint is wrong');
        error('Please verify in Settings > VOIP Integration:');
        error('  - Token Endpoint URL');
        error('  - Dial Endpoint URL');
        error('  - Access Token');
        error('  - Access Key');
        error('  - Username');
        error('  - Password');
        process.exit(1);
      }

      // Test call initiation
      log('STEP 10: SANSPBX CALL TEST', 'Testing actual call initiation...');
      const testPhone = '+917876898746'; // Test number from user
      try {
        info(`Initiating test call:`);
        info(`  From: ${agentDID} (Agent DID)`);
        info(`  To: ${testPhone} (Test number)`);

        const callResult = await provider.initiateCall({
          toPhone: testPhone,
          fromPhone: agentDID,
          webhookUrl: `${process.env.PUBLIC_BASE_URL || 'https://example.com'}/twilio/voice`,
          statusCallbackUrl: `${process.env.PUBLIC_BASE_URL || 'https://example.com'}/twilio/status`
        });

        success('✨ CALL INITIATED SUCCESSFULLY! ✨');
        success(`Call SID: ${callResult.callSid}`);
        success(`Status: ${callResult.status}`);
        info(`Provider: ${callResult.provider}`);
        info(`Provider Call ID: ${callResult.providerCallId}`);

      } catch (err) {
        error(`Call initiation failed: ${err.message}`);

        // Analyze error
        if (err.message.includes('Invalid caller ID')) {
          error('╔════════════════════════════════════════════════════════════╗');
          error('║ ISSUE: SansPBX rejected the caller ID (Agent DID) format   ║');
          error('╚════════════════════════════════════════════════════════════╝');
          error('Possible solutions:');
          error('1. Check if SansPBX requires a specific format (e.g., without country code)');
          error('2. Verify the DID is active in your SansPBX account');
          error('3. Try using a different DID or contact SansPBX support');
        }
      }
    }

    // Final summary
    log('SETUP COMPLETE', 'All checks finished');
    console.log(`
✅ SYSTEM STATUS:
   User: ${user.email}
   Agent: ${agent.name} (${agent._id})
   VOIP Provider: ${voipProvider.provider}
   Agent DID: ${agentDID}
   Credentials: ✅ Accessible
   Provider: ✅ Created

🎯 NEXT STEPS:
   1. Try making a call from the dashboard
   2. Check the Cloud Run logs for details
   3. If "Invalid caller ID" error persists:
      - Verify DID format with your VOIP provider
      - Check SansPBX API documentation
      - Contact your VOIP provider support
    `);

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    error(`Setup failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

setupAndTest();
