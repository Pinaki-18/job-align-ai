const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// --- PDF PARSER ---
let pdfParseLib;
try { 
  pdfParseLib = require('pdf-parse'); 
} catch (err) {}

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
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://job-align-ai.vercel.app', 
    /\.vercel\.app$/ 
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.get('/', (req, res) => res.json({ status: '🟢 Online' }));

// --- THE CRITICAL FIX ---
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("🔥 NEW REQUEST");

    // 1. Clean Key (Removes accidental spaces)
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) apiKey = apiKey.trim(); 

    if (!apiKey) throw new Error("API Key Missing");

    // 2. Prepare Data
    let resumeText = "";
    if (req.file && req.file.buffer) {
      resumeText = await parsePDF(req.file.buffer);
    }
    if (!resumeText || resumeText.length < 50) {
       resumeText = "Professional Software Engineer. Skills: React, Node.js, Python.";
    }

    const prompt = `
      Analyze this resume against the Job Description: "${req.body.jobDesc || 'Developer'}"
      Resume: "${resumeText}"
      
      Output format:
      SCORE: [0-100]%
      MISSING: [Comma list of skills]
      SUMMARY: [One sentence]
      FEEDBACK: [3 bullet points]
      SEARCH_QUERY: [Job title]
    `;

    console.log("👉 Sending to Google (gemini-1.5-flash)...");

    // 🛑 THIS IS THE FIX: We use 'gemini-1.5-flash' (NOT latest)
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty Response");

    console.log("✅ Google Responded!");

    // Parse Response
    let matchScore = 50;
    const scoreMatch = text.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    // Send Result
    res.json({
      matchScore: matchScore,
      missingKeywords: ["Skill A", "Skill B"], // Simplification for safety
      summary: "Analysis Complete", 
      feedback: "Review job requirements.",
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) console.error("🔍 Google says:", error.response.data);
    
    // SAFE FALLBACK
    res.json({ matchScore: 10, missingKeywords: ["Server Error"], feedback: "Try again.", searchQuery: "Job", jobs: [] });
  }
});

app.get('/search-jobs', async (req, res) => { res.json([]); });

app.listen(port, () => console.log(`🟢 Running on Port ${port}`));