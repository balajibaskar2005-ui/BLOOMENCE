const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config(); // Load environment variables

// --- Step 1: Load Firebase Service Account from env (JSON string or file path) ---
const serviceAccountInput = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// Ensure the value exists
if (!serviceAccountInput) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not defined in .env file.");
}

// --- Step 2: Read and parse the service account JSON (from JSON string OR file) ---
let serviceAccount;
try {
  const trimmed = serviceAccountInput.trim();
  if (trimmed.startsWith("{")) {
    // Treat as JSON string from environment
    serviceAccount = JSON.parse(trimmed);
  } else {
    // Treat as file path
    const resolvedPath = path.resolve(serviceAccountInput);
    const fileContents = fs.readFileSync(resolvedPath, "utf8");
    serviceAccount = JSON.parse(fileContents);
  }
  // Normalize private_key newlines if provided as escaped \n
  if (serviceAccount && typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
} catch (err) {
  console.error("❌ Error reading or parsing Firebase service account JSON:", err);
  throw new Error("Invalid Firebase Service Account JSON format in environment variable.");
}

// --- Step 3: Initialize Firebase Admin SDK ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized successfully.");
}

// --- Step 4: Middleware to verify Firebase ID Token ---
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing Bearer token" });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next(); // proceed to next middleware or route
  } catch (error) {
    console.error("❌ Firebase token verification failed:", error);
    return res.status(403).json({ error: "Forbidden: Invalid or expired token" });
  }
};

// --- Step 5: Export the initialized admin object (optional) ---
module.exports = { verifyToken, admin };