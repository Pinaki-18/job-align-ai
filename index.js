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

/* ---------------- SETUP & STORAGE ---------------- */
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "analyses.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");

const readAnalyses = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
const writeAnalyses = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const analyzeLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

/* ---------------- MODEL DISCOVERY ---------------- */
async function getWorkingModel(apiKey) {
  const res = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
  const model = res.data.models.find(m => m.supportedGenerationMethods?.includes("generateContent"));
  if (!model) throw new Error("NO_SUPPORTED_MODEL");
  return model.name;
}

/* ---------------- ANALYZE ENDPOINT ---------------- */
app.post("/analyze", analyzeLimiter, upload.single("resume"), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("API_KEY_MISSING");

    const jobDesc = (req.body.jobDesc || "").trim();
    
    // VALIDATION: Prevent hallucinations if JD is too short
    if (jobDesc.length < 50) {
      return res.json({
        matchScore: 0,
        summary: "Job description is too short for a professional analysis.",
        feedback: "Please provide a full JD (at least a paragraph) to see technical gaps.",
        missingKeywords: [],
        searchQuery: "Software Engineer",
        resumeTips: ["Always provide a full JD to ensure accurate matching."]
      });
    }

    const modelName = await getWorkingModel(apiKey);
    const resumeText = "Assume extracted text from PDF here..."; // Replace with your PDF parsing logic

    const prompt = `
You are a Senior Technical Recruiter at a FAANG company. Analyze this Resume against the Job Description (JD).
JD: "${jobDesc}"
Resume: "${resumeText}"

STRICT FORMAT:
SCORE: [0-100]%
MISSING: [Top 3-5 keywords only, comma separated]
SUMMARY: [One sentence evaluation]
FEEDBACK:
- <point>
- <point>
SEARCH_QUERY: [3-word job title]
RESUME_TIPS:
- <tip>
- <tip>`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`,
      { contents: [{ role: "user", parts: [{ text: prompt }] }] }
    );

    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("EMPTY_AI_RESPONSE");

    // ROBUST PARSING
    const matchScore = Number(text.match(/SCORE:\D*(\d{1,3})/i)?.[1]) || 15;
    
    let missingKeywords = [];
    const missingMatch = text.match(/MISSING:\s*(.+?)(?=\n|SUMMARY:|FEEDBACK:|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1]
        .replace(/\(.*?\)|e\.g\.|specific|technologies|tools/gi, '') 
        .split(',').map(s => s.trim()).filter(s => s.length > 2).slice(0, 5);
    }

    const result = {
      matchScore,
      missingKeywords,
      summary: text.match(/SUMMARY:\s*(.+)/i)?.[1]?.trim() || "",
      feedback: text.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i)?.[1]?.trim() || "",
      searchQuery: text.match(/SEARCH_QUERY:\D*(.+?)(?=\n|RESUME_TIPS:|$)/i)?.[1]?.trim() || "Software Engineer",
      resumeTips: text.match(/RESUME_TIPS:([\s\S]*?)$/i)?.[1]?.split("\n")
        .map(t => t.replace(/^[-*]\s*/, "").trim()).filter(Boolean) || []
    };

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* ---------------- STEP 5: SHARE LOGIC ---------------- */
app.post("/save-analysis", (req, res) => {
  const analyses = readAnalyses();
  const id = crypto.randomUUID();
  const record = { id, result: req.body, createdAt: new Date().toISOString() };
  analyses.push(record);
  writeAnalyses(analyses);
  res.json({ id, shareUrl: `/analysis/${id}` });
});

app.get("/analysis/:id", (req, res) => {
  const analyses = readAnalyses();
  const found = analyses.find(a => a.id === req.params.id);
  if (!found) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(found);
});

app.listen(port, "0.0.0.0", () => console.log("🟢 PROD SERVER LIVE"));