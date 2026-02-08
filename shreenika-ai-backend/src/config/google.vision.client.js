import vision from "@google-cloud/vision";

let visionClient = null;
try {
  visionClient = new vision.ImageAnnotatorClient();
  console.log("✅ Google Vision client initialized");
} catch (err) {
  console.warn("⚠️ Google Vision client not available:", err.message);
}

export { visionClient };

