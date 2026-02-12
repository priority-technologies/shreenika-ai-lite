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
  checkAdminStatus,
  changeAccountType,
  exportUserData,
  getCMSContent,
  updateCMSContent,
  getUserLeads,
  getLeadDetails
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
router.put("/users/:userId/account-type", changeAccountType);
router.get("/users/:userId/export", exportUserData);
router.get("/users/:userId/leads", getUserLeads);

// Lead Management - User's contacts
router.get("/users/:userId/contacts", getUserContacts);

// Lead Management - Contact's calls (with recordings)
router.get("/users/:userId/contacts/:contactId/calls", getContactCalls);

// Lead Management - Specific lead details
router.get("/leads/:leadId", getLeadDetails);

// CMS Management
router.get("/cms/:type", getCMSContent);
router.post("/cms/:type", updateCMSContent);

// Usage management
router.post("/usage/reset", resetUsage);
router.post("/usage/unlock", unlockUsage);

export default router;
