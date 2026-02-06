import { Lead, CallLog, CallStatus, Client, Transaction, Reel } from './types';

export const INITIAL_LEADS: Lead[] = [
  { 
    id: '1', 
    firstName: 'Sarah', 
    lastName: 'Connor', 
    email: 'sarah@skynet.com', 
    phone: '+16055550101', 
    companyName: 'Cyberdyne Systems',
    address: '123 Tech Blvd, CA',
    website: 'www.cyberdyne.com',
    status: 'New', 
    uploadedAt: new Date().toISOString() 
  },
  { 
    id: '2', 
    firstName: 'John', 
    lastName: 'Doe', 
    email: 'john@construction.com', 
    phone: '+16055550102', 
    companyName: 'Doe Construction',
    address: '456 Build Lane, TX',
    totalEmployees: 50,
    status: 'New', 
    uploadedAt: new Date().toISOString() 
  },
  { 
    id: '3', 
    firstName: 'Emily', 
    lastName: 'Blunt', 
    email: 'emily@runway.com', 
    phone: '+16055550103', 
    companyName: 'Runway Magazine',
    address: '789 Fashion Ave, NY',
    status: 'Qualified', 
    uploadedAt: new Date().toISOString() 
  },
];

export const MOCK_CALL_LOGS: CallLog[] = [
  {
    id: 'c1',
    leadId: '3',
    leadName: 'Emily Blunt',
    phoneNumber: '+16055550103',
    status: CallStatus.COMPLETED,
    durationSeconds: 145,
    startedAt: new Date(Date.now() - 86400000).toISOString(),
    endedAt: new Date(Date.now() - 86400000 + 145000).toISOString(),
    transcript: "Agent: Hello Emily, I'm calling from Shreenika AI.\nEmily: Hi, yes I was expecting your call.\nAgent: Great, I wanted to discuss the enterprise plan...",
    summary: "Customer was interested in enterprise features. Scheduled a follow-up.",
    sentiment: "Positive",
    usageCost: "00:01:0",
    rating: 4,
    endReason: "The contact ended the call.",
    dialStatus: "Call completed"
  },
  {
    id: 'c2',
    leadId: '1',
    leadName: 'Sarah Connor',
    phoneNumber: '+16055550101',
    status: CallStatus.NO_ANSWER,
    durationSeconds: 0,
    startedAt: new Date(Date.now() - 172800000).toISOString(),
    endedAt: new Date(Date.now() - 172800000).toISOString(),
    transcript: "",
    summary: "No answer.",
    sentiment: "Unknown",
    usageCost: "00:00:0",
    rating: 0,
    endReason: "No Answer",
    dialStatus: "No answer"
  }
];

export const MOCK_CLIENTS: Client[] = [
  { id: '1', companyName: 'Acme Corp', email: 'billing@acme.com', plan: 'Enterprise', status: 'Active', joinedAt: '2025-01-15', totalSpent: 4500 },
  { id: '2', companyName: 'TechStart Inc', email: 'founder@techstart.io', plan: 'Pro', status: 'Active', joinedAt: '2025-03-10', totalSpent: 1200 },
  { id: '3', companyName: 'Global Logistics', email: 'ops@glogistics.com', plan: 'Starter', status: 'Suspended', joinedAt: '2025-06-22', totalSpent: 300 },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx_1', clientId: '1', clientName: 'Acme Corp', amount: 1094.60, date: '2025-11-25', status: 'Success', method: 'Card' },
  { id: 'tx_2', clientId: '2', clientName: 'TechStart Inc', amount: 49.99, date: '2025-11-24', status: 'Success', method: 'UPI' },
  { id: 'tx_3', clientId: '1', clientName: 'Acme Corp', amount: 2500.00, date: '2025-10-25', status: 'Success', method: 'NetBanking' },
  { id: 'tx_4', clientId: '3', clientName: 'Global Logistics', amount: 29.99, date: '2025-10-20', status: 'Failed', method: 'Card' },
];

export const DEFAULT_AGENT_PROMPT = `You are a helpful sales representative for Shreenika AI. 
Your goal is to qualify leads for our new AI voice automation platform.
Be polite, professional, and concise. 
If the user is interested, try to book a meeting for next week.`;

// --- Dropdown Options Sources ---
export const VOICE_OPTIONS = [
  { id: 'Monika (en-IN)', name: 'Monika (en-IN)', gender: 'Female' },
  { id: 'Aditi (hi-IN)', name: 'Aditi (hi-IN)', gender: 'Female' },
  { id: 'Sarah (en-US)', name: 'Sarah (en-US)', gender: 'Female' },
  { id: 'Josh (en-US)', name: 'Josh (en-US)', gender: 'Male' }
];

export const LANGUAGE_OPTIONS = [
  'English (US)',
  'English (UK)',
  'English (India)',
  'Hindi (India)',
  'Spanish',
  'French'
];

export const NOISE_OPTIONS = ['Office', 'Quiet', 'Cafe', 'Street', 'Call Center'];

export const CHARACTERISTIC_OPTIONS = [
  'Friendly',
  'Professional',
  'Empathetic',
  'Assertive',
  'Humorous',
  'Calm',
  'Persuasive'
];

export const FAQ_ITEMS = [
  { q: "How do I add a new phone number?", a: "Go to Settings > VOIP Integration and click 'Purchase Number'." },
  { q: "Can I export call recordings?", a: "Yes, go to Call Management, select a call, and click the download icon in the player." },
  { q: "How is billing calculated?", a: "Billing is based on minutes used for LLM, STT, TTS, and telephony charges. See Usage page for details." },
  { q: "Can I upgrade my agent limit?", a: "Yes, go to Agent Management and click '+ Add Agent' or check your Plan settings." }
];

// ================= KNOWLEDGE BASE BILLING RULES =================
export const KNOWLEDGE_BASE_LIMITS = {
  Starter: {
    allowUpload: false,
    maxDocs: 0,
    requireAgentAssignment: false,
  },
  Pro: {
    allowUpload: true,
    maxDocs: 25,
    requireAgentAssignment: true,
  },
  Enterprise: {
    allowUpload: true,
    maxDocs: Infinity,
    requireAgentAssignment: true,
  },
};
// ===============================================================

export const MOCK_REELS: Reel[] = [
  {
    id: 'r1',
    title: 'Cold Calling 101: Handling Rejections',
    description: 'Learn the top 3 phrases to handle "I am not interested" with grace and turn it into an opportunity.',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-working-on-his-laptop-308-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f7a07d?q=80&w=1000&auto=format&fit=crop',
    category: 'Sales',
    likes: 124,
    shares: 45,
    author: 'Sarah Sales',
    duration: '00:45'
  },
  {
    id: 'r2',
    title: 'AI Ethics in 60 Seconds',
    description: 'Understanding the importance of transparency when using AI agents for customer outreach.',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-woman-talking-on-video-call-on-smartphone-at-home-40428-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=1000&auto=format&fit=crop',
    category: 'Technical',
    likes: 89,
    shares: 12,
    author: 'Dr. Tech',
    duration: '01:00'
  },
  {
    id: 'r3',
    title: 'Voice Modulation Tips',
    description: 'How to sound more persuasive by adjusting your pitch and tone during crucial negotiation moments.',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-business-woman-making-a-presentation-in-an-office-3098-large.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1000&auto=format&fit=crop',
    category: 'Soft Skills',
    likes: 256,
    shares: 98,
    author: 'Voice Coach Alex',
    duration: '00:30'
  }
];

/* ======================================================
   ADDITION — PLAN AWARE CONFIG (SAFE APPEND)
====================================================== */

export const PLAN_LIMITS = {
  Starter: {
    maxAgents: 1,
    knowledgeEnabled: false,
    maxDocsPerAgent: 0,
    googlePromptEnabled: false,
  },
  Pro: {
    maxAgents: 5,
    knowledgeEnabled: true,
    maxDocsPerAgent: 5,
    googlePromptEnabled: true,
  },
  Enterprise: {
    maxAgents: Infinity,
    knowledgeEnabled: true,
    maxDocsPerAgent: Infinity,
    googlePromptEnabled: true,
  },
};
