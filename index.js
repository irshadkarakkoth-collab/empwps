const functions = require("firebase-functions");
const admin = require("firebase-admin");
const app = require("./app");

admin.initializeApp();

// Expose the entire Express app as a single Cloud Function
exports.api = functions
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onRequest(app);
