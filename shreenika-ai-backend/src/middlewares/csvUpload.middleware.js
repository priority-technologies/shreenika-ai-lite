import multer from "multer";
import fs from "fs";
import csv from "csv-parser";

/**
 * Multer config – store file temporarily
 */
const upload = multer({
  dest: "tmp/",
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/**
 * CSV parsing middleware
 */
export const csvUploadMiddleware = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "CSV file is required" });
  }

  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      results.push({
        firstName: data.firstName || data.FirstName || "",
        lastName: data.lastName || data.LastName || "",
        email: data.email || "",
        phone: data.phone || "",
        companyName: data.companyName || "",
        totalEmployees: data.totalEmployees
          ? Number(data.totalEmployees)
          : undefined,
        address: data.address || "",
        website: data.website || ""
      });
    })
    .on("end", () => {
      fs.unlinkSync(req.file.path); // cleanup temp file
      req.file.parsedContacts = results;
      next();
    })
    .on("error", (err) => {
      console.error("CSV parse error:", err);
      return res.status(500).json({ error: "CSV parsing failed" });
    });
};

export default upload;
