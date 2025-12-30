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

// --- DIAGNOSIS ENDPOINT ---
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("🔥 NEW REQUEST - DIAGNOSIS MODE");

    // 1. Clean Key
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) apiKey = apiKey.trim(); 

    if (!apiKey) throw new Error("API Key is MISSING in Render.");

    // 2. Prepare Data
    let resumeText = "";
    if (req.file && req.file.buffer) {
      resumeText = await parsePDF(req.file.buffer);
    }
    // Fallback if PDF is image-based
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

    console.log("👉 Attempting to call gemini-pro...");

    // 3. CALL GOOGLE (Using gemini-pro for maximum compatibility)
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Google sent empty data.");

    // 4. SUCCESS
    let matchScore = 50;
    const scoreMatch = text.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    res.json({
      matchScore: matchScore,
      missingKeywords: ["None - It Worked!"], 
      summary: "Analysis Successful!", 
      feedback: text.substring(0, 200) + "...",
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    
    // EXTRACT THE REAL REASON
    let diagMessage = error.message;
    if (error.response && error.response.data) {
        // Try to capture Google's specific error message
        const googleError = error.response.data.error;
        if (googleError) {
            diagMessage = `GOOGLE SAYS: ${googleError.code} - ${googleError.message}`;
        }
    }

    // SEND THE ERROR TO THE FRONTEND SCREEN
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["DIAGNOSIS_MODE"], 
      summary: `🛑 ERROR: ${diagMessage}`, // <--- THIS WILL SHOW ON YOUR SCREEN
      feedback: "Please verify your API Key permissions.", 
      searchQuery: "Error", 
      jobs: [] 
    });
  }
});

app.get('/search-jobs', async (req, res) => { res.json([]); });

app.listen(port, () => console.log(`🟢 Running on Port ${port}`));