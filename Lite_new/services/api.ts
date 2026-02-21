// ==============================
// EXPLICIT API BASE URLS
// ==============================

// Auth server (login, google oauth, token issuing)
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.asia-south1.run.app";

// Core API server (agents, calls, contacts, billing)
const CORE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://shreenika-ai-backend-507468019722.asia-south1.run.app";

// ==============================
// GENERIC API FETCH
// ==============================
export const apiFetch = async (
  endpoint: string,
  options?: RequestInit,
  server: "auth" | "core" = "core"
) => {
  const baseUrl =
    server === "auth" ? AUTH_BASE_URL : CORE_API_BASE_URL;

  const url = `${baseUrl}${endpoint}`;

  // Try multiple token storage locations
  const token = localStorage.getItem("token") 
             || localStorage.getItem("voxai_token")
             || sessionStorage.getItem("token")
             || sessionStorage.getItem("voxai_token");

  // DEBUG: Log token status
  console.log("🔑 Token Check:", token ? "✅ Token exists" : "❌ No token");

  const headers: HeadersInit = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers,
  };

  // IMPORTANT: do NOT set Content-Type for FormData
  if (!(options?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  console.log("🌐 API Request:", url, config);

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    console.log("📥 API Response:", response.status, data);

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("voxai_token");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("voxai_token");
        window.location.href = "/";
      }
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error("❌ API Error:", error);
    throw error;
  }
};

// ==============================
// AGENT MANAGEMENT APIs (CORE)
// ==============================
export const getAgents = () =>
  apiFetch("/api/voice/agents", undefined, "core");

export const createAgent = (payload: any) =>
  apiFetch("/api/voice/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "core");

export const updateAgent = (id: string, payload: any) =>
  apiFetch(`/api/voice/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, "core");

export const deleteAgent = (id: string) =>
  apiFetch(`/api/voice/agents/${id}`, {
    method: "DELETE",
  }, "core");

export const getAgentById = (id: string) =>
  apiFetch(`/api/voice/agents/${id}`, undefined, "core");

// ==============================
// KNOWLEDGE BASE APIs (CORE)
// ==============================
export const uploadKnowledgeFile = (file: File, agentId?: string, title?: string) => {
  const formData = new FormData();
  formData.append("file", file);
  if (agentId) formData.append("agentId", agentId);
  if (title) formData.append("title", title);

  return apiFetch("/knowledge/upload", {
    method: "POST",
    body: formData,
  }, "core");
};

export const listKnowledgeDocs = (agentId?: string) => {
  const query = agentId ? `?agentId=${agentId}` : "";
  return apiFetch(`/knowledge${query}`, undefined, "core");
};

export const deleteKnowledgeDoc = (id: string) =>
  apiFetch(`/knowledge/${id}`, { method: "DELETE" }, "core");

// ==============================
// CONTACTS APIs (CORE)
// ==============================
export const getContacts = () =>
  apiFetch("/contacts", undefined, "core");

// ==============================
// CALL MANAGEMENT APIs (CORE)
// ==============================
export const getCalls = () =>
  apiFetch("/calls", undefined, "core");

export const startCall = (payload: {
  agentId: string;
  leadId?: string;
  toPhone: string;
}) =>
  apiFetch("/twilio/outbound", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "core");

// ==============================
// CAMPAIGN APIs (CORE)
// ==============================
export const getCampaigns = () =>
  apiFetch("/calls/campaigns", undefined, "core");

export const getCampaignDetails = (campaignId: string) =>
  apiFetch(`/calls/campaigns/${campaignId}`, undefined, "core");

export const getCampaignLogs = (campaignId: string, page: number = 1, limit: number = 50) =>
  apiFetch(`/calls/campaigns/${campaignId}/logs?page=${page}&limit=${limit}`, undefined, "core");

export const createCampaign = (payload: {
  agentId: string;
  leadIds: string[];
  campaignName?: string;
}) =>
  apiFetch("/calls/campaigns", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "core");

export const stopCampaign = (campaignId: string) =>
  apiFetch("/calls/campaigns/stop", {
    method: "POST",
    body: JSON.stringify({ campaignId }),
  }, "core");

export const pauseCampaign = (campaignId: string) =>
  apiFetch(`/calls/campaigns/${campaignId}/pause`, {
    method: "POST",
  }, "core");

export const resumeCampaign = (campaignId: string) =>
  apiFetch(`/calls/campaigns/${campaignId}/resume`, {
    method: "POST",
  }, "core");

// ==============================
// BILLING & USAGE APIs (CORE)
// ==============================
export const getBillingStatus = () =>
  apiFetch("/billing/status", undefined, "core");

export const getCurrentUsage = () =>
  apiFetch("/billing/usage", undefined, "core");

export const getInvoices = () =>
  apiFetch("/billing/invoices", undefined, "core");

export const purchaseAddOn = (type: string, quantity: number) =>
  apiFetch("/billing/addon", {
    method: "POST",
    body: JSON.stringify({ type, quantity }),
  }, "core");

export const updatePlan = (newPlan: string) =>
  apiFetch("/billing/plan", {
    method: "PUT",
    body: JSON.stringify({ newPlan }),
  }, "core");

export const cancelSubscription = () =>
  apiFetch("/billing/cancel", {
    method: "POST",
  }, "core");

// ==============================
// VOIP INTEGRATION APIs (CORE)
// ==============================
export const getVoipProvider = () =>
  apiFetch("/voip/provider", undefined, "core");

export const addVoipProvider = (payload: {
  provider: string;
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  secretKey?: string;
}) =>
  apiFetch("/voip/provider", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "core");

export const getVoipNumbers = () =>
  apiFetch("/voip/numbers", undefined, "core");

export const syncVoipNumbers = () =>
  apiFetch("/voip/numbers/sync", {
    method: "POST",
  }, "core");

export const assignNumberToAgent = (numberId: string, agentId: string) =>
  apiFetch("/voip/numbers/assign", {
    method: "POST",
    body: JSON.stringify({ numberId, agentId }),
  }, "core");

export const unassignNumber = (numberId: string) =>
  apiFetch("/voip/numbers/unassign", {
    method: "POST",
    body: JSON.stringify({ numberId }),
  }, "core");

export const releaseNumber = (numberId: string) =>
  apiFetch("/voip/numbers/release", {
    method: "POST",
    body: JSON.stringify({ numberId }),
  }, "core");

export const getAvailableNumbers = (country?: string, areaCode?: string) => {
  const params = new URLSearchParams();
  if (country) params.append("country", country);
  if (areaCode) params.append("areaCode", areaCode);
  return apiFetch(`/voip/numbers/available?${params.toString()}`, undefined, "core");
};

export const purchaseNumber = (phoneNumber: string) =>
  apiFetch("/voip/numbers/purchase", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  }, "core");

export const deleteVoipNumber = (numberId: string) =>
  apiFetch(`/voip/numbers/${numberId}`, {
    method: "DELETE",
  }, "core");

export const setupVoipForRegistration = (payload: {
  provider: string;
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  secretKey?: string;
  endpointUrl?: string;
  httpMethod?: string;
  headers?: any;
  region?: string;
  customScript?: string;
}) =>
  apiFetch("/voip/setup-registration", {
    method: "POST",
    body: JSON.stringify(payload),
  }, "core");

export const markUserOnboarded = () =>
  apiFetch("/auth/mark-onboarded", {
    method: "POST",
  }, "core");

export const promoteToAdmin = (email: string, adminKey: string) =>
  apiFetch("/auth/promote-admin", {
    method: "POST",
    body: JSON.stringify({ email, adminKey }),
  }, "auth");

// ==============================
// ADMIN / SUPER ADMIN APIs (CORE)
// ==============================
export const checkAdminStatus = () =>
  apiFetch("/admin/status", undefined, "core");

export const getAdminUsers = () =>
  apiFetch("/admin/users", undefined, "core");

export const getAdminUserDetails = (userId: string) =>
  apiFetch(`/admin/users/${userId}`, undefined, "core");

export const getAdminUserContacts = (userId: string) =>
  apiFetch(`/admin/users/${userId}/contacts`, undefined, "core");

export const getAdminContactCalls = (userId: string, contactId: string) =>
  apiFetch(`/admin/users/${userId}/contacts/${contactId}/calls`, undefined, "core");

export const suspendUser = (userId: string) =>
  apiFetch(`/admin/users/${userId}/suspend`, {
    method: "POST",
  }, "core");

export const activateUser = (userId: string) =>
  apiFetch(`/admin/users/${userId}/activate`, {
    method: "POST",
  }, "core");

// ==============================
// API KEY MANAGEMENT (SETTINGS)
// ==============================
export const generateApiKey = (name?: string) =>
  apiFetch("/settings/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  }, "core");

export const listApiKeys = () =>
  apiFetch("/settings/api-keys", undefined, "core");

export const revokeApiKey = (id: string) =>
  apiFetch(`/settings/api-keys/${id}`, {
    method: "DELETE",
  }, "core");

// ==============================
// VOICE ENGINE APIs (CORE)
// ==============================
export const getVoices = () =>
  apiFetch("/voice/voices/available", undefined, "core");

export const getLanguages = () =>
  apiFetch("/voice/languages/available", undefined, "core");

export const getAgentVoiceSettings = (agentId: string) =>
  apiFetch(`/voice/agent/${agentId}/settings`, undefined, "core");

export const updateAgentVoiceSettings = (agentId: string, settings: any) =>
  apiFetch(`/voice/agent/${agentId}/settings`, {
    method: "PUT",
    body: JSON.stringify(settings),
  }, "core");

export const previewVoice = (agentId: string, text: string) =>
  apiFetch(`/voice/agent/${agentId}/preview`, {
    method: "POST",
    body: JSON.stringify({ text }),
  }, "core");
