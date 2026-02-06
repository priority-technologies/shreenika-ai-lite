import mongoose, { Schema, Document } from 'mongoose';

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Closed';

export interface ContactDocument extends Document {
  accountId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  companyName: string;
  totalEmployees?: number;
  address: string;
  website?: string;
  status: LeadStatus;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<ContactDocument>(
  {
    accountId: { type: String, required: true, index: true },

    firstName: { type: String, required: true },
    lastName: { type: String, required: true },

    phone: { type: String },
    email: { type: String },

    companyName: { type: String, required: true },
    totalEmployees: { type: Number },
    address: { type: String, required: true },
    website: { type: String },

    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Closed'],
      default: 'New',
    },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ContactSchema.index(
  { accountId: 1, phone: 1 },
  { unique: true, sparse: true }
);

ContactSchema.index(
  { accountId: 1, email: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model<ContactDocument>('Contact', ContactSchema);
