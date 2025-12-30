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
    'https://jobalign-ai.vercel.app', // Replace with YOUR Vercel URL
    /\.vercel\.app$/ // Allows all Vercel preview deployments
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
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
    console.log("🔥 NEW REQUEST FROM:", req.headers.origin || 'Unknown');
    console.log("========================================");

    // 1. Validate API Key
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
      console.error("❌ CRITICAL: No API Key");
      return res.status(500).json({
        error: "Server configuration error",
        message: "GEMINI_API_KEY not set in Render environment variables"
      });
    }
    
    console.log(`✅ API Key configured (${apiKey.length} chars)`);

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
      console.warn("⚠️ No PDF uploaded");
      return res.status(400).json({
        error: "No file uploaded",
        message: "Please upload a PDF resume"
      });
    }

    console.log(`📄 File: ${req.file.originalname} (${req.file.size} bytes)`);
    let resumeText = await parsePDF(req.file.buffer);

    if (!resumeText || resumeText.length < 50) {
      console.warn("⚠️ Using fallback resume");
      resumeText = "Professional with software engineering experience. Skilled in programming and development.";
    }
    console.log(`✅ Resume: ${resumeText.length} chars`);

    // 4. Build Prompt
    const prompt = `You are an expert HR recruiter and ATS system. Analyze this resume against the job description.

Job Description:
"""
${jobDesc}
"""

Resume Content:
"""
${resumeText}
"""

Provide your analysis in EXACTLY this format (no extra text before or after):

SCORE: [number between 0-100]%
MISSING: [comma-separated list of 3-5 critical missing skills]
SUMMARY: [one professional sentence about the match quality]
FEEDBACK: [3-5 specific, actionable bullet points for improvement]
SEARCH_QUERY: [3-4 word job search term optimized for this candidate]

Rules:
- Be realistic with scores (typically 20-95 range)
- Focus on actionable, specific feedback
- Missing skills should be high-impact keywords from the job description`;

    console.log("📤 Calling Gemini API...");

    // 5. Call Gemini API - CORRECT MODEL: gemini-1.5-flash-latest
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    
    console.log("🔗 Using model: gemini-1.5-flash-latest");

    const response = await axios.post(
      geminiUrl,
      { 
        contents: [{ 
          parts: [{ text: prompt }] 
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          topP: 0.8,
          topK: 40
        }
      },
      { 
        headers: { 
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // 6. Validate Response
    const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      console.error("❌ Empty AI response");
      console.error("Full response:", JSON.stringify(response.data, null, 2));
      throw new Error("AI returned empty response");
    }

    console.log("✅ AI Response received");
    console.log("📄 Response length:", aiText.length);
    console.log("📄 Preview:", aiText.substring(0, 200));

    // 7. Parse AI Response
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) {
      matchScore = Math.max(0, Math.min(100, parseInt(scoreMatch[1])));
      console.log(`✅ Score parsed: ${matchScore}%`);
    } else {
      console.warn("⚠️ Could not parse score, using default: 50%");
    }

    let summary = "Resume analyzed successfully";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|MISSING:|FEEDBACK:|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      console.log(`✅ Summary parsed`);
    }

    let missingKeywords = [];
    const missingMatch = aiText.match(/MISSING:\s*(.+?)(?=\n|SUMMARY:|FEEDBACK:|SEARCH_QUERY:|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s.length > 0)
        .slice(0, 6);
      console.log(`✅ Missing keywords: ${missingKeywords.length} items`);
    }
    if (missingKeywords.length === 0) {
      missingKeywords = ["Additional skills recommended"];
    }

    let feedback = "Continue improving your resume based on the job requirements.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) {
      feedback = feedbackMatch[1].trim();
      console.log(`✅ Feedback parsed (${feedback.length} chars)`);
    }

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) {
      searchQuery = queryMatch[1].trim().replace(/['"]/g, '');
      console.log(`✅ Search query: ${searchQuery}`);
    }

    // 8. Build Response
    const result = {
      matchScore,
      missingKeywords,
      summary,
      feedback,
      searchQuery,
      jobs: []
    };

    console.log("========================================");
    console.log("✅ SUCCESS - Analysis Complete");
    console.log(`📊 Final Score: ${matchScore}%`);
    console.log(`🔍 Missing: ${missingKeywords.slice(0,3).join(', ')}`);
    console.log("========================================\n");

    res.json(result);

  } catch (error) {
    console.error("========================================");
    console.error("❌ ERROR OCCURRED");
    console.error("========================================");
    console.error("Error Type:", error.name);
    console.error("Error Message:", error.message);
    
    if (error.response) {
      console.error("API Status:", error.response.status);
      console.error("API Error:", JSON.stringify(error.response.data, null, 2));
      
      // Check for specific Gemini errors
      if (error.response.data?.error?.message) {
        console.error("Gemini Error Details:", error.response.data.error.message);
      }
    }
    
    if (error.code === 'ECONNABORTED') {
      console.error("⏱️ Timeout - Request took too long");
    }
    
    if (error.code === 'ENOTFOUND') {
      console.error("🌐 DNS Error - Cannot reach API");
    }
    
    console.error("Stack:", error.stack);
    console.error("========================================\n");

    const statusCode = error.response?.status || 500;
    let errorMessage = error.response?.data?.error?.message 
      || error.message 
      || "Unknown server error";

    // Provide helpful hints based on error
    let hint = undefined;
    if (errorMessage.includes('API key not valid')) {
      hint = "Invalid API key. Check your Gemini API key in Render environment variables.";
    } else if (errorMessage.includes('not found') || errorMessage.includes('not supported')) {
      hint = "Model not available. Using gemini-1.5-flash-latest.";
    } else if (errorMessage.includes('quota')) {
      hint = "API quota exceeded. Check your Google Cloud billing.";
    }

    res.status(statusCode).json({
      error: "Analysis failed",
      message: errorMessage,
      hint: hint
    });
  }
});

// Job search endpoint
app.get('/search-jobs', async (req, res) => {
  const query = req.query.query || 'Software Engineer';
  console.log(`🔍 Job search request: ${query}`);
  res.json([]);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    path: req.path
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
  console.log(`🟢 SERVER STARTED`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🔗 Render URL: https://job-align-ai.onrender.com`);
  console.log(`📅 Time: ${new Date().toLocaleString()}`);
  console.log(`🔑 API Key: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`🤖 Model: gemini-1.5-flash-latest`);
  console.log("========================================\n");
});