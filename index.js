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
  console.warn("⚠️ pdf-parse not found - install with: npm install pdf-parse");
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
const port = process.env.PORT || 10000; // Render uses port 10000

// CRITICAL: CORS Configuration for Vercel
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://your-vercel-app.vercel.app', // Replace with your actual Vercel URL
    /\.vercel\.app$/ // Allow all Vercel preview deployments
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// Multer with increased limits for Render
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: '🟢 Server is running on Render',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main analysis endpoint
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("🔥 NEW REQUEST FROM:", req.headers.origin);
    console.log("========================================");

    // 1. Validate API Key
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
      console.error("❌ CRITICAL: No API Key found");
      console.error("Environment check:", {
        hasKey: !!apiKey,
        keyLength: apiKey?.length || 0,
        allEnvKeys: Object.keys(process.env).filter(k => k.includes('GEMINI'))
      });
      
      return res.status(500).json({
        error: "Server configuration error",
        message: "API key not configured on Render. Please add GEMINI_API_KEY to environment variables."
      });
    }
    
    console.log(`✅ API Key found (${apiKey.length} chars)`);

    // 2. Validate Job Description
    const jobDesc = req.body.jobDesc;
    if (!jobDesc || jobDesc.length < 10) {
      console.warn("⚠️ Invalid job description");
      return res.status(400).json({
        error: "Invalid input",
        message: "Job description must be at least 10 characters"
      });
    }
    console.log(`✅ Job Desc: ${jobDesc.substring(0, 80)}...`);

    // 3. Validate Resume File
    if (!req.file || !req.file.buffer) {
      console.warn("⚠️ No PDF file uploaded");
      return res.status(400).json({
        error: "No file uploaded",
        message: "Please upload a PDF resume"
      });
    }

    console.log(`📄 File: ${req.file.originalname} (${req.file.size} bytes)`);
    let resumeText = await parsePDF(req.file.buffer);

    if (!resumeText || resumeText.length < 50) {
      console.warn("⚠️ Using fallback resume text");
      resumeText = "Professional with software engineering background. Experienced in programming and development.";
    }
    console.log(`✅ Resume: ${resumeText.length} chars`);

    // 4. Build AI Prompt
    const prompt = `You are an expert HR recruiter. Analyze this resume against the job description.

Job Description:
"""
${jobDesc}
"""

Resume:
"""
${resumeText}
"""

Provide analysis in EXACTLY this format:

SCORE: [number 0-100]%
MISSING: [comma-separated list of 3-5 missing skills]
SUMMARY: [one professional sentence]
FEEDBACK: [3-5 specific improvement points]
SEARCH_QUERY: [3-4 word job search term]

Be realistic with scores (20-95 range). Be specific and actionable.`;

    console.log("📤 Calling Gemini API...");

    // 5. Call Gemini with timeout
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000 // 25 second timeout for Render
      }
    );

    // 6. Validate Response
    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      console.error("❌ Empty AI response");
      throw new Error("AI returned empty response");
    }

    console.log("✅ AI responded");

    // 7. Parse AI Response
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) {
      matchScore = Math.max(0, Math.min(100, parseInt(scoreMatch[1])));
    }

    let summary = "Analysis complete";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|$)/i);
    if (summaryMatch) summary = summaryMatch[1].trim();

    let missingKeywords = [];
    const missingMatch = aiText.match(/MISSING:\s*(.+?)(?=\n|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s)
        .slice(0, 6);
    }
    if (!missingKeywords.length) {
      missingKeywords = ["Additional skills recommended"];
    }

    let feedback = "Continue improving based on requirements";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim().replace(/['"]/g, '');

    // 8. Send Response
    const result = {
      matchScore,
      missingKeywords,
      summary,
      feedback,
      searchQuery,
      jobs: []
    };

    console.log("========================================");
    console.log("✅ SUCCESS");
    console.log(`Score: ${matchScore}%`);
    console.log("========================================\n");

    res.json(result);

  } catch (error) {
    console.error("========================================");
    console.error("❌ ERROR");
    console.error("Type:", error.name);
    console.error("Message:", error.message);
    
    if (error.response) {
      console.error("API Status:", error.response.status);
      console.error("API Error:", JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code === 'ECONNABORTED') {
      console.error("⏱️ Request timeout");
    }
    
    console.error("========================================\n");

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || "Server error";

    res.status(statusCode).json({
      error: "Analysis failed",
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Job search endpoint
app.get('/search-jobs', async (req, res) => {
  const query = req.query.query || 'Software Engineer';
  console.log(`🔍 Job search: ${query}`);
  res.json([]);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    error: "Server error",
    message: err.message
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log("\n========================================");
  console.log(`🟢 SERVER STARTED ON RENDER`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🔗 URL: https://job-align-ai.onrender.com`);
  console.log(`📅 Time: ${new Date().toLocaleString()}`);
  console.log(`🔑 API Key: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log("========================================\n");
});