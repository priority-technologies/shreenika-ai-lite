'use strict';
/**
 * stream-meta.js — Shared in-memory store for Twilio stream parameters
 *
 * Problem: Cloud Run's HTTP/2 proxy strips query-string from WebSocket upgrade
 * requests. So wss://host/twilio-stream?agentId=X arrives as req.url="/twilio-stream"
 * with agentId=null.
 *
 * Solution:
 *  WRITE → POST /twilio/voice (HTTP — query params intact) stores:
 *            streamMeta.set(CallSid, { agentId, campaignId })
 *  READ  → wssTwilio 'start' message handler reads:
 *            streamMeta.get(callSid)
 *
 * Node.js module cache ensures both files share the same Map instance.
 */
module.exports = new Map(); // CallSid → { agentId, campaignId }
