import React, { useEffect, useState } from "react";
import CallManager from "../CallManager";
import { apiFetch } from "../../services/api";
import { Lead, CallLog, AgentConfig } from "../../types";

/**
 * CallWorkspace
 * ------------------
 * This file is the SINGLE SOURCE OF TRUTH for:
 * - Leads (Contacts)
 * - Call logs
 * - Agent selection
 *
 * CallManager MUST NEVER fetch leads itself.
 */

const CallWorkspace: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // TEMP: selected agent (later comes from Agent Management)
  const [agent, setAgent] = useState<AgentConfig | null>(null);

  /* =========================
     LOAD LEADS (CONTACTS)
  ========================= */
  const loadLeads = async () => {
    const data = await apiFetch("/contacts");
    // Backend returns { success: true, contacts: [...] } — extract array and normalize _id → id
    const raw = Array.isArray(data) ? data : (data.contacts || []);
    setLeads(raw.map((c: any) => ({ ...c, id: c.id || c._id?.toString() })));
  };

  /* =========================
     LOAD CALL LOGS
  ========================= */
  const loadCalls = async () => {
    const data = await apiFetch("/calls");
    // Backend returns { success: true, calls: [...] } — extract array and normalize _id → id
    const raw = Array.isArray(data) ? data : (data.calls || []);
    setLogs(raw.map((c: any) => ({ ...c, id: c.id || c._id?.toString() })));
  };

  /* =========================
     LOAD AGENT (PRIMARY)
     Rule: first created agent
  ========================= */
  const loadAgent = async () => {
    const response = await apiFetch("/api/voice/agents");
    // Backend returns { success: true, agents: [...] } — not a plain array
    const agents = response.agents || (Array.isArray(response) ? response : []);
    if (agents.length > 0) {
      setAgent(agents[0]); // as per your rule
    }
  };

  /* =========================
     INITIAL LOAD
  ========================= */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadLeads(),
          loadCalls(),
          loadAgent()
        ]);
      } catch (err) {
        console.error("CallWorkspace load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* =========================
     SAFETY CHECKS
  ========================= */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Loading Call Workspace...
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        No AI Agent found. Please create an agent first.
      </div>
    );
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <CallManager
      leads={leads}
      logs={logs}
      setLogs={setLogs}
      agent={agent}
    />
  );
};

export default CallWorkspace;
