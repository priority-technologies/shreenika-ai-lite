import Contact from "./contact.model.js";

/* =========================
   CREATE CONTACT
========================= */
export const createContactService = async (ownerUserId, data) => {
  const contact = await Contact.create({
    ...data,
    ownerUserId,
    source: "manual"
  });

  return contact;
};

/* =========================
   GET CONTACTS (LIST + SEARCH)
========================= */
export const getContactsService = async (ownerUserId, search) => {
  const query = { ownerUserId };

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { "company.name": { $regex: search, $options: "i" } }
    ];
  }

  return Contact.find(query).sort({ createdAt: -1 });
};

/* =========================
   BULK IMPORT CONTACTS
========================= */
export const importContactsService = async (ownerUserId, contacts) => {
  const formattedContacts = contacts.map((contact) => ({
    ...contact,
    ownerUserId,
    source: "csv"
  }));

  return Contact.insertMany(formattedContacts);
};
