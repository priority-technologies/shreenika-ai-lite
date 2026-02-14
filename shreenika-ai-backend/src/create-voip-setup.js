#!/usr/bin/env node

/**
 * CREATE VOIP SETUP
 * Creates VOIP provider and numbers for testing
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './modules/auth/user.model.js';
import Agent from './modules/agent/agent.model.js';
import { VoipProvider, VoipNumber } from './modules/voip/voip.model.js';

dotenv.config();

const success = (msg) => console.log(`✅ ${msg}`);
const error = (msg) => console.log(`❌ ${msg}`);
const info = (msg) => console.log(`ℹ️  ${msg}`);

async function createVoipSetup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Get admin user
    let user = await User.findOne({ email: 'admin@shreenika.ai' });
    if (!user) {
      user = await User.findOne().limit(1);
    }

    if (!user) {
      error('No users in database');
      process.exit(1);
    }

    success(`Using user: ${user.email}`);
    info(`User ID: ${user._id}`);

    // Create or get agent
    let agent = await Agent.findOne({ userId: user._id });
    if (!agent) {
      agent = await Agent.create({
        userId: user._id,
        name: 'Shreenika - AI Assistant',
        title: 'Virtual Assistant',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Shreenika',
        prompt: 'You are a helpful AI assistant. Be friendly and professional.',
        isActive: true,
        voiceProfile: { language: 'English', voiceId: 'voice_1' },
        speechSettings: { voiceSpeed: 1.0 },
        callSettings: { maxCallDuration: 300 }
      });
      success(`Created agent: ${agent.name}`);
    } else {
      success(`Using agent: ${agent.name}`);
    }

    // Create VOIP provider (for testing - use sample credentials structure)
    const existingProvider = await VoipProvider.findOne({ userId: user._id });
    let provider;

    if (!existingProvider) {
      info('Creating SansPBX provider for testing...');

      // Using placeholder credentials - user should update in Settings
      provider = await VoipProvider.create({
        userId: user._id,
        provider: 'SansPBX',
        credentials: {
          tokenEndpoint: 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken',
          dialEndpoint: 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall',
          accessToken: 'YOUR_ACCESS_TOKEN',  // User needs to replace
          accessKey: 'YOUR_ACCESS_KEY',      // User needs to replace
          appId: '6',
          username: 'your_username',          // User needs to replace
          password: 'your_password'           // User needs to replace
        },
        isActive: true,
        isVerified: false
      });

      success('Created SansPBX provider (credentials placeholder)');
      error('⚠️  IMPORTANT: Update credentials in Settings > VOIP Integration');
    } else {
      provider = existingProvider;
      success(`Using existing provider: ${provider.provider}`);
    }

    // Create VOIP number
    const existingNumber = await VoipNumber.findOne({
      userId: user._id,
      assignedAgentId: agent._id
    });

    let voipNumber;
    if (!existingNumber) {
      voipNumber = await VoipNumber.create({
        userId: user._id,
        providerId: provider._id,
        phoneNumber: '+18054207291', // Twilio test number
        friendlyName: 'Test DID for Call Testing',
        region: 'US',
        country: 'US',
        assignedAgentId: agent._id,
        capabilities: { voice: true, sms: true },
        status: 'active',
        source: 'imported'
      });

      success(`Created and assigned phone number: ${voipNumber.phoneNumber}`);
    } else {
      voipNumber = existingNumber;
      success(`Using existing number: ${voipNumber.phoneNumber}`);
    }

    console.log(`
================================================================================
✅ VOIP SETUP COMPLETE
================================================================================

User: ${user.email} (${user._id})
Agent: ${agent.name} (${agent._id})
Provider: ${provider.provider}
DID: ${voipNumber.phoneNumber} → ${agent.name}

📋 NEXT STEPS:
1. Go to Settings > VOIP Integration
2. Click "Reconnect" to update credentials with actual values:
   - Token Endpoint: ${provider.credentials.tokenEndpoint}
   - Dial Endpoint: ${provider.credentials.dialEndpoint}
   - Access Token: [Get from your SansPBX account]
   - Access Key: [Get from your SansPBX account]
   - Username: [Your SansPBX username]
   - Password: [Your SansPBX password]
   - App ID: ${provider.credentials.appId}
   - DID: +91XXXXXXXXXX (your actual DID)

3. Once credentials are updated, try making a call
4. Check Cloud Run logs for any errors

⚠️  IMPORTANT - Phone Number Format:
   - The test uses: ${voipNumber.phoneNumber} (US Twilio test number)
   - For your SansPBX provider, use your actual Indian DID
   - Format should match what SansPBX expects (typically +91 for India)
    `);

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    error(`Setup error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

createVoipSetup();
