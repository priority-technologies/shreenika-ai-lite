import mongoose from 'mongoose';

const mongodb_uri = process.env.MONGODB_URI;
if (!mongodb_uri) {
  console.error('❌ MONGODB_URI environment variable not set');
  process.exit(1);
}

try {
  await mongoose.connect(mongodb_uri);
  console.log('✅ Connected to MongoDB');

  // Create Call schema
  const callSchema = new mongoose.Schema({
    voipProvider: String,
    status: String,
    outcome: String,
    endReason: String,
    createdAt: Date,
    leadName: String,
    phoneNumber: String,
    providerCallId: String
  }, { collection: 'calls' });

  const Call = mongoose.model('Call', callSchema);

  // Get SansPBX calls from last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sanspbxCalls = await Call.find({ 
    voipProvider: 'SansPBX',
    createdAt: { $gte: sevenDaysAgo }
  }).sort({ createdAt: -1 }).limit(10).lean();

  console.log(`\n📊 SansPBX Calls (Last 7 days): ${sanspbxCalls.length} found\n`);
  
  if (sanspbxCalls.length === 0) {
    console.log('⚠️  No SansPBX calls found in the last 7 days');
  } else {
    sanspbxCalls.forEach((call, idx) => {
      console.log(`${idx + 1}. ${call.leadName} | ${call.phoneNumber}`);
      console.log(`   Status: ${call.status} | Outcome: ${call.outcome || 'N/A'}`);
      if (call.endReason) console.log(`   Error: ${call.endReason}`);
      console.log(`   Created: ${call.createdAt?.toISOString()}`);
      console.log('');
    });
  }

  // Check status distribution
  const statuses = await Call.aggregate([
    { $match: { voipProvider: 'SansPBX', createdAt: { $gte: sevenDaysAgo } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  console.log('\n📈 Status Distribution:');
  statuses.forEach(s => console.log(`   ${s._id}: ${s.count}`));

  // Check for errors
  const withErrors = await Call.find({ 
    voipProvider: 'SansPBX',
    endReason: { $exists: true, $ne: '' }
  }).sort({ createdAt: -1 }).limit(5).lean();

  if (withErrors.length > 0) {
    console.log('\n❌ Recent SansPBX Errors:');
    withErrors.forEach((call, idx) => {
      console.log(`${idx + 1}. ${call.endReason}`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
