'use strict';
/**
 * Contact Service — MongoDB-backed (replaces in-memory store)
 * All methods are async and return Promises.
 */

const ContactModel = require('./contact.mongo.model');

class ContactService {

  // ── Internal helper: convert Mongoose doc → plain flat object ──────────────
  static _toFlat(doc) {
    if (!doc) return null;
    const obj = doc.toObject ? doc.toObject({ virtuals: false }) : { ...doc };
    // Expose both _id and id as the custom contactId string
    obj._id = obj.contactId;
    obj.id  = obj.contactId;
    return obj;
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────
  static async createContact(data, userId = null) {
    const contactId = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const doc = await ContactModel.create({
      contactId,
      userId:     userId || data.userId || undefined,
      firstName:  data.firstName  || '',
      lastName:   data.lastName   || '',
      email:      data.email      || '',
      phone:      data.phone      || '',
      address:    data.address    || '',
      company: {
        name:      data.company?.name      || data.companyName || '',
        employees: data.company?.employees || (data.totalEmployees ? Number(data.totalEmployees) : undefined),
        website:   data.company?.website   || data.website || '',
      },
      jobTitle:   data.jobTitle   || '',
      industry:   data.industry   || '',
      source:     data.source     || 'manual',
      status:     data.status     || 'New',
      leadScore:  data.leadScore  || 0,
      tags:       data.tags       || [],
      notes:      data.notes      || '',
    });

    return ContactService._toFlat(doc);
  }

  // ── READ ALL ───────────────────────────────────────────────────────────────
  static async getAllContacts(filters = {}, userId = null) {
    const query = {};
    if (userId)          query.userId          = userId;
    if (filters.status)  query.status          = filters.status;
    if (filters.source)  query.source          = filters.source;
    if (filters.company) query['company.name'] = new RegExp(filters.company, 'i');

    const docs = await ContactModel.find(query).sort({ createdAt: -1 });
    return docs.map(ContactService._toFlat);
  }

  // ── READ ONE ───────────────────────────────────────────────────────────────
  static async getContactById(contactId) {
    if (!contactId) return null;
    const doc = await ContactModel.findOne({ contactId });
    return ContactService._toFlat(doc);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  static async updateContact(contactId, updates) {
    const { _id, __v, id, ...safe } = updates;

    // Handle nested company merge
    const companyUpdate = {};
    if (safe.company)      companyUpdate.company = safe.company;
    if (safe.companyName)  companyUpdate['company.name']      = safe.companyName;
    if (safe.totalEmployees !== undefined) companyUpdate['company.employees'] = Number(safe.totalEmployees);
    if (safe.website)      companyUpdate['company.website']   = safe.website;

    const doc = await ContactModel.findOneAndUpdate(
      { contactId },
      { $set: { ...safe, ...companyUpdate, updatedAt: new Date() } },
      { new: true }
    );
    return ContactService._toFlat(doc);
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  static async deleteContact(contactId) {
    await ContactModel.deleteOne({ contactId });
    return true;
  }

  // ── BULK IMPORT ────────────────────────────────────────────────────────────
  static async bulkImportContacts(list, source = 'csv', userId = null) {
    const imported = [];
    const errors   = [];

    for (let i = 0; i < list.length; i++) {
      try {
        const row = list[i];
        if (!row.firstName && !row.phone) {
          errors.push({ row: i + 1, error: 'Missing firstName or phone — row skipped' });
          continue;
        }
        const contact = await ContactService.createContact({ ...row, source }, userId);
        imported.push(contact);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    return { imported, errors, total: list.length };
  }

  // ── STATUS UPDATE ──────────────────────────────────────────────────────────
  static async updateStatus(contactId, newStatus) {
    const doc = await ContactModel.findOneAndUpdate(
      { contactId },
      { $set: { status: newStatus } },
      { new: true }
    );
    return ContactService._toFlat(doc);
  }

  // ── MARK CONTACTED ─────────────────────────────────────────────────────────
  static async markContacted(contactId) {
    const doc = await ContactModel.findOneAndUpdate(
      { contactId },
      { $set: { lastContactedAt: new Date().toISOString() } },
      { new: true }
    );
    return ContactService._toFlat(doc);
  }
}

module.exports = ContactService;
