export enum CallStatus {
  PENDING = 'PENDING',
  DIALING = 'DIALING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  NO_ANSWER = 'NO_ANSWER'
}

export interface User {
  id: string;
  email: string;
  name: string;
  isAuthenticated: boolean;
  role?: 'admin' | 'user';
}

// --- Super Admin Types ---
export interface Client {
  id: string;
  companyName: string;
  email: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  status: 'Active' | 'Suspended' | 'Pending';
  joinedAt: string;
  totalSpent: number;
}

export interface Transaction {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  date: string;
  status: 'Success' | 'Failed' | 'Pending';
  method: 'Card' | 'UPI' | 'NetBanking';
}
// -------------------------

export interface KnowledgeDocument {
  id: string;
  name: string;
  size: string;
  type: string;
  status: 'synced' | 'processing' | 'failed';
  uploadedAt: string;

  // ===== PLAN + AGENT GUARD =====
  assignedAgentIds?: string[]; // OPTIONAL (fixes red error)
  uploadedFrom?: 'agent' | 'global'; // OPTIONAL
}

export interface AgentConfig {
  id?: string;
  isActive?: boolean;
  name: string;
  title: string;
  avatar?: string;
  language: string;
  voiceId: string;
  characteristics: string[];
  gender?: 'Male' | 'Female' | 'Neutral';
  age?: number;
  
  // Role & Knowledge
  welcomeMessage: string;
  knowledgeBase: KnowledgeDocument[];

  // Call Settings
  callingLimit: number;
  maxCallDuration: number;
  silenceDetectionMs: number;
  voicemailDetection: boolean;
  voicemailAction: 'Hang up' | 'Leave a voicemail';
  voicemailMessage: string;
  
  // Speech Settings
  prompt: string;
  voiceSpeed: number;
  interruptionSensitivity: number;
  responsiveness: number;
  emotionLevel: number;
  backgroundNoise: 'Office' | 'Quiet' | 'Cafe' | 'Street' | 'Call Center';

  // Integrations
  voipProvider: 'Twilio' | 'BlandAI' | 'Vapi' | null;
  voipApiKey: string;
  voipSid: string;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  companyName: string;
  totalEmployees?: number;
  address: string;
  website?: string;
  
  status: 'New' | 'Contacted' | 'Qualified' | 'Closed';
  uploadedAt: string;
   company?: {
    name?: string;
    employees?: number;
    website?: string;
  };
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  phoneNumber: string;
  status: CallStatus;
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
  sentiment?: 'Positive' | 'Neutral' | 'Negative' | 'Unknown';
  outcome?: 'meeting_booked' | 'callback_requested' | 'not_interested' | 'voicemail' | null;
  usageCost?: string;
  rating?: number;
  endReason?: string;
  dialStatus?: string;
}

export type CampaignStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

export interface Campaign {
  _id: string;
  name: string;
  agentId: string;
  userId?: string;
  status: CampaignStatus;
  leads?: string[];
  totalLeads: number;
  completedLeads?: number;
  successfulCalls?: number;
  failedCalls?: number;
  missedCalls?: number;
  noAnswerCalls?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  averageDuration?: number;
  totalDuration?: number;
}

export interface DashboardStats {
  totalAgents: number;
  totalCalls: number;
  meetingsBooked: number;
  totalLeads: number;
}

// --- LEARNING REELS TYPES ---
export interface Reel {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl: string;
  category: 'Sales' | 'Technical' | 'Soft Skills' | 'Product';
  likes: number;
  shares: number;
  author: string;
  duration: string;
}

/* ======================================================
   ADDITION — PLAN TYPES (SAFE APPEND)
====================================================== */

export type PlanType = 'Starter' | 'Pro' | 'Enterprise';

/* ======================================================
   BILLING & USAGE TYPES
====================================================== */

export interface Subscription {
  _id?: string;
  userId: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
  agentLimit: number;
  docLimit: number;
  knowledgeBaseEnabled: boolean;
  addOnsEnabled: boolean;
  activationFeePaid: boolean;
  activationFeeAmount: number;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  gracePeriodEndsAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Usage {
  voiceMinutes: number;
  llmTokens: number;
  agentCount: number;
  docCount: number;
  limits: {
    agents: number;
    docs: number;
    voiceMinutes: number | null;
    llmTokens: number | null;
  };
  plan: string;
  hardStopped: boolean;
}

export interface Invoice {
  _id: string;
  userId: string;
  month: string; // Format: YYYY-MM
  inboundMinutes: number;
  outboundMinutes: number;
  inboundCost: number;
  outboundCost: number;
  totalAmount: number;
  breakdown: {
    llm: number;
    stt: number;
    tts: number;
    infrastructure: number;
  };
  generatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AddOn {
  type: 'extra_documents' | 'extra_agent' | 'training_package';
  quantity: number;
  cost: number;
  purchasedAt: Date;
  isActive: boolean;
  stripePaymentIntentId?: string;
}

export interface AddOnDocument {
  _id: string;
  userId: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  addOns: AddOn[];
  totalAddOnCost: number;
  createdAt?: Date;
  updatedAt?: Date;
}
