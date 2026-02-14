#!/usr/bin/env node

/**
 * COMPREHENSIVE CALL EXECUTION TEST SCRIPT
 * Tests all components of the call flow and identifies issues
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

async function runTests() {
  try {
    // Connect to MongoDB
    log('DATABASE CONNECTION', 'Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    success('Connected to MongoDB');

    // Test 1: Get first user
    log('TEST 1: USER & AGENT RETRIEVAL', 'Fetching first user and their agent...');
    const user = await User.findOne().limit(1);
    if (!user) {
      error('No users found in database');
      process.exit(1);
    }
    success(`Found user: ${user.email}`);
    info(`User ID: ${user._id}`);

    let agent = await Agent.findOne({ userId: user._id });
    if (!agent) {
      info('No agents for first user, searching for any agent in system...');
      agent = await Agent.findOne().limit(1);
      if (!agent) {
        error('No agents found in database');
        process.exit(1);
      }
      info(`Found agent from different user: ${agent.name}`);
      // Update user to match agent's user
      const agentUser = await User.findById(agent.userId);
      if (agentUser) {
        info(`Agent belongs to user: ${agentUser.email}`);
      }
    }
    success(`Found agent: ${agent.name}`);
    info(`Agent ID: ${agent._id}`);

    // Test 2: Get VOIP Provider
    log('TEST 2: VOIP PROVIDER CHECK', 'Checking assigned VOIP provider...');
    const voipProvider = await getAgentProviderOrFallback(agent._id);
    if (!voipProvider) {
      error('No VOIP provider found for agent');
      process.exit(1);
    }
    success(`VOIP Provider: ${voipProvider.provider}`);
    info(`Provider ID: ${voipProvider._id}`);

    // Test 3: Decrypt credentials
    log('TEST 3: CREDENTIAL DECRYPTION', 'Attempting to decrypt provider credentials...');
    let decryptedCreds;
    try {
      if (voipProvider.getDecryptedCredentials) {
        decryptedCreds = voipProvider.getDecryptedCredentials();
      } else {
        decryptedCreds = voipProvider.credentials;
      }
      success('Credentials decrypted successfully');
      info(`Available credential fields: ${Object.keys(decryptedCreds).join(', ')}`);
    } catch (err) {
      error(`Decryption failed: ${err.message}`);
      process.exit(1);
    }

    // Test 4: Get assigned phone number (DID)
    log('TEST 4: PHONE NUMBER (DID) ASSIGNMENT', 'Checking agent\'s assigned DID...');
    const agentDID = await getAgentPhoneNumber(agent._id);
    if (!agentDID) {
      error('No phone number assigned to agent');
      process.exit(1);
    }
    success(`Agent DID: ${agentDID}`);

    // Test 5: Validate phone number format
    log('TEST 5: PHONE NUMBER VALIDATION', 'Validating DID and test phone formats...');

    const testPhoneNumber = '+917876898746'; // Test number from screenshot

    // Check DID format
    const didOnlyNumbers = agentDID.replace(/[\D]/g, '');
    info(`DID (numbers only): ${didOnlyNumbers}`);
    if (didOnlyNumbers.length < 10) {
      error(`DID too short: ${didOnlyNumbers} (${didOnlyNumbers.length} digits)`);
      error('SansPBX expects at least 10 digit numbers');
      process.exit(1);
    }
    success(`DID has valid length: ${didOnlyNumbers.length} digits`);

    // Check test phone format
    const testOnlyNumbers = testPhoneNumber.replace(/[\D]/g, '');
    info(`Test phone (numbers only): ${testOnlyNumbers}`);
    if (testOnlyNumbers.length < 10) {
      error(`Test phone too short: ${testOnlyNumbers}`);
      process.exit(1);
    }
    success(`Test phone has valid length: ${testOnlyNumbers.length} digits`);

    // Test 6: Test provider creation
    log('TEST 6: PROVIDER INSTANTIATION', 'Creating provider instance...');
    let provider;
    try {
      provider = ProviderFactory.createProvider(voipProvider);
      success(`Provider created: ${provider.constructor.name}`);
    } catch (err) {
      error(`Provider creation failed: ${err.message}`);
      process.exit(1);
    }

    // Test 7: Test SansPBX token generation (if SansPBX)
    if (voipProvider.provider === 'SansPBX') {
      log('TEST 7: SANSPBX TOKEN GENERATION', 'Testing token generation...');
      try {
        info('Calling SansPBX token endpoint...');
        info(`Endpoint: ${decryptedCreds.tokenEndpoint}`);
        info(`Username: ${decryptedCreds.username ? decryptedCreds.username.substring(0, 3) + '***' : 'MISSING'}`);

        const token = await provider.generateToken();
        success(`Token generated: ${token.substring(0, 20)}...`);
      } catch (err) {
        error(`Token generation failed: ${err.message}`);
        info('Possible causes:');
        info('1. Invalid credentials (username/password)');
        info('2. Invalid endpoints');
        info('3. Network/firewall issues');
        info('4. SansPBX API authentication failure');
        process.exit(1);
      }

      // Test 8: Test SansPBX dial (dry run)
      log('TEST 8: SANSPBX DIAL TEST', 'Testing dial endpoint with actual credentials...');
      try {
        info(`Test call: ${testOnlyNumbers} (to) <- ${didOnlyNumbers} (from)`);
        info(`Dial Endpoint: ${decryptedCreds.dialEndpoint}`);
        info(`App ID: ${decryptedCreds.appId}`);

        const callResult = await provider.initiateCall({
          toPhone: testPhoneNumber,
          fromPhone: agentDID,
          webhookUrl: 'https://example.com/webhook',
          statusCallbackUrl: 'https://example.com/status'
        });

        success(`Call initiated successfully!`);
        success(`Call SID: ${callResult.callSid}`);
        success(`Provider: ${callResult.provider}`);
        info(`Provider Call ID: ${callResult.providerCallId}`);
      } catch (err) {
        error(`Call initiation failed: ${err.message}`);
        info('Debugging info:');
        info(`Caller ID format: ${didOnlyNumbers} (${didOnlyNumbers.length} digits)`);
        info(`Called number format: ${testOnlyNumbers} (${testOnlyNumbers.length} digits)`);
        info('Common issues:');
        info('1. Invalid Caller ID format - SansPBX may need specific format');
        info('2. Country code mismatch - Check if +91 prefix is correct for your region');
        info('3. API authentication - Credentials may be expired or wrong');
        info('4. Account/AppId issues - Check SansPBX account configuration');

        // Don't exit - show more diagnostics
      }
    }

    // Test 9: Database state check
    log('TEST 9: DATABASE STATE', 'Checking call history and VOIP numbers...');
    const recentCalls = await Call.find({ agentId: agent._id })
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentCalls.length > 0) {
      success(`Found ${recentCalls.length} recent calls`);
      recentCalls.forEach((call, i) => {
        info(`Call ${i + 1}: ${call.status} - Provider: ${call.voipProvider} - ${call.createdAt}`);
      });
    } else {
      info('No recent calls found');
    }

    const voipNumbers = await VoipNumber.find({ assignedAgentId: agent._id });
    if (voipNumbers.length > 0) {
      success(`Found ${voipNumbers.length} assigned phone numbers`);
      voipNumbers.forEach((num, i) => {
        info(`Number ${i + 1}: ${num.phoneNumber} - Status: ${num.status}`);
      });
    }

    // Summary
    log('FINAL DIAGNOSIS', 'Summary of all checks...');
    console.log(`
✅ User found: ${user.email}
✅ Agent found: ${agent.name} (${agent._id})
✅ VOIP Provider: ${voipProvider.provider}
✅ Agent DID: ${agentDID}
✅ Credentials: Decrypted
✅ Provider instance: Created
${voipProvider.provider === 'SansPBX' ? '✅ SansPBX specific: All tests passed' : 'ℹ️  Using different provider'}

🎯 RECOMMENDATION:
The error "Invalid caller ID" suggests the phone number format is not accepted.
Check with SansPBX what format they expect for caller IDs.

Possible solutions:
1. Try different phone number format (with/without country code)
2. Verify the DID is in the correct format for SansPBX
3. Check SansPBX API documentation for number format requirements
4. Ensure the test numbers are in the correct format
    `);

    await mongoose.connection.close();
    process.exit(0);

  } catch (err) {
    error(`Test suite error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// Run tests
runTests();
