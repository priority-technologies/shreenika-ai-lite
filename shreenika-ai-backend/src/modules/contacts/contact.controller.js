import Contact from "./contact.model.js";
import {
  createContactService,
  getContactsService,
  importContactsService
} from "./contact.service.js";
import { webhookEmitter } from "../webhook/webhook.emitter.js";

/* =========================
   CREATE CONTACT (MANUAL)
========================= */
export const createContact = async (req, res) => {
  try {
    const contact = await createContactService(req.user.id, req.body);

    // Trigger webhook event
    webhookEmitter.onContactCreated(req.user.id, contact).catch((err) =>
      console.error("❌ Webhook error:", err.message)
    );

    return res.status(201).json(contact);
  } catch (err) {
    console.error("CREATE CONTACT ERROR:", err);
    return res.status(500).json({ message: "Unable to create contact" });
  }
};

/* =========================
   GET CONTACTS
========================= */
export const getContacts = async (req, res) => {
  try {
    const { search } = req.query;
    const contacts = await getContactsService(req.user.id, search);
    return res.json(contacts);
  } catch (err) {
    console.error("GET CONTACTS ERROR:", err);
    return res.status(500).json({ message: "Unable to fetch contacts" });
  }
};

/* =========================
   UPDATE CONTACT
========================= */
export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Contact.findOneAndUpdate(
      { _id: id, ownerUserId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Contact not found" });
    }

    // Map MongoDB _id to id for frontend compatibility
    return res.json({
      ...updated.toObject(),
      id: updated._id.toString()
    });
  } catch (err) {
    console.error("UPDATE CONTACT ERROR:", err);
    return res.status(500).json({ message: "Unable to update contact" });
  }
};

/* =========================
   DELETE CONTACT
========================= */
export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Contact.findOneAndDelete({
      _id: id,
      ownerUserId: req.user.id
    });

    if (!deleted) {
      return res.status(404).json({ message: "Contact not found" });
    }

    return res.json({ message: "Contact deleted successfully" });
  } catch (err) {
    console.error("DELETE CONTACT ERROR:", err);
    return res.status(500).json({ message: "Unable to delete contact" });
  }
};

/* =========================
   IMPORT CONTACTS (CSV)
========================= */
export const importContactsCSV = async (req, res) => {
  try {
    const contacts = req.file.parsedContacts;
    const result = await importContactsService(req.user.id, contacts);

    return res.status(201).json({
      message: "Contacts imported successfully",
      count: result.length
    });
  } catch (err) {
    console.error("IMPORT CONTACTS ERROR:", err);
    return res.status(500).json({ message: "CSV import failed" });
  }
};
