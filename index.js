const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

/* -------------------- PDF PARSER -------------------- */
let pdfParse;
try {
  pdfParse = require("pdf-parse");
  console.log("✅ pdf-parse loaded");
} catch (e) {
  console.warn("⚠️ pdf-parse not available");
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

/* -------------------- APP SETUP -------------------- */
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

/* -------------------- HEALTH CHECK -------------------- */
app.get("/", (req, res) => {
  res.json({
    status: "🟢 Server running",
    time: new Date().toISOString(),
  });
});

/* -------------------- ANALYZE ENDPOINT -------------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("\n🔥 New /analyze request");

    /* -------- API KEY -------- */
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing");
    apiKey = apiKey.trim();

    console.log("🧠 Using model: gemini-1.5-flash | API v1");

    /* -------- INPUT -------- */
    const jobDesc = req.body.jobDesc || "Software Engineer";
    let resumeText = "";

    if (req.file?.buffer) {
      resumeText = await parsePDF(req.file.buffer);
    }

    if (!resumeText || resumeText.length < 50) {
      resumeText =
        "Skills: Java, Python, React. Experience: Junior Software Developer.";
    }

    /* -------- PROMPT -------- */
    const prompt = `
You are an expert HR recruiter.

Compare the RESUME with the JOB DESCRIPTION.

JOB DESCRIPTION:
${jobDesc}

RESUME:
${resumeText}

Respond STRICTLY in this format:

SCORE: <0-100>%
MISSING: <3-5 missing skills, comma separated>
SUMMARY: <1 sentence>
FEEDBACK:
- <point 1>
- <point 2>
- <point 3>
SEARCH_QUERY: <job title>
`;

    /* -------- GEMINI CALL (CORRECT) -------- */
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

    if (!aiText) throw new Error("Empty AI response");

    console.log("✅ Gemini response received");

    /* -------- PARSING -------- */
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})/i);
    if (scoreMatch) matchScore = Number(scoreMatch[1]);

    let missingKeywords = ["Improve overall profile"];
    const missingMatch = aiText.match(/MISSING:\s*(.+)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1]
        .split(",")
        .map((s) => s.trim())
        .slice(0, 5);
    }

    let summary = "Analysis completed.";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+)/i);
    if (summaryMatch) summary = summaryMatch[1].trim();

    let feedback = "";
    const feedbackMatch = aiText.match(
      /FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i
    );
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim();

    /* -------- SUCCESS -------- */
    res.json({
      matchScore,
      missingKeywords,
      summary,
      feedback,
      searchQuery,
      jobs: [],
    });
  } catch (error) {
    console.error("❌ ANALYZE ERROR:", error.message);

    if (error.response) {
      console.error(
        "🔍 Gemini Error:",
        JSON.stringify(error.response.data, null, 2)
      );
    }

    /* -------- SAFE MODE -------- */
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

/* -------------------- START SERVER -------------------- */
app.listen(port, "0.0.0.0", () => {
  console.log(`🟢 Server live on port ${port}`);
});
