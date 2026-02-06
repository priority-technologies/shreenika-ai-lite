import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: String,
  status: { type: String, default: "New" },
  company: {
    name: String,
    employees: Number,
    website: String
  }
}, { timestamps: true });

leadSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.userId;
    return ret;
  }
});

export default mongoose.model("Lead", leadSchema);