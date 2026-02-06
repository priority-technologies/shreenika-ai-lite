import vision from "@google-cloud/vision";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS missing");
}

export const visionClient = new vision.ImageAnnotatorClient();
