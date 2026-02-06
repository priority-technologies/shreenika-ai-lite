const CallLogSchema = new mongoose.Schema({
  userId: String,
  agentId: String,
  contactId: String,
  phoneNumber: String,
  status: String,
  durationSeconds: Number,
  transcript: String,
  recordingUrl: String,
  cost: Number
}, { timestamps: true });

export default mongoose.model('CallLog', CallLogSchema);
