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

  // Map MongoDB _id to id for frontend compatibility
  return {
    ...contact.toObject(),
    id: contact._id.toString()
  };
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

  const contacts = await Contact.find(query).sort({ createdAt: -1 });

  // Map MongoDB _id to id for frontend compatibility
  return contacts.map(contact => ({
    ...contact.toObject(),
    id: contact._id.toString()
  }));
};

/* =========================
   BULK IMPORT CONTACTS
========================= */
export const importContactsService = async (ownerUserId, contacts) => {
  const formattedContacts = contacts.map((contact) => {
    // Transform flat CSV fields to nested schema structure
    const { companyName, totalEmployees, website, ...rest } = contact;
    return {
      ...rest,
      company: {
        name: companyName || "",
        employees: totalEmployees || undefined,
        website: website || ""
      },
      ownerUserId,
      source: "csv"
    };
  });

  const inserted = await Contact.insertMany(formattedContacts);

  // Map MongoDB _id to id for frontend compatibility
  return inserted.map(contact => ({
    ...contact.toObject(),
    id: contact._id.toString()
  }));
};
