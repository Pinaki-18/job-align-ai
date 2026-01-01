const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;

/* ---------------- BASIC SETUP ---------------- */
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- STORAGE ---------------- */
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "analyses.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

function readAnalyses() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function writeAnalyses(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ---------------- RATE LIMIT ---------------- */
const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", feature: "STEP-5-SAVE-SHARE" });
});

/* ---------------- MODEL DISCOVERY ---------------- */
async function getWorkingModel(apiKey) {
  const res = await axios.get(
    `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
  );
  const model = res.data.models.find(m =>
    m.supportedGenerationMethods?.includes("generateContent")
  );
  if (!model) throw new Error("NO_SUPPORTED_MODEL");
  return model.name;
}

/* ---------------- ANALYZE ---------------- */
app.post(
  "/analyze",
  analyzeLimiter,
  upload.single("resume"),
  async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey) throw new Error("API_KEY_MISSING");

      const jobDesc = (req.body.jobDesc || "").trim();
      const modelName = await getWorkingModel(apiKey);

      const prompt = `
You are an expert recruiter.

JOB DESCRIPTION:
${jobDesc}

Respond strictly in this format:

SCORE: <0-100>%
MISSING: <comma separated>
SUMMARY: <one sentence>
FEEDBACK:
- <point>
- <point>
- <point>
SEARCH_QUERY: <job title>

BREAKDOWN:
STRENGTHS: <comma separated>
PARTIAL: <comma separated>
WEAK: <comma separated>

RESUME_TIPS:
You MUST always give resume improvement tips.

- <tip>
- <tip>
- <tip>
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`,
        { contents: [{ role: "user", parts: [{ text: prompt }] }] }
      );

      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("EMPTY_AI_RESPONSE");

      /* -------- FIXED PARSING -------- */
      // Fixes the 50% bug by using \D* to skip any symbols/brackets before the number
      const matchScore = Number(text.match(/SCORE:\D*(\d{1,3})/i)?.[1]) || 50;

      // Fixes messy keywords by stripping out "(e.g.", "specific", etc.
      let missingKeywords = [];
      const missingMatch = text.match(/MISSING:\s*(.+?)(?=\n|SUMMARY:|FEEDBACK:|SEARCH_QUERY:|$)/i);
      if (missingMatch) {
        missingKeywords = missingMatch[1]
          .replace(/\(.*?\)|e\.g\.|specific|technologies|tools|experience/gi, '') 
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 2) 
          .slice(0, 6);
      }

      const summary = text.match(/SUMMARY:\s*(.+)/i)?.[1]?.trim() || "";

      const feedback = text.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i)?.[1]?.trim() || "";

      const searchQuery = text.match(/SEARCH_QUERY:\D*(.+)/i)?.[1]?.trim() || "Software Engineer";

      const scoreBreakdown = {
        strengths: text.match(/STRENGTHS:\D*(.+)/i)?.[1]?.split(",").map(s => s.trim()) || [],
        partial: text.match(/PARTIAL:\D*(.+)/i)?.[1]?.split(",").map(s => s.trim()) || [],
        missing: text.match(/WEAK:\D*(.+)/i)?.[1]?.split(",").map(s => s.trim()) || [],
      };

      let resumeTips = text.match(/RESUME_TIPS:([\s\S]*?)$/i)?.[1]
          ?.split("\n")
          .map(t => t.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean) || [];

      if (resumeTips.length === 0) {
        resumeTips = [
          "Add backend projects showing API development",
          "Mention testing and CI/CD exposure",
          "Quantify impact in projects",
        ];
      }

      const result = {
        matchScore,
        missingKeywords,
        summary,
        feedback,
        searchQuery,
        scoreBreakdown,
        resumeTips,
        jobs: [],
      };

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

/* ---------------- STEP 5: SAVE ANALYSIS ---------------- */
app.post("/save-analysis", (req, res) => {
  const analyses = readAnalyses();
  const id = crypto.randomUUID();
  const record = {
    id,
    result: req.body,
    createdAt: new Date().toISOString(),
  };

  analyses.push(record);
  writeAnalyses(analyses);

  res.json({
    id,
    shareUrl: `/analysis/${id}`,
  });
});

/* ---------------- STEP 5: GET SHARED ANALYSIS ---------------- */
app.get("/analysis/:id", (req, res) => {
  const analyses = readAnalyses();
  const found = analyses.find(a => a.id === req.params.id);

  if (!found) {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  res.json(found);
});

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER RUNNING — STEP 5 ENABLED");
});