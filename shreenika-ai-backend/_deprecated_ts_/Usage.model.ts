const UsageSchema = new mongoose.Schema({
  userId: String,
  month: String,
  minutesUsed: Number,
  callsMade: Number,
  docsUploaded: Number,
  agentsCreated: Number
});

export default mongoose.model('Usage', UsageSchema);
