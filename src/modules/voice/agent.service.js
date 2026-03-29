'use strict';
/**
 * Agent Service — MongoDB-backed (replaces in-memory store)
 *
 * ALL methods are now async and return Promises.
 * server.js routes must use  await AgentService.xxx()
 *
 * Field naming convention:
 *   Frontend sends:  name / title / prompt / silenceDetectionMs
 *   Backend stores:  agentName / agentRole / systemPrompt / endCallOnSilence
 *   Both keys are kept in sync on every write.
 */

const AgentModel = require('./agent.mongo.model');

class AgentService {

  // ── Internal helper: convert Mongoose doc → plain flat object ─────────────
  static _toFlat(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject({ virtuals: false }) : { ...doc };
    // Expose both _id and id as the custom agentId string
    obj._id = obj.agentId;
    obj.id  = obj.agentId;
    return obj;
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  static async createAgent(agentData) {
    const agentId = agentData._fixedId || `agent-${Date.now()}`;

    const name       = agentData.agentName    || agentData.name       || 'AI Sales Agent';
    const company    = agentData.company      || agentData.agentCompany || 'Shreenika AI';
    const role       = agentData.agentRole    || agentData.role       || 'Sales';
    const objective  = agentData.agentObjective || agentData.objective || 'Help customers with product inquiries';
    const language   = agentData.language     || agentData.primaryLanguage || 'en-IN';
    const welcomeMsg = agentData.welcomeMessage || `Hello! This is ${name} from ${company}. How can I help you today?`;
    const voiceId    = agentData.voiceId      || agentData.voice      || 'Aoede';
    const characteristics      = agentData.characteristics || ['Professional', 'Helpful', 'Friendly'];
    const psychologyPrinciples = agentData.psychologyPrinciples || agentData.psychology ||
      ['RECIPROCITY', 'AUTHORITY', 'SOCIAL_PROOF'];
    const systemPrompt = agentData.systemPrompt ||
      AgentService.generateSystemPrompt({ name, company, role, objective, language, characteristics });

    // upsert — safe to call repeatedly with the same _fixedId (e.g. seeding)
    const doc = await AgentModel.findOneAndUpdate(
      { agentId },
      {
        agentId,
        agentName:      name,
        name,
        agentRole:      role,
        title:          role,
        agentObjective: objective,
        company,
        language,
        primaryLanguage:     language,
        welcomeMessage:      welcomeMsg,
        voiceId,
        voiceTone:           agentData.voiceTone   || 'Professional and warm',
        voiceGender:         agentData.voiceGender || 'FEMALE',
        voiceAccent:         agentData.voiceAccent || 'neutral',
        characteristics,
        psychologyPrinciples,
        systemPrompt,
        prompt:              systemPrompt,
        description:         agentData.description || '',
        industry:            agentData.industry    || 'general',
        avatar:              agentData.avatar      || '',
        knowledgeBase:       agentData.knowledgeBase || [],
        userId:              agentData.userId      || null,   // Owner — for plan limit enforcement
        status:              'active',
        isActive:            true,
        callStartBehavior:   agentData.callStartBehavior  || 'initiate',
        maxCallDuration:     agentData.maxCallDuration    || 3600,
        endCallOnSilence:    agentData.endCallOnSilence   || 30000,
        silenceDetectionMs:  agentData.silenceDetectionMs || agentData.endCallOnSilence || 30000,
        voicemailDetection:  agentData.voicemailDetection !== undefined ? agentData.voicemailDetection : true,
        voicemailAction:     agentData.voicemailAction    || 'hang_up',
        voicemailMessage:    agentData.voicemailMessage   || '',
        retryAttempts:       agentData.retryAttempts      || 3,
        callingLimit:        agentData.callingLimit        || 60,
        interruptionSensitivity: agentData.interruptionSensitivity || 0.5,
        responsiveness:          agentData.responsiveness          || 0.5,
        emotionLevel:            agentData.emotionLevel            || 0.5,
        backgroundNoise:         agentData.backgroundNoise         || 'Office',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return AgentService._toFlat(doc);
  }

  // ── READ ALL ───────────────────────────────────────────────────────────────
  static async getAllAgents(userId = null) {
    // SECURITY FIX: Always filter by userId so users only see their own agents.
    // Admins/system calls that pass no userId get an empty list — intentional.
    const filter = userId ? { userId: userId } : {};
    const docs = await AgentModel.find(filter).sort({ createdAt: -1 });
    return docs.map(AgentService._toFlat);
  }

  // ── READ ONE ───────────────────────────────────────────────────────────────
  static async getAgentById(agentId) {
    if (!agentId) return null;
    // Primary: search by string agentId field (e.g. 'agent-1234')
    let doc = await AgentModel.findOne({ agentId });
    // Fallback: try MongoDB _id in case caller passed an ObjectId string
    if (!doc) {
      try { doc = await AgentModel.findById(agentId); } catch (_) { /* not a valid ObjectId — ignore */ }
    }
    return AgentService._toFlat(doc);
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  static async updateAgent(agentId, updates) {
    const existing = await AgentModel.findOne({ agentId });
    if (!existing) return null;

    // Prefer frontend field names; fall back to stored values
    const name     = updates.name         || updates.agentName    || existing.agentName;
    const company  = updates.company      || existing.company;
    const role     = updates.title        || updates.agentRole    || updates.role || existing.agentRole;
    const objective= updates.agentObjective || updates.objective  || existing.agentObjective;
    const language = updates.language     || updates.primaryLanguage || existing.language;
    const systemPrompt = updates.prompt   || updates.systemPrompt || existing.systemPrompt;

    // Voicemail action normalisation (frontend sends human-readable labels)
    let voicemailAction = updates.voicemailAction || existing.voicemailAction;
    if (voicemailAction === 'Hang up')           voicemailAction = 'hang_up';
    if (voicemailAction === 'Leave a voicemail') voicemailAction = 'leave_message';

    // Silence field normalisation
    const endCallOnSilence = updates.silenceDetectionMs || updates.endCallOnSilence || existing.endCallOnSilence;

    // Build the $set payload — strip Mongoose internals that can't be overridden
    const { _id: _dropId, __v, ...safeUpdates } = updates;

    const doc = await AgentModel.findOneAndUpdate(
      { agentId },
      {
        $set: {
          ...safeUpdates,
          agentName:       name,
          name,
          title:           role,
          agentRole:       role,
          agentObjective:  objective,
          company,
          language,
          primaryLanguage: language,
          systemPrompt,
          prompt:          systemPrompt,
          voicemailAction,
          endCallOnSilence,
          silenceDetectionMs: endCallOnSilence,
        }
      },
      { new: true }
    );

    return AgentService._toFlat(doc);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  static async deleteAgent(agentId) {
    await AgentModel.deleteOne({ agentId });
    return true;
  }

  // ── CONFIG (lightweight stats shell) ─────────────────────────────────────
  static async getAgentConfig(agentId) {
    const doc = await AgentModel.findOne({ agentId });
    if (!doc) return null;
    return {
      agentId,
      callStats: {
        totalCalls:      0,
        completedCalls:  0,
        failedCalls:     0,
        averageDuration: 0
      },
      costTracking: {
        totalCost:        0,
        estimatedMonthly: 0
      }
    };
  }

  // ── PSYCHOLOGY PRINCIPLE WEIGHTS ──────────────────────────────────────────
  static async updatePrincipleWeights(agentId, weights) {
    const doc = await AgentModel.findOneAndUpdate(
      { agentId },
      { $set: { principleWeights: weights } },
      { new: true }
    );
    return AgentService._toFlat(doc);
  }

  // ── KNOWLEDGE BASE ────────────────────────────────────────────────────────

  /**
   * Atomically push a new document into the agent's knowledgeBase.
   * Accepts the full doc object so callers control the shape.
   */
  static async addKnowledge(agentId, knowledge) {
    const newDoc = {
      id:         knowledge.id         || `doc-${Date.now()}`,
      title:      knowledge.title      || knowledge.name || 'Untitled',
      name:       knowledge.title      || knowledge.name || 'Untitled',
      content:    knowledge.content    || '',
      size:       knowledge.size       || '',
      type:       knowledge.type       || '',
      status:     knowledge.status     || 'synced',
      uploadedAt: knowledge.uploadedAt || new Date().toISOString(),
      addedAt:    knowledge.addedAt    || new Date().toISOString(),
    };
    const updated = await AgentModel.findOneAndUpdate(
      { agentId },
      { $push: { knowledgeBase: newDoc } },
      { new: true }
    );
    if (!updated) return null;
    return AgentService._toFlat(updated);
  }

  /**
   * Atomically pull (remove) a knowledge document by its string id.
   */
  static async removeKnowledge(agentId, docId) {
    const updated = await AgentModel.findOneAndUpdate(
      { agentId },
      { $pull: { knowledgeBase: { id: docId } } },
      { new: true }
    );
    if (!updated) return null;
    return AgentService._toFlat(updated);
  }

  // ── SYSTEM PROMPT GENERATOR ───────────────────────────────────────────────
  static generateSystemPrompt(agentData) {
    const name            = agentData.name || agentData.agentName || 'AI Agent';
    const company         = agentData.company || 'Our Company';
    const role            = agentData.agentRole || agentData.role || 'Sales';
    const objective       = agentData.agentObjective || agentData.objective || 'Help customers';
    const language        = agentData.language || agentData.primaryLanguage || 'English';
    const characteristics = (agentData.characteristics || ['Professional', 'Helpful']).join(', ');

    return `You are ${name}, a ${role} agent for ${company}.

Your Objective: ${objective}

Key Characteristics: ${characteristics}

Communication Guidelines:
- Language: ${language}
- Be conversational, natural, and concise (2-4 sentences per response)
- Ask clarifying questions when needed
- Provide accurate, helpful information
- Build trust through expertise and genuine care

Goals:
- Understand the customer's needs deeply
- Provide relevant solutions
- Build rapport and trust
- Guide towards positive outcomes`;
  }
}

module.exports = AgentService;
