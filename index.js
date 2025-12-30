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

const analyzeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    matchScore: 0,
    missingKeywords: ["RATE_LIMIT"],
    summary: "Too many requests",
    feedback:
      "You are sending requests too quickly. Please wait a minute and try again.",
    searchQuery: "Job Search",
    jobs: [],
  },
});

const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK", backend: "FINAL-POLISHED" });
});

/* ---------------- MODEL DISCOVERY ---------------- */
async function getWorkingModel(apiKey) {
  const listUrl = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const res = await axios.get(listUrl);

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
          missingKeywords: ["Provide a detailed job description"],
          summary: "Job description too short.",
          feedback:
            "Please enter a full job description including responsibilities, required skills, and experience.",
          searchQuery: "Software Engineer",
          scoreBreakdown: {
            strengths: [],
            partial: [],
            missing: ["Job description too short"],
          },
          jobs: [],
        });
      }

      const modelName = await getWorkingModel(apiKey);

      const prompt = `
You are an expert HR recruiter.

JOB DESCRIPTION:
${jobDesc}

Respond EXACTLY in this format:

SCORE: <0-100>%
MISSING: <comma separated skills>
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
`;

      const url = `https://generativelanguage.googleapis.com/v1/${modelName}:generateContent?key=${apiKey}`;

      const response = await axios.post(url, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

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
      const summary = summaryMatch
        ? summaryMatch[1].trim()
        : "Analysis complete.";

      const feedbackMatch = text.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i);
      const feedback = feedbackMatch
        ? feedbackMatch[1].trim()
        : "Improve alignment with the job description.";

      const queryMatch = text.match(/SEARCH_QUERY:\s*(.+)/i);
      const searchQuery = queryMatch
        ? queryMatch[1].replace(/["']/g, "").trim()
        : "Software Engineer";

      /* -------- BREAKDOWN PARSING (THIS WAS MISSING) -------- */
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

      return res.json({
        matchScore,
        missingKeywords,
        summary,
        feedback,
        searchQuery,
        scoreBreakdown,
        jobs: [],
      });
    } catch (err) {
      return res.json({
        matchScore: 10,
        missingKeywords: ["AI_ERROR"],
        summary: "Analysis failed",
        feedback: err.message,
        searchQuery: "Job Search",
        scoreBreakdown: {
          strengths: [],
          partial: [],
          missing: ["System error"],
        },
        jobs: [],
      });
    }
  }
);

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER RUNNING (FINAL POLISHED)");
});
