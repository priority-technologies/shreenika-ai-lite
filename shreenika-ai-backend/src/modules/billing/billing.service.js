import Call from "../call/call.model.js";
import Usage from "../usage/usage.model.js";
import Invoice from "./invoice.model.js";
import { CALL_PRICING } from "./plans.config.js";

// Use centralized pricing from config
const OUTBOUND_RATE = CALL_PRICING.outbound.totalPerMinute;
const INBOUND_RATE = CALL_PRICING.inbound.totalPerMinute;

/* =========================
   HELPERS
========================= */
const getMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const ceilMinutes = (seconds) => Math.ceil(seconds / 60);

/* =========================
   USAGE SUMMARY
========================= */
export const getUsageSummary = async (userId, month = getMonthKey()) => {
  const calls = await Call.find({
    userId,
    archived: false,
    createdAt: {
      $gte: new Date(`${month}-01T00:00:00Z`),
      $lt: new Date(`${month}-31T23:59:59Z`)
    }
  });

  let inboundMinutes = 0;
  let outboundMinutes = 0;

  calls.forEach((call) => {
    const mins = ceilMinutes(call.durationSeconds || 0);
    if (call.direction === "INBOUND") inboundMinutes += mins;
    if (call.direction === "OUTBOUND") outboundMinutes += mins;
  });

  const inboundCost = inboundMinutes * INBOUND_RATE;
  const outboundCost = outboundMinutes * OUTBOUND_RATE;
  const totalAmount = inboundCost + outboundCost;

  return {
    month,
    inboundMinutes,
    outboundMinutes,
    inboundCost,
    outboundCost,
    totalAmount
  };
};

/* =========================
   MONTHLY INVOICE
========================= */
export const generateMonthlyInvoice = async (userId, month) => {
  const usage = await getUsageSummary(userId, month);

  // Calculate breakdown separately for inbound and outbound
  // Inbound: 40% LLM, 20% STT, 20% TTS, 0% Infrastructure
  // Outbound: 40% LLM, 20% STT, 20% TTS, 20% Infrastructure
  const inboundBreakdown = {
    llm: usage.inboundMinutes * CALL_PRICING.inbound.breakdown.llm,
    stt: usage.inboundMinutes * CALL_PRICING.inbound.breakdown.stt,
    tts: usage.inboundMinutes * CALL_PRICING.inbound.breakdown.tts,
    infrastructure: 0 // Inbound has no infrastructure cost
  };

  const outboundBreakdown = {
    llm: usage.outboundMinutes * CALL_PRICING.outbound.breakdown.llm,
    stt: usage.outboundMinutes * CALL_PRICING.outbound.breakdown.stt,
    tts: usage.outboundMinutes * CALL_PRICING.outbound.breakdown.tts,
    infrastructure: usage.outboundMinutes * CALL_PRICING.outbound.breakdown.infra
  };

  // Combined breakdown
  const breakdown = {
    llm: inboundBreakdown.llm + outboundBreakdown.llm,
    stt: inboundBreakdown.stt + outboundBreakdown.stt,
    tts: inboundBreakdown.tts + outboundBreakdown.tts,
    infrastructure: outboundBreakdown.infrastructure
  };

  const invoice = await Invoice.findOneAndUpdate(
    { userId, month },
    {
      inboundMinutes: usage.inboundMinutes,
      outboundMinutes: usage.outboundMinutes,
      inboundCost: usage.inboundCost,
      outboundCost: usage.outboundCost,
      totalAmount: usage.totalAmount,
      breakdown,
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return invoice;
};
