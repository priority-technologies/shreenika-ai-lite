import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  const collections = await db.listCollections().toArray();
  console.log('Collections in database:');
  collections.forEach(c => console.log(`  - ${c.name}`));
  
  // Count documents in key collections
  const users = await db.collection('users').countDocuments();
  const agents = await db.collection('agents').countDocuments();
  const voipProviders = await db.collection('voipproviders').countDocuments();
  const voipNumbers = await db.collection('voipnumbers').countDocuments();
  
  console.log(`\nDocument counts:`);
  console.log(`  Users: ${users}`);
  console.log(`  Agents: ${agents}`);
  console.log(`  VOIP Providers: ${voipProviders}`);
  console.log(`  VOIP Numbers: ${voipNumbers}`);
  
  // Show one of each if available
  if (agents > 0) {
    const agent = await db.collection('agents').findOne();
    console.log(`\nSample agent:`, JSON.stringify(agent, null, 2).substring(0, 500));
  }
  
  if (voipNumbers > 0) {
    const num = await db.collection('voipnumbers').findOne();
    console.log(`\nSample VOIP number:`, JSON.stringify(num, null, 2).substring(0, 500));
  }
  
  await mongoose.connection.close();
}

check().catch(console.error);
