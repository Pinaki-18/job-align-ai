const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// PDF PARSER
let pdfParseLib;
try { 
  pdfParseLib = require('pdf-parse'); 
  console.log("✅ pdf-parse loaded");
} catch (err) {
  console.warn("⚠️ pdf-parse not found");
}

async function parsePDF(buffer) {
  if (!pdfParseLib) {
    console.warn("⚠️ PDF parser not available");
    return "";
  }
  try {
    const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
    const data = await parser(buffer);
    console.log(`✅ PDF parsed: ${data.text.length} chars`);
    return data.text;
  } catch (err) {
    console.error("❌ PDF parse failed:", err.message);
    return "";
  }
}

const app = express();
const port = process.env.PORT || 10000;

// CORS - Add your actual Vercel URL
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://job-align-ai.vercel.app', // Your Vercel URL
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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: '🟢 Server running on Render',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!process.env.GEMINI_API_KEY
  });
});

// Main analysis endpoint
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("🔥 NEW REQUEST");

    // 1. Validate & CLEAN API Key (FIXED HERE 🛠️)
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) apiKey = apiKey.trim(); // <--- REMOVES INVISIBLE SPACES

    if (!apiKey) {
      console.error("❌ CRITICAL: No API Key");
      return res.status(500).json({ error: "Server configuration error" });
    }
    
    console.log(`✅ API Key configured (${apiKey.length} chars)`);

    // 2. Validate Inputs
    const jobDesc = req.body.jobDesc || "Software Engineer";
    
    // 3. Parse PDF
    let resumeText = "";
    if (req.file && req.file.buffer) {
        resumeText = await parsePDF(req.file.buffer);
    }

    if (!resumeText || resumeText.length < 50) {
      resumeText = "Professional with software engineering experience. Skilled in programming.";
    }

    // 4. Build Prompt
    const prompt = `You are an expert HR recruiter. Analyze this resume against the job description.

Job Description:
"""${jobDesc}"""

Resume Content:
"""${resumeText}"""

Provide your analysis in EXACTLY this format:
SCORE: [number between 0-100]%
MISSING: [comma-separated list of 3-5 critical missing skills]
SUMMARY: [one professional sentence]
FEEDBACK: [3-5 specific bullet points]
SEARCH_QUERY: [3-4 word job search term]`;

    console.log("📤 Calling Gemini API...");

    // 5. Call Gemini API - FIXED MODEL NAME 🛠️
    // Changed 'gemini-1.5-flash-latest' to 'gemini-1.5-flash'
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    console.log("🔗 Using model: gemini-1.5-flash");

    const response = await axios.post(
      geminiUrl,
      { 
        contents: [{ parts: [{ text: prompt }] }]
      },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) throw new Error("AI returned empty response");

    console.log("✅ AI Response received");

    // 7. Parse AI Response
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) matchScore = Math.max(0, Math.min(100, parseInt(scoreMatch[1])));

    let summary = "Resume analyzed successfully";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|MISSING:|FEEDBACK:|$)/i);
    if (summaryMatch) summary = summaryMatch[1].trim();

    let missingKeywords = ["General Improvements"];
    const missingMatch = aiText.match(/MISSING:\s*(.+?)(?=\n|SUMMARY:|FEEDBACK:|SEARCH_QUERY:|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1].split(',').map(s => s.trim()).filter(s => s).slice(0, 6);
    }

    let feedback = "Continue improving your resume.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim().replace(/['"]/g, '');

    const result = { matchScore, missingKeywords, summary, feedback, searchQuery, jobs: [] };
    console.log(`📊 Final Score: ${matchScore}%`);
    
    res.json(result);

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) console.error("🔍 Google Error:", error.response.data);
    
    // Return SAFE response (10%) so app doesn't crash
    res.json({ 
        matchScore: 10, 
        missingKeywords: ["Error with AI Service"], 
        summary: "Analysis Failed", 
        feedback: "The AI service is currently busy. Please try again.", 
        searchQuery: "Developer",
        jobs: []
    });
  }
});

app.get('/search-jobs', async (req, res) => { res.json([]); });

app.listen(port, '0.0.0.0', () => {
  console.log(`🟢 SERVER STARTED on Port ${port}`);
});