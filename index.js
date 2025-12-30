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

/* ---------------- GEMINI (FORCE v1) ---------------- */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
  apiVersion: "v1", // 🔴 THIS IS CRITICAL
});

const model = genAI.getGenerativeModel({
  model: "models/gemini-1.5-pro-001", // 🔴 FULL VERSIONED ID
});

/* ---------------- PROOF ---------------- */
app.get("/whoami", (req, res) => {
  res.json({
    backend: "RENDER-BACKEND-V5-FINAL",
    apiVersion: "v1",
    model: "models/gemini-1.5-pro-001",
    time: new Date().toISOString(),
  });
});

/* ---------------- ANALYZE ---------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("🔥 /analyze HIT (FINAL)");

    const jobDesc = req.body.jobDesc || "Software Engineer";

    const prompt = `
You are an expert HR recruiter.

JOB DESCRIPTION:
${jobDesc}

Give output EXACTLY as:

SCORE: <0-100>%
MISSING: <skills>
SUMMARY:
FEEDBACK:
SEARCH_QUERY:
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("✅ GEMINI RESPONDED");

    return res.json({
      matchScore: 75,
      missingKeywords: ["Sample"],
      summary: "Gemini is finally working",
      feedback: text,
      searchQuery: "Software Engineer",
      jobs: [],
    });
  } catch (err) {
    console.error("❌ FINAL ERROR:", err.message);

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
  console.log("🟢 SERVER RUNNING (FINAL FIX)");
});
