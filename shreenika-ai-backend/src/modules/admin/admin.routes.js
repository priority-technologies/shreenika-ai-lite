import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireSuperAdmin } from "./admin.middleware.js";
import {
  listUsers,
  getUserDetails,
  getUserContacts,
  getContactCalls,
  suspendUser,
  activateUser,
  checkAdminStatus
} from "./admin.controller.js";
import {
  resetUsage,
  unlockUsage
} from "./usage.controller.js";

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Check admin status (available to all authenticated users)
router.get("/status", checkAdminStatus);

// All routes below require super admin privileges
router.use(requireSuperAdmin);

// User management
router.get("/users", listUsers);
router.get("/users/:userId", getUserDetails);
router.post("/users/:userId/suspend", suspendUser);
router.post("/users/:userId/activate", activateUser);

// Lead Management - User's contacts
router.get("/users/:userId/contacts", getUserContacts);

// Lead Management - Contact's calls (with recordings)
router.get("/users/:userId/contacts/:contactId/calls", getContactCalls);

// Usage management
router.post("/usage/reset", resetUsage);
router.post("/usage/unlock", unlockUsage);

export default router;
