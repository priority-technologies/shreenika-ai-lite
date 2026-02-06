import Contact from '../models/Contact.model';

export const createContact = async (data: any) => {
  const { accountId, phone, email } = data;

  if (!phone && !email) {
    throw new Error('Either phone or email is required');
  }

  const existing = await Contact.findOne({
    accountId,
    isDeleted: false,
    $or: [
      phone ? { phone } : null,
      email ? { email } : null,
    ].filter(Boolean),
  });

  if (existing) {
    throw new Error('Lead already exists');
  }

  return Contact.create(data);
};

export const bulkCreateContacts = async (
  accountId: string,
  leads: any[]
) => {
  const results = [];

  for (const lead of leads) {
    try {
      const created = await createContact({ ...lead, accountId });
      results.push(created);
    } catch {
      continue;
    }
  }

  return results;
};

export const getContacts = async (accountId: string) => {
  return Contact.find({ accountId, isDeleted: false }).sort({ createdAt: -1 });
};

export const updateContact = async (
  id: string,
  accountId: string,
  updates: any
) => {
  return Contact.findOneAndUpdate(
    { _id: id, accountId, isDeleted: false },
    updates,
    { new: true }
  );
};

export const softDeleteContact = async (
  id: string,
  accountId: string
) => {
  return Contact.findOneAndUpdate(
    { _id: id, accountId },
    { isDeleted: true },
    { new: true }
  );
};
