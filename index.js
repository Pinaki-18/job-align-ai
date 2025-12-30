const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// PDF Parser Setup
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
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => res.json({ status: '🟢 Online' }));

// --- SMART ANALYZE ENDPOINT ---
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("🔥 NEW REQUEST - SMART MODE");

    // 1. Clean Key
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) apiKey = apiKey.trim();
    if (!apiKey) throw new Error("API Key is missing in Render variables.");

    // 2. Prepare Data
    let resumeText = "";
    if (req.file && req.file.buffer) resumeText = await parsePDF(req.file.buffer);
    if (!resumeText || resumeText.length < 50) resumeText = "Software Engineer Candidate.";

    const prompt = `
      Analyze this resume for the job: "${req.body.jobDesc || 'Developer'}"
      Resume: "${resumeText}"
      Output format:
      SCORE: [0-100]%
      MISSING: [Skill1, Skill2]
      SUMMARY: [Summary]
      FEEDBACK: [Feedback]
      SEARCH_QUERY: [Title]
    `;

    // 3. Try Gemini Flash FIRST
    let aiText = "";
    try {
        console.log("👉 Trying gemini-1.5-flash...");
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err1) {
        console.log("⚠️ Flash failed. Switching to Gemini Pro...");
        // 4. Fallback to Gemini Pro if Flash fails
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!aiText) throw new Error("Both Google Models failed to respond.");

    // 5. Success Parsing
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    let feedback = "Analysis successful.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    res.json({
      matchScore: matchScore,
      missingKeywords: ["Success"], 
      summary: "Analysis Complete", 
      feedback: feedback,
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    console.error("❌ FINAL ERROR:", error.message);
    
    // CAPTURE THE EXACT GOOGLE ERROR
    let errorMsg = error.message;
    if (error.response?.data?.error) {
        errorMsg = `${error.response.data.error.code}: ${error.response.data.error.message}`;
    }

    // SEND TO FRONTEND (VISIBLE BOX)
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["ERROR_MODE"], 
      summary: "Error", 
      // 👇 THIS PUTS THE ERROR ON YOUR SCREEN 👇
      feedback: `GOOGLE ERROR: ${errorMsg}`, 
      searchQuery: "Error", 
      jobs: [] 
    });
  }
});

app.get('/search-jobs', async (req, res) => { res.json([]); });
app.listen(port, () => console.log(`🟢 Running on Port ${port}`));