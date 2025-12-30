const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

/* ---------------- PDF PARSE ---------------- */
let pdfParse;
try {
  pdfParse = require("pdf-parse");
  console.log("✅ pdf-parse loaded");
} catch {
  console.log("⚠️ pdf-parse not installed");
}

async function parsePDF(buffer) {
  if (!pdfParse) return "";
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    console.error("❌ PDF parse failed:", err.message);
    return "";
  }
}

/* ---------------- APP ---------------- */
const app = express();
const port = process.env.PORT || 10000;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://job-align-ai.vercel.app",
      /\.vercel\.app$/,
    ],
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", time: new Date().toISOString() });
});

/* ---------------- ANALYZE ---------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("🔥 /analyze called");

    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    apiKey = apiKey.trim();

    console.log("🧠 Model: gemini-1.5-flash | API v1");
    console.log("🔑 API key length:", apiKey.length);

    const jobDesc = req.body.jobDesc || "Software Engineer";
    let resumeText = "";

    if (req.file?.buffer) {
      resumeText = await parsePDF(req.file.buffer);
    }

    if (!resumeText || resumeText.length < 50) {
      resumeText =
        "Skills: Java, Python, JavaScript. Experience: Junior Developer.";
    }

    const prompt = `
You are an expert HR recruiter.

JOB DESCRIPTION:
${jobDesc}

RESUME:
${resumeText}

Respond ONLY in this format:

SCORE: <0-100>%
MISSING: <comma separated skills>
SUMMARY: <one sentence>
FEEDBACK:
- <point>
- <point>
- <point>
SEARCH_QUERY: <job title>
`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 45000,
      }
    );

    const aiText =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiText) throw new Error("Empty Gemini response");

    console.log("✅ Gemini responded");

    /* -------- PARSE -------- */
    let matchScore = 50;
    const score = aiText.match(/SCORE:\s*(\d{1,3})/i);
    if (score) matchScore = Number(score[1]);

    let missingKeywords = ["Improve profile"];
    const missing = aiText.match(/MISSING:\s*(.+)/i);
    if (missing) {
      missingKeywords = missing[1]
        .split(",")
        .map((s) => s.trim())
        .slice(0, 5);
    }

    let summary = "Analysis complete.";
    const sum = aiText.match(/SUMMARY:\s*(.+)/i);
    if (sum) summary = sum[1].trim();

    let feedback = "";
    const fb = aiText.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i);
    if (fb) feedback = fb[1].trim();

    let searchQuery = "Software Engineer";
    const q = aiText.match(/SEARCH_QUERY:\s*(.+)/i);
    if (q) searchQuery = q[1].trim();

    res.json({
      matchScore,
      missingKeywords,
      summary,
      feedback,
      searchQuery,
      jobs: [],
    });
  } catch (err) {
    console.error("❌ ERROR:", err.message);

    if (err.response) {
      console.error("🔴 STATUS:", err.response.status);
      console.error(
        "🔴 DATA:",
        JSON.stringify(err.response.data, null, 2)
      );
    }

    res.json({
      matchScore: 10,
      missingKeywords: ["AI service error"],
      summary: "Analysis failed.",
      feedback:
        "The AI service is unavailable or misconfigured. Please try again.",
      searchQuery: "Developer",
      jobs: [],
    });
  }
});

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log(`🟢 Server running on port ${port}`);
});
