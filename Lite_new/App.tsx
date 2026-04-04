import React, { useState, useEffect } from "react";
import Layout from "./components/Layout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import Auth from "./components/Auth";
import Onboarding from "./components/Onboarding";
import Dashboard from "./components/Dashboard";
import AgentManager from "./components/AgentManager";
import LeadManager from "./components/LeadManager";
import KnowledgeCenter from "./components/KnowledgeCenter";
import UsageBilling from "./components/UsageBilling";
import LeadManagement from "./components/LeadManagement";
import ProfileSettings from "./components/ProfileSettings";
import ResetPassword from "./components/ResetPassword";
import CallWorkspace from "./components/containers/CallWorkspace";
// TEMPORARILY COMMENTED OUT — Campaign section hidden until bug fixes deployed
// import CampaignManager from "./components/CampaignManager";
import SuperAdminDashboard from "./components/SuperAdminDashboard";
import UserManagementList from "./components/admin/UserManagementList";
import UserDetailsView from "./components/admin/UserDetailsView";
import LeadDetailsView from "./components/admin/LeadDetailsView";
import CMSEditor from "./components/admin/CMSEditor";
import ComingSoonPage from "./components/admin/ComingSoonPage";

import { Lead, CallLog, AgentConfig } from "./types";
import { INITIAL_LEADS, MOCK_CALL_LOGS } from "./constants";
import { apiFetch } from "./services/api";

const App: React.FC = () => {
  /* =========================
     AUTH — REAL TOKEN CHECK
     FIX (2026-03-31): Removed dev-testing bypass that was writing "local-test-token"
     to localStorage on every mount. That fake token caused every API call to return 401,
     which triggered window.location.href = "/" in apiFetch, causing infinite page reloads.
  ========================= */
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem("token")
  );

  /* =========================
     FETCH & STORE USER PROFILE
  ========================= */
  const fetchAndStoreUser = async () => {
    try {
      const data = await apiFetch("/auth/me");
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
      }
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
    }
  };

  /* =========================
     GOOGLE CALLBACK HANDLING
  ========================= */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const firstLogin = params.get("firstLogin");

    if (token) {
      localStorage.setItem("token", token);
      localStorage.setItem("loginTime", Date.now().toString());

      // Fetch user profile from backend (Google login doesn't provide user data in URL)
      fetchAndStoreUser();

      if (firstLogin === "true") {
        localStorage.setItem("forceOnboarding", "true");
        setRoute("/onboarding");
      } else {
        setRoute("/dashboard");
      }

      setIsAuthenticated(true);
      window.history.replaceState({}, document.title, "/");
    }
  }, []);

  /* =========================
     ROUTING (STATE BASED)
  ========================= */
  const [route, setRoute] = useState<string>("/agents");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check admin role from stored user data when auth state changes
    const user = localStorage.getItem("user");
    if (user) {
      try {
        const parsed = JSON.parse(user);
        setIsAdmin(parsed.role === 'superadmin');
      } catch {
        setIsAdmin(false);
      }
    } else {
      setIsAdmin(false);
    }
  }, [isAuthenticated]);

  const navigate = (path: string) => {
    // Prevent non-admin users from accessing admin routes
    if (path.startsWith("/admin") && !isAdmin) {
      setRoute("/dashboard");
      return;
    }
    setRoute(path);
  };

  /* =========================
     AGENT STATE
  ========================= */
  const [agent, setAgent] = useState<AgentConfig>(() => {
    const saved = localStorage.getItem("voxai_agent");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        welcomeMessage:
          parsed.welcomeMessage ||
          "Hello, I'm calling from Shreenika AI. How are you today?",
        knowledgeBase: parsed.knowledgeBase || [],
        language: parsed.language || "English (US)",
        characteristics: parsed.characteristics || [
          "Friendly",
          "Professional",
        ],
        maxCallDuration: parsed.maxCallDuration || 3600,
        // Fix: silenceDetectionMs is in milliseconds (5000–60000). Old data may have seconds (15, 30) — upgrade it.
        silenceDetectionMs: (parsed.silenceDetectionMs && parsed.silenceDetectionMs >= 5000) ? parsed.silenceDetectionMs : 30000,
        voicemailDetection: parsed.voicemailDetection ?? true,
        voicemailAction: parsed.voicemailAction || "Hang up",
        voicemailMessage:
          parsed.voicemailMessage ||
          "Hello, I was calling regarding an inquiry. Please call back.",
        voiceSpeed: parsed.voiceSpeed || 1.0,
        interruptionSensitivity: parsed.interruptionSensitivity || 0.5,
        responsiveness: parsed.responsiveness || 0.5,
        emotionLevel: parsed.emotionLevel || 0.5,
        backgroundNoise: parsed.backgroundNoise || "Office",
      };
    }

    return {
      name: "Shreenika AI",
      title: "Sales Executive",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Shreenika",
      language: "English (US)",
      voiceId: "Monika (en-IN)",
      characteristics: ["Friendly", "Professional", "Persuasive"],
      age: 28,
      welcomeMessage:
        "Hello! This is Shreenika calling from the reception. How can I assist you today?",
      prompt: "",
      knowledgeBase: [],
      callingLimit: 60,
      maxCallDuration: 3600,
      silenceDetectionMs: 30000, // 30 seconds in milliseconds (backend requires 5000–60000ms)
      voicemailDetection: true,
      voicemailAction: "Hang up",
      voicemailMessage:
        "Hello, this is Shreenika. Please give us a call back when you are free.",
      voiceSpeed: 1.0,
      interruptionSensitivity: 0.5,
      responsiveness: 0.5,
      emotionLevel: 0.8,
      backgroundNoise: "Office",
      voipProvider: null,
      voipApiKey: "",
      voipSid: "",
    };
  });

  /* =========================
     LEADS & LOGS (SHARED STATE)
  ========================= */
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem("voxai_leads");
    return saved ? JSON.parse(saved) : []; // Start with empty array for new users, not mock data
  });

  const [callLogs, setCallLogs] = useState<CallLog[]>(() => {
    const saved = localStorage.getItem("voxai_logs");
    return saved ? JSON.parse(saved) : []; // Start with empty array for new users, not mock data
  });

  /* =========================
     PERSISTENCE
  ========================= */
  useEffect(() => {
    localStorage.setItem("voxai_agent", JSON.stringify(agent));
  }, [agent]);

  useEffect(() => {
    localStorage.setItem("voxai_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem("voxai_logs", JSON.stringify(callLogs));
  }, [callLogs]);

  /* =========================
     RENDER LOGIC
  ========================= */
  const renderContent = () => {
    if (window.location.pathname.startsWith("/reset-password")) {
      return <ResetPassword />;
    }

    // FIX (2026-03-31): Auth gate restored — show login if no valid token
    if (!isAuthenticated) {
      return <Auth onLogin={() => {
        setIsAuthenticated(true);
        setRoute("/agents");
      }} />;
    }

    if (route === "/onboarding") {
      return (
        <Onboarding
          setAgent={(a: AgentConfig) => {
            setAgent(a);
            localStorage.removeItem("forceOnboarding");
          }}
          navigate={navigate}
        />
      );
    }

    // FIX (2026-03-31): Changed from `const Page = () => {}` (component) to `renderPage()` (function).
    // Defining a component inside renderContent() created a NEW function type on every App render.
    // React saw a different component type → unmounted AgentManager → remounted it → fetchAgents fired
    // → setAgent(firstAgent) → App re-rendered → new Page → infinite unmount/remount = infinite flicker.
    // Calling renderPage() as a plain function returns JSX with stable imported types (AgentManager etc.)
    // so React reconciles normally and never unmounts the mounted page component.
    const renderPage = () => {
      // Admin routes
      if (isAdmin && route.startsWith("/admin")) {
        // Check for dynamic routes first
        if (route.startsWith("/admin/leads/") && route !== "/admin/leads") {
          const leadId = route.replace("/admin/leads/", "");
          return <LeadDetailsView navigate={navigate} leadId={leadId} />;
        }

        if (route.startsWith("/admin/users/") && route !== "/admin/users") {
          const userId = route.replace("/admin/users/", "");
          return <UserDetailsView navigate={navigate} userId={userId} />;
        }

        switch (route) {
          case "/admin":
            return <SuperAdminDashboard navigate={navigate} />;
          case "/admin/users":
            return <UserManagementList navigate={navigate} />;
          case "/admin/cms/privacy":
            return <CMSEditor navigate={navigate} type="privacy" />;
          case "/admin/cms/faqs":
            return <CMSEditor navigate={navigate} type="faqs" />;
          case "/admin/cms/tickets":
            return (
              <ComingSoonPage
                navigate={navigate}
                title="Support Tickets"
                description="Ticket management system coming soon"
              />
            );
          case "/admin/cms/affiliate":
            return (
              <ComingSoonPage
                navigate={navigate}
                title="Affiliate Center"
                description="Affiliate program management coming soon"
              />
            );
          default:
            return <SuperAdminDashboard navigate={navigate} />;
        }
      }

      // Regular user routes
      switch (route) {
        case "/dashboard":
          return <Dashboard logs={callLogs} leadCount={leads.length} />;
        case "/agents":
          return <AgentManager agent={agent} setAgent={setAgent} navigate={navigate} />;
        case "/knowledge":
          return <KnowledgeCenter agent={agent} setAgent={setAgent} />;
        case "/leads":
          return <LeadManager leads={leads} setLeads={setLeads} />;
        // TEMPORARILY COMMENTED OUT — Campaign section hidden
        // case "/campaigns":
        //   return <CampaignManager />;
        case "/calls":
          return (
            <CallWorkspace
              leads={leads}
              logs={callLogs}
              setLogs={setCallLogs}
              agent={agent}
            />
          );
        case "/usage":
          return <UsageBilling />;
        case "/settings":
          return <ProfileSettings />;
        default:
          return <Dashboard logs={callLogs} leadCount={leads.length} />;
      }
    };

    // Use SuperAdminLayout for admin routes, regular Layout otherwise
    if (isAdmin && route.startsWith("/admin")) {
      return (
        <SuperAdminLayout
          currentPath={route}
          navigate={navigate}
          setIsAuthenticated={setIsAuthenticated}
        >
          {renderPage()}
        </SuperAdminLayout>
      );
    }

    return (
      <Layout
        currentPath={route}
        navigate={navigate}
        setIsAuthenticated={setIsAuthenticated}
      >
        {renderPage()}
      </Layout>
    );
  };

  return <>{renderContent()}</>;
};

export default App;
