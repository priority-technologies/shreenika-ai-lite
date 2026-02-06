import express from "express";
import { requireAuth } from "../auth/auth.middleware.js";

import upload, {
  csvUploadMiddleware
} from "../../middlewares/csvUpload.middleware.js";

import {
  createContact,
  getContacts,
  updateContact,
  deleteContact,
  importContactsCSV
} from "./contact.controller.js";

const router = express.Router();

/* =========================
   CREATE CONTACT (MANUAL)
========================= */
router.post(
  "/",
  requireAuth,
  createContact
);

/* =========================
   GET CONTACTS (LIST / SEARCH)
========================= */
router.get(
  "/",
  requireAuth,
  getContacts
);

/* =========================
   UPDATE CONTACT
========================= */
router.put(
  "/:id",
  requireAuth,
  updateContact
);

/* =========================
   DELETE CONTACT
========================= */
router.delete(
  "/:id",
  requireAuth,
  deleteContact
);

/* =========================
   IMPORT CONTACTS (CSV)
========================= */
router.post(
  "/import",
  requireAuth,
  upload.single("file"),
  csvUploadMiddleware,
  importContactsCSV
);

export default router;
