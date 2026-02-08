import React, { useState, useEffect } from "react";
import Layout from "./components/Layout";
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

import { Lead, CallLog, AgentConfig } from "./types";
import { INITIAL_LEADS, MOCK_CALL_LOGS } from "./constants";
import { apiFetch } from "./services/api";

const App: React.FC = () => {
  /* =========================
     AUTH — TOKEN IS TRUTH
  ========================= */
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const loginTime = localStorage.getItem("loginTime");

    if (token && loginTime) {
      const elapsed = Date.now() - parseInt(loginTime, 10);
      const hours48 = 48 * 60 * 60 * 1000;

      if (elapsed > hours48) {
        localStorage.removeItem("token");
        localStorage.removeItem("loginTime");
        localStorage.removeItem("user");
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
        // Refresh user data if missing (e.g., after Google login)
        if (!localStorage.getItem("user")) {
          fetchAndStoreUser();
        }
      }
    } else {
      setIsAuthenticated(false);
    }
  }, []);

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
  const [route, setRoute] = useState<string>("/dashboard");

  useEffect(() => {
    if (!isAuthenticated) {
      setRoute("/login");
    } else {
      const forceOnboarding = localStorage.getItem("forceOnboarding");
      if (forceOnboarding === "true") {
        setRoute("/onboarding");
      } else if (route === "/login") {
        setRoute("/dashboard");
      }
    }
  }, [isAuthenticated]);

  const navigate = (path: string) => {
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
      silenceDetectionMs: 15,
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
    return saved ? JSON.parse(saved) : INITIAL_LEADS;
  });

  const [callLogs, setCallLogs] = useState<CallLog[]>(() => {
    const saved = localStorage.getItem("voxai_logs");
    return saved ? JSON.parse(saved) : MOCK_CALL_LOGS;
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

    if (!isAuthenticated) {
      return (
        <Auth
          onLogin={() => {
            localStorage.setItem("loginTime", Date.now().toString());
            setIsAuthenticated(true);
            // Check if first-time signup → route to onboarding
            const shouldOnboard = localStorage.getItem("forceOnboarding") === "true";
            setRoute(shouldOnboard ? "/onboarding" : "/dashboard");
          }}
        />
      );
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

    if (!agent.voipProvider && route !== "/onboarding") {
      return <Onboarding setAgent={setAgent} navigate={navigate} />;
    }

    const Page = () => {
      switch (route) {
        case "/dashboard":
          return <Dashboard logs={callLogs} leadCount={leads.length} />;
        case "/agents":
          return <AgentManager agent={agent} setAgent={setAgent} navigate={navigate} />;
        case "/knowledge":
          return <KnowledgeCenter agent={agent} setAgent={setAgent} />;
        case "/leads":
          return <LeadManager leads={leads} setLeads={setLeads} />;
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
        case "/admin":
          return <LeadManagement />;
        case "/settings":
          return <ProfileSettings />;
        default:
          return <Dashboard logs={callLogs} leadCount={leads.length} />;
      }
    };

    return (
      <Layout
        currentPath={route}
        navigate={navigate}
        setIsAuthenticated={setIsAuthenticated}
      >
        <Page />
      </Layout>
    );
  };

  return <>{renderContent()}</>;
};

export default App;
