/**
 * Shreenika AI — Traditional Voice Pipeline
 * Main Express Server
 *
 * Date: 2026-03-19
 * Status: Initialization Phase (Week 1)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Cross-origin requests
app.use(express.json()); // JSON body parsing
app.use(express.urlencoded({ extended: true })); // URL-encoded body parsing

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.path}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0'
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    service: 'shreenika-ai-backend-traditional',
    status: 'running',
    apis: {
      google_cloud: 'pending-initialization',
      mongodb: 'pending-connection',
      voice_service: 'pending-initialization'
    },
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// TODO: API Routes (Week 1-2)
// - POST /api/voice/call/start
// - POST /api/voice/call/audio
// - POST /api/voice/call/end
// - GET /api/agents/:id
// - POST /api/agents
// - GET /api/sessions/:id/metrics

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: true,
    message: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString()
  });
});

// Server startup
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`[SERVER] Traditional Voice Pipeline started on port ${PORT}`);
  logger.info(`[ENVIRONMENT] ${process.env.NODE_ENV || 'development'}`);
  logger.info(`[TIMESTAMP] ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('[SHUTDOWN] SIGTERM received, closing server...');
  server.close(() => {
    logger.info('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('[SHUTDOWN] SIGINT received, closing server...');
  server.close(() => {
    logger.info('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

module.exports = app;
