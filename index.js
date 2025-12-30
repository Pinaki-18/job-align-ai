const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", backend: "REST-v1-STABLE" });
});

/* ---------------- FIND WORKING MODEL ---------------- */
async function getWorkingModel(apiKey) {
  const listUrl =
    `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;

  const res = await axios.get(listUrl);
  const models = res.data.models || [];

  const usable = models.find(m =>
    m.supportedGenerationMethods?.includes("generateContent")
  );

  if (!usable) {
    throw new Error("NO_SUPPORTED_MODEL_FOUND");
  }

  return usable.name; // e.g. models/gemini-1.0-pro
}

/* ---------------- ANALYZE ---------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("🔥 /analyze (REST v1)");

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("API_KEY_MISSING");

    const jobDesc = req.body.jobDesc || "Software Engineer";

    const modelName = await getWorkingModel(apiKey);
    console.log("🧠 USING MODEL:", modelName);

    const prompt = `
You are an expert HR recruiter.

JOB DESCRIPTION:
${jobDesc}

Respond EXACTLY as:
SCORE: <0-100>%
MISSING: <skills>
SUMMARY:
FEEDBACK:
SEARCH_QUERY:
`;

    const url =
      `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ]
    });

    const text =
      response.data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("EMPTY_AI_RESPONSE");

    return res.json({
      matchScore: 72,
      missingKeywords: ["Example"],
      summary: "REST v1 working",
      feedback: text,
      searchQuery: "Software Engineer",
      jobs: [],
    });

  } catch (err) {
    console.error("❌ FINAL ERROR:", err.message);

    return res.json({
      matchScore: 10,
      missingKeywords: ["AI_ERROR"],
      summary: "Analysis failed",
      feedback: err.message,
      searchQuery: "Job Search",
      jobs: [],
    });
  }
});

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER RUNNING (REST v1 STABLE)");
});
