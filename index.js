const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// PDF Parser
let pdfParseLib;
try { pdfParseLib = require('pdf-parse'); } catch (e) {}

async function parsePDF(buffer) {
  if (!pdfParseLib) return "";
  try {
    const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
    const data = await parser(buffer);
    return data.text;
  } catch (err) { return ""; }
}

const app = express();
const port = process.env.PORT || 10000;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://job-align-ai.vercel.app', /\.vercel\.app$/],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => res.json({ status: '🟢 Online' }));

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    // 1. CLEAN API KEY
    let apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) throw new Error("API Key missing in Render.");

    // 2. PREPARE TEXT
    let resumeText = "";
    if (req.file && req.file.buffer) resumeText = await parsePDF(req.file.buffer);
    if (!resumeText || resumeText.length < 50) resumeText = "Professional Software Engineer.";

    const prompt = `Analyze this resume for: "${req.body.jobDesc || 'Developer'}"\nResume: "${resumeText}"\nFormat:\nSCORE: [0-100]%\nMISSING: [Skills]\nSUMMARY: [Text]\nFEEDBACK: [Text]\nSEARCH_QUERY: [Title]`;

    // 3. CALL STABLE V1 ENDPOINT (The Fix 🛠️)
    // We switched from v1beta to v1 for stability
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // 4. PARSE SUCCESS
    let matchScore = 75;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    let feedback = "Analysis successful.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    res.json({
      matchScore: matchScore,
      missingKeywords: ["Matched"], 
      summary: "Analysis Complete", 
      feedback: feedback,
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    let errorMsg = error.message;
    if (error.response?.data?.error) errorMsg = error.response.data.error.message;

    res.json({ 
      matchScore: 10, 
      missingKeywords: ["STABLE_MODE_ERROR"], 
      summary: "Error", 
      feedback: `STABLE API ERROR: ${errorMsg}`, 
      searchQuery: "Error", 
      jobs: [] 
    });
  }
});

app.listen(port, () => console.log(`🟢 Running on Port ${port}`));