import { Request, Response } from 'express';
import * as ContactService from '../services/contacts.service';

export const createLead = async (req: Request, res: Response) => {
  try {
    const lead = await ContactService.createContact({
      ...req.body,
      accountId: req.user.accountId,
    });
    res.status(201).json(lead);
  } catch (err: any) {
    res.status(409).json({ message: err.message });
  }
};

export const bulkUploadLeads = async (req: Request, res: Response) => {
  const leads = req.body.leads || [];
  const created = await ContactService.bulkCreateContacts(
    req.user.accountId,
    leads
  );
  res.json({ inserted: created.length });
};

export const listLeads = async (req: Request, res: Response) => {
  const leads = await ContactService.getContacts(req.user.accountId);
  res.json(leads);
};

export const updateLead = async (req: Request, res: Response) => {
  const updated = await ContactService.updateContact(
    req.params.id,
    req.user.accountId,
    req.body
  );
  res.json(updated);
};

export const deleteLead = async (req: Request, res: Response) => {
  await ContactService.softDeleteContact(
    req.params.id,
    req.user.accountId
  );
  res.status(204).send();
};
