const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

/* ---------------- RATE LIMIT ---------------- */
const analyzeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    matchScore: 0,
    missingKeywords: ["RATE_LIMIT"],
    summary: "Too many requests",
    feedback: "Please wait before trying again.",
    searchQuery: "Job Search",
    scoreBreakdown: { strengths: [], partial: [], missing: [] },
    resumeTips: [],
    jobs: [],
  },
});

const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", backend: "FINAL-V5" });
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
      if (jobDesc.length < 30) {
        return res.json({
          matchScore: 0,
          missingKeywords: ["Incomplete JD"],
          summary: "Job description too short",
          feedback: "Provide a detailed technical job description.",
          searchQuery: "Software Engineer",
          scoreBreakdown: { strengths: [], partial: [], missing: [] },
          resumeTips: [],
          jobs: [],
        });
      }

      const modelName = await getWorkingModel(apiKey);

      const prompt = `
You are an expert technical recruiter.

JOB DESCRIPTION:
${jobDesc}

Respond STRICTLY in this format:

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
Assume you are advising a CANDIDATE whose resume is being evaluated for this role.
Give specific actions the candidate should take to improve their resume.

- <resume improvement>
- <resume improvement>
- <resume improvement>
`;

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`,
        { contents: [{ role: "user", parts: [{ text: prompt }] }] }
      );

      const text =
        response.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("EMPTY_AI_RESPONSE");

      /* ---------------- PARSING ---------------- */

      const scoreMatch = text.match(/SCORE:\s*(\d{1,3})%?/i);
      const matchScore = scoreMatch ? Number(scoreMatch[1]) : 50;

      const missingMatch = text.match(/MISSING:\s*(.+)/i);
      const missingKeywords = missingMatch
        ? missingMatch[1].split(",").map(s => s.trim()).slice(0, 6)
        : [];

      const summaryMatch = text.match(/SUMMARY:\s*(.+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : "";

      const feedbackMatch = text.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i);
      const feedback = feedbackMatch ? feedbackMatch[1].trim() : "";

      const queryMatch = text.match(/SEARCH_QUERY:\s*(.+)/i);
      const searchQuery = queryMatch
        ? queryMatch[1].replace(/["']/g, "").trim()
        : "Software Engineer";

      const strengthsMatch = text.match(/STRENGTHS:\s*(.+)/i);
      const partialMatch = text.match(/PARTIAL:\s*(.+)/i);
      const weakMatch = text.match(/WEAK:\s*(.+)/i);

      const scoreBreakdown = {
        strengths: strengthsMatch
          ? strengthsMatch[1].split(",").map(s => s.trim())
          : [],
        partial: partialMatch
          ? partialMatch[1].split(",").map(s => s.trim())
          : [],
        missing: weakMatch
          ? weakMatch[1].split(",").map(s => s.trim())
          : [],
      };

      const tipsMatch = text.match(/RESUME_TIPS:([\s\S]*?)$/i);
      const resumeTips = tipsMatch
        ? tipsMatch[1]
            .split("\n")
            .map(t => t.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean)
        : [];

      return res.json({
        matchScore,
        missingKeywords,
        summary,
        feedback,
        searchQuery,
        scoreBreakdown,
        resumeTips,
        jobs: [],
      });
    } catch (err) {
      return res.json({
        matchScore: 10,
        missingKeywords: ["AI_ERROR"],
        summary: "Analysis failed",
        feedback: err.message,
        searchQuery: "Job Search",
        scoreBreakdown: { strengths: [], partial: [], missing: [] },
        resumeTips: [],
        jobs: [],
      });
    }
  }
);

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER RUNNING (FINAL STEP 4 FIXED)");
});
