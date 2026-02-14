import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './modules/auth/user.model.js';
import Agent from './modules/agent/agent.model.js';
import { VoipProvider, VoipNumber } from './modules/voip/voip.model.js';

dotenv.config({ path: '../.env' });

async function reassign() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    // Get admin user
    const user = await User.findOne({ email: 'admin@shreenika.ai' });
    const agent = await Agent.findOne({ userId: user._id });
    
    console.log(`✅ User: ${user.email}`);
    console.log(`✅ Agent: ${agent.name}`);

    // Find existing provider
    let provider = await VoipProvider.findOne({ userId: user._id });
    if (!provider) {
      provider = await VoipProvider.create({
        userId: user._id,
        provider: 'SansPBX',
        credentials: {
          tokenEndpoint: 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/gentoken',
          dialEndpoint: 'https://clouduat28.sansoftwares.com/pbxadmin/sanpbxapi/dialcall',
          accessToken: 'YOUR_TOKEN',
          accessKey: 'YOUR_KEY',
          appId: '6',
          username: 'your_user',
          password: 'your_pass'
        },
        isActive: true
      });
      console.log(`✅ Created provider: ${provider.provider}`);
    } else {
      console.log(`✅ Using provider: ${provider.provider}`);
    }

    // Reassign existing phone number
    const voipNumber = await VoipNumber.findOne({ phoneNumber: '+18054207291' });
    if (voipNumber) {
      voipNumber.userId = user._id;
      voipNumber.providerId = provider._id;
      voipNumber.assignedAgentId = agent._id;
      await voipNumber.save();
      console.log(`✅ Reassigned DID to agent: ${voipNumber.phoneNumber}`);
    }

    console.log(`
================================================================================
✅ VOIP SETUP COMPLETE - READY FOR TESTING
================================================================================

User: ${user.email}
Agent: ${agent.name}
Provider: ${provider.provider}
DID: ${voipNumber.phoneNumber}

📋 CRITICAL - NEXT STEPS:

1. **Update VOIP Credentials (Must Do!)**:
   Go to: Settings > VOIP Integration > Reconnect
   
   Update these fields:
   - Token Endpoint: ${provider.credentials.tokenEndpoint}
   - Dial Endpoint: ${provider.credentials.dialEndpoint}
   - Access Token: [Your actual SansPBX token]
   - Access Key: [Your actual SansPBX key]
   - Username: [Your SansPBX username]
   - Password: [Your SansPBX password]
   - App ID: 6
   - DID: +91XXXXXXXXXX (your actual DID)

2. **Test the Call**:
   - Go to Call Management
   - Create a campaign
   - Select agent: ${agent.name}
   - Start the auto-dialer
   - Monitor Cloud Run logs for results

🔍 **If Call Still Fails**:
   Check Cloud Run logs at:
   https://console.cloud.google.com/run/detail/asia-south1/shreenika-ai-backend/logs
   
   Look for "SansPBX" errors which will show exactly what's wrong
    `);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

reassign();
