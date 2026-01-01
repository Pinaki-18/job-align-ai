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

/* ---------------- SHARE LOGIC (FIXED) ---------------- */
app.post("/save-analysis", (req, res) => {
  const analyses = readAnalyses();
  const id = crypto.randomUUID();
  const record = { id, result: req.body, createdAt: new Date().toISOString() };
  analyses.push(record);
  writeAnalyses(analyses);
  // Return the ID - frontend will construct full URL
  res.json({ id });
});

// API endpoint - returns JSON data
app.get("/api/analysis/:id", (req, res) => {
  const analyses = readAnalyses();
  const found = analyses.find(a => a.id === req.params.id);
  if (!found) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(found);
});

// Direct share page - returns HTML
app.get("/share/:id", (req, res) => {
  const analyses = readAnalyses();
  const found = analyses.find(a => a.id === req.params.id);
  
  if (!found) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>Not Found</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px; background: #1a1a2e; color: #fff;">
        <h1>❌ Analysis Not Found</h1>
        <p>This shared link may have expired or doesn't exist.</p>
        <a href="${process.env.FRONTEND_URL || 'https://your-frontend.netlify.app'}" style="color: #6366f1;">← Back to JobAlign AI</a>
      </body></html>
    `);
  }

  const result = found.result;
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>JobAlign AI - Shared Result</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #fff; padding: 20px; min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 40px; }
        h1 { font-size: 2.5rem; color: #8b5cf6; margin: 10px 0; }
        .subtitle { color: #a78bfa; font-size: 1.1rem; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(139,92,246,0.3); border-radius: 16px; padding: 30px; margin: 20px 0; backdrop-filter: blur(10px); }
        .score { font-size: 4rem; color: ${result.matchScore >= 80 ? '#10b981' : '#f59e0b'}; font-weight: bold; text-align: center; margin: 20px 0; }
        .badge { background: rgba(139,92,246,0.2); padding: 8px 16px; border-radius: 20px; display: inline-block; margin: 5px; font-size: 0.9rem; }
        .feedback { white-space: pre-line; line-height: 1.8; color: #e5e7eb; }
        .cta-btn { display: block; width: 100%; padding: 15px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; text-align: center; font-weight: 600; margin-top: 20px; }
        .cta-btn:hover { background: #4f46e5; }
        h3 { color: #a78bfa; margin-bottom: 15px; font-size: 1.3rem; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <div>🚀</div>
          <h1>JobAlign AI</h1>
          <p class="subtitle">Shared Analysis Results</p>
        </header>

        <div class="card">
          <h2 style="text-align: center; color: #e5e7eb; margin-bottom: 20px;">
            ${result.matchScore >= 80 ? '🎯 Excellent Match!' : '⚖️ Needs Improvement'}
          </h2>
          <div class="score">${result.matchScore}%</div>
        </div>

        <div class="card">
          <h3>🔍 Missing Keywords</h3>
          <div>
            ${result.missingKeywords && result.missingKeywords.length > 0 
              ? result.missingKeywords.map(kw => `<span class="badge">▪ ${kw}</span>`).join('') 
              : '<span style="color: #10b981;">✅ Perfect Match</span>'}
          </div>
        </div>

        <div class="card">
          <h3>💡 Actionable Feedback</h3>
          <div class="feedback">${result.feedback || result.summary || 'No feedback available'}</div>
        </div>

        <a href="${process.env.FRONTEND_URL || 'https://your-frontend.netlify.app'}" class="cta-btn">
          ✨ Analyze Your Own Resume
        </a>
      </div>
    </body>
    </html>
  `);
});

app.listen(port, "0.0.0.0", () => console.log("🟢 PROD SERVER LIVE"));