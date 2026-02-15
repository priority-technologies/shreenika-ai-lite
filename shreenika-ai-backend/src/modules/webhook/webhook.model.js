import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    url: {
      type: String,
      required: true,
      trim: true,
    },
    events: {
      type: [String],
      required: true,
      enum: ['lead.created', 'lead.updated', 'call.completed', 'agent.assigned', 'contact.created'],
      default: [],
    },
    headers: {
      type: Map,
      of: String,
      default: new Map(),
    },
    auth: {
      type: {
        type: String,
        enum: ['none', 'basic', 'bearer', 'api_key'],
        default: 'none',
      },
      credentials: {
        username: String,
        password: String,
        token: String,
        apiKey: String,
        apiKeyHeader: { type: String, default: 'X-API-Key' },
      },
    },
    transformations: [
      {
        sourceField: String,
        targetField: String,
        transformType: { type: String, enum: ['direct', 'custom'] },
        customScript: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    retryPolicy: {
      maxRetries: { type: Number, default: 3 },
      retryDelay: { type: Number, default: 5000 }, // 5 seconds
    },
    lastTriggeredAt: Date,
    lastSuccessAt: Date,
    failureCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

webhookSchema.index({ userId: 1, isActive: 1 });

export const Webhook = mongoose.model('Webhook', webhookSchema);

// Webhook Log Schema for debugging
const webhookLogSchema = new mongoose.Schema(
  {
    webhookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Webhook',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    event: String,
    payload: mongoose.Schema.Types.Mixed,
    statusCode: Number,
    response: mongoose.Schema.Types.Mixed,
    error: String,
    retryCount: { type: Number, default: 0 },
    success: Boolean,
    duration: Number, // in milliseconds
  },
  { timestamps: true, expireAfterSeconds: 2592000 } // Auto-delete after 30 days
);

webhookLogSchema.index({ webhookId: 1, createdAt: -1 });
webhookLogSchema.index({ userId: 1, createdAt: -1 });

export const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);
