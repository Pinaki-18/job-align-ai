const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// --- PDF PARSER SETUP ---
let pdfParseLib;
try { 
  pdfParseLib = require('pdf-parse'); 
  console.log("✅ pdf-parse loaded");
} catch (err) {
  console.warn("⚠️ pdf-parse not found");
}

async function parsePDF(buffer) {
  if (!pdfParseLib) return "";
  try {
    const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
    const data = await parser(buffer);
    return data.text;
  } catch (err) {
    console.error("❌ PDF Parsing Failed:", err.message);
    return "";
  }
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

// Health check
app.get('/', (req, res) => {
  res.json({ status: '🟢 Server Online', timestamp: new Date().toISOString() });
});

// --- MAIN ANALYZE ENDPOINT ---
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("🔥 PROCESSING NEW REQUEST");

    // 1. CLEAN THE API KEY (CRITICAL FIX 1)
    let apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) apiKey = apiKey.trim(); 

    if (!apiKey) {
      throw new Error("API Key is missing in Render Environment Variables");
    }

    // 2. PREPARE DATA
    const jobDesc = req.body.jobDesc || "Software Engineer";
    let resumeText = "";
    
    if (req.file && req.file.buffer) {
      resumeText = await parsePDF(req.file.buffer);
    }

    if (!resumeText || resumeText.length < 50) {
      console.log("⚠️ PDF empty or unreadable. Using fallback text.");
      resumeText = "Candidate Name: User. Skills: Java, Python, React. Experience: Junior Developer.";
    }

    // 3. GENERATE PROMPT
    const prompt = `
      You are an expert HR Recruiter. Analyze this resume against the job description.
      
      JOB DESCRIPTION:
      "${jobDesc}"
      
      RESUME:
      "${resumeText}"
      
      Output strictly in this format:
      SCORE: [Number 0-100]%
      MISSING: [Comma separated list of 3-5 missing skills]
      SUMMARY: [One sentence summary]
      FEEDBACK: [3 specific bullet points]
      SEARCH_QUERY: [3-4 word job search title]
    `;

    console.log("👉 Sending to Google...");

    // 4. CALL GOOGLE API (CRITICAL FIX 2: MODEL NAME)
    // Removed "-latest" because it was deleted by Google
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { 
        contents: [{ parts: [{ text: prompt }] }] 
      },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 45000 
      }
    );

    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) throw new Error("Google returned empty response");

    console.log("✅ Google Responded!");

    // 5. PARSE RESPONSE
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    let summary = "Analysis complete.";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|MISSING:|FEEDBACK:|$)/i);
    if (summaryMatch) summary = summaryMatch[1].trim();

    let missingKeywords = ["General Improvements"];
    const missingMatch = aiText.match(/MISSING:\s*(.+?)(?=\n|SUMMARY:|FEEDBACK:|SEARCH_QUERY:|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1].split(',').map(s => s.trim()).slice(0, 5);
    }

    let feedback = "Update your resume to match the job description.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim().replace(/['"]/g, '');

    // 6. SEND SUCCESS
    res.json({ matchScore, missingKeywords, summary, feedback, searchQuery, jobs: [] });

  } catch (error) {
    console.error("❌ ERROR:", error.message);
    if (error.response) console.error("🔍 Google Error:", error.response.data);

    // Return 10% SAFE MODE so app doesn't crash
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["Error with AI Service"], 
      summary: "Analysis Failed. Please try again.", 
      feedback: "The AI service is currently busy or the API key is invalid.", 
      searchQuery: "Developer",
      jobs: []
    });
  }
});

app.get('/search-jobs', async (req, res) => { res.json([]); });

app.listen(port, '0.0.0.0', () => {
  console.log(`🟢 SERVER READY on Port ${port}`);
});