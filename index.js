const express = require("express");
const cors = require("cors");
const multer = require("multer");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

/* ---------------- APP ---------------- */
const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- GEMINI SDK ---------------- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ⚠️ THIS IS THE ONLY MODEL THAT WORKS WITH SDK RIGHT NOW
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

/* ---------------- PROOF ---------------- */
app.get("/whoami", (req, res) => {
  res.json({
    backend: "RENDER-BACKEND-FINAL-SDK",
    api: "v1beta (SDK enforced)",
    model: "gemini-1.5-flash",
    time: new Date().toISOString(),
  });
});

/* ---------------- ANALYZE ---------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("🔥 /analyze HIT (SDK FINAL)");

    const jobDesc = req.body.jobDesc || "Software Engineer";

    const prompt = `
You are an expert HR recruiter.

JOB DESCRIPTION:
${jobDesc}

Respond in this format:

SCORE: <0-100>%
MISSING: <skills>
SUMMARY:
FEEDBACK:
SEARCH_QUERY:
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("✅ GEMINI SDK RESPONDED");

    return res.json({
      matchScore: 70,
      missingKeywords: ["Example"],
      summary: "Gemini working correctly",
      feedback: text,
      searchQuery: "Software Engineer",
      jobs: [],
    });
  } catch (err) {
    console.error("❌ SDK ERROR:", err.message);

    return res.json({
      matchScore: 10,
      missingKeywords: ["SDK_ERROR"],
      summary: "Gemini failed",
      feedback: err.message,
      searchQuery: "Job Search",
      jobs: [],
    });
  }
});

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER RUNNING (SDK FINAL)");
});
