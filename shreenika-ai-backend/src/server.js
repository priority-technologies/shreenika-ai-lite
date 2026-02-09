import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import passport from "passport";
import { createServer } from "http";
import { Server } from "socket.io";
//import "./config/passport.js";
import { initPassport } from "./config/passport.js";

import authRoutes from "./modules/auth/auth.routes.js";
import agentRoutes from "./modules/agent/agent.routes.js";
import leadRoutes from "./modules/lead/lead.routes.js";
import callRoutes from "./modules/call/call.routes.js";
import twilioRoutes from "./modules/call/twilio.routes.js";
import knowledgeRoutes from "./modules/knowledge/knowledge.routes.js";
import billingRoutes from "./modules/billing/billing.routes.js";
import stripeRoutes from "./modules/billing/stripe.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import contactRoutes from "./modules/contacts/contact.routes.js";
import voipRoutes from "./modules/voip/voip.routes.js";
import apiKeyRoutes from "./modules/apikey/apikey.routes.js";
import apiV1Routes from "./modules/apikey/api-v1.routes.js";
import { createMediaStreamServer } from "./modules/call/mediastream.handler.js";

/* =======================
   APP & SERVER CREATION
======================= */
const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);
initPassport();
app.use(passport.initialize());

/* =======================
   SERVER STARTUP (MOVED TO TOP - CRITICAL FOR CLOUD RUN)
======================= */
const PORT = process.env.PORT || 8080;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   SHREENIKA AI - BACKEND STARTED       ║");
  console.log("╚════════════════════════════════════════╝");
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || "http://localhost:3000"}`);
  console.log("════════════════════════════════════════");
});

/* =======================
   WEBSOCKET SETUP (AFTER SERVER START)
======================= */
export const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean),
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("✅ WebSocket client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ WebSocket client disconnected:", socket.id);
  });
});

/* =======================
   MEDIA STREAM WEBSOCKET (Twilio)
======================= */
//createMediaStreamServer(httpServer);

/* =======================
   CORS CONFIG (PRODUCTION)
======================= */
const allowedOrigins = [
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  process.env.PUBLIC_BASE_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy violation"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* =======================
   BODY PARSING
======================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =======================
   REQUEST LOGGING
======================= */
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

/* =======================
   DATABASE CONNECTION (AFTER SERVER START - NO EXIT ON FAIL)
======================= */
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    console.log("⚠️ Server will continue running without database");
    // DO NOT EXIT - Let server stay alive for Cloud Run health check
  });

/* =======================
   HEALTH CHECK
======================= */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Shreenika AI Backend",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

/* =======================
   ROUTES
======================= */
app.use("/auth", authRoutes);
app.use("/stripe", stripeRoutes);
app.use("/twilio", twilioRoutes);
app.use("/billing", billingRoutes);
app.use("/admin", adminRoutes);
app.use("/agents", agentRoutes);
app.use("/leads", leadRoutes);
app.use("/contacts", contactRoutes);
app.use("/calls", callRoutes);
app.use("/knowledge", knowledgeRoutes);
app.use("/ai", aiRoutes);
app.use("/voip", voipRoutes);
app.use("/api/agents", agentRoutes);
app.use("/settings/api-keys", apiKeyRoutes);
app.use("/api/v1", apiV1Routes);

/* =======================
   ERROR HANDLING
======================= */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

app.use((err, req, res, next) => {
  console.error("❌ ERROR:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.message === "CORS policy violation") {
    return res.status(403).json({
      error: "CORS policy violation",
      allowedOrigins,
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Invalid token",
    });
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

/* =======================
   GRACEFUL SHUTDOWN
======================= */
const gracefulShutdown = () => {
  console.log("\n🛑 Shutting down gracefully...");
  httpServer.close(() => {
    console.log("✅ HTTP server closed");
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error("❌ Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
  gracefulShutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ UNHANDLED REJECTION at:", promise, "reason:", reason);
});

export default app;
