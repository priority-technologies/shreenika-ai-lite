import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// User Schema (inline to avoid import issues)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: "user" }
});

const User = mongoose.model("User", userSchema);

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Check if user exists
    const existing = await User.findOne({ email: "test@shreenika.ai" });
    
    if (existing) {
      console.log("⚠️  User already exists, deleting...");
      await User.deleteOne({ email: "test@shreenika.ai" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("Test@1234", 10);

    // Create user
    const user = await User.create({
      email: "test@shreenika.ai",
      password: hashedPassword,
      name: "Test User",
      role: "user"
    });

    console.log("✅ Test user created successfully!");
    console.log("📧 Email: test@shreenika.ai");
    console.log("🔑 Password: Test@1234");
    console.log("🆔 User ID:", user._id);

    // Also create an admin user
    const adminExists = await User.findOne({ email: "admin@shreenika.ai" });
    if (!adminExists) {
      const adminPassword = await bcrypt.hash("Admin@1234", 10);
      const admin = await User.create({
        email: "admin@shreenika.ai",
        password: adminPassword,
        name: "Admin User",
        role: "admin"
      });
      console.log("\n✅ Admin user created!");
      console.log("📧 Email: admin@shreenika.ai");
      console.log("🔑 Password: Admin@1234");
      console.log("🆔 Admin ID:", admin._id);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

createTestUser();