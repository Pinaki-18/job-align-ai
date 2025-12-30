const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// PDF PARSER
let pdfParseLib;
try { 
  pdfParseLib = require('pdf-parse'); 
  console.log("✅ pdf-parse loaded successfully");
} catch (err) {
  console.warn("⚠️ pdf-parse not found. Install with: npm install pdf-parse");
}

async function parsePDF(buffer) {
  if (!pdfParseLib) {
    console.warn("⚠️ PDF parser not available");
    return "";
  }
  try {
    const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
    const data = await parser(buffer);
    console.log(`✅ PDF parsed: ${data.text.length} characters extracted`);
    return data.text;
  } catch (err) {
    console.error("❌ PDF parsing failed:", err.message);
    return "";
  }
}

const app = express();
const port = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Multer configuration with larger limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString() 
  });
});

// Main analysis endpoint
app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("🔥 NEW ANALYSIS REQUEST");
    console.log("========================================");

    // 1. Validate API Key
    const rawKey = process.env.GEMINI_API_KEY || "";
    const cleanKey = rawKey.trim();

    if (!cleanKey) {
      console.error("❌ CRITICAL: API Key is missing in .env file");
      return res.status(500).json({
        error: "Server configuration error",
        message: "API key not configured"
      });
    }
    console.log(`✅ API Key loaded (Length: ${cleanKey.length} chars)`);

    // 2. Parse Job Description
    const jobDesc = req.body.jobDesc || "";
    if (!jobDesc || jobDesc.length < 10) {
      console.warn("⚠️ Job description is too short");
      return res.status(400).json({
        error: "Invalid job description",
        message: "Please provide a detailed job description"
      });
    }
    console.log(`✅ Job Description: ${jobDesc.substring(0, 100)}...`);

    // 3. Parse Resume PDF
    let resumeText = "";
    if (req.file && req.file.buffer) {
      console.log(`📄 PDF Received: ${req.file.originalname} (${req.file.size} bytes)`);
      resumeText = await parsePDF(req.file.buffer);
    } else {
      console.warn("⚠️ No PDF file in request");
      return res.status(400).json({
        error: "No resume file",
        message: "Please upload a PDF resume"
      });
    }

    // Fallback if parsing failed
    if (!resumeText || resumeText.length < 50) {
      console.warn("⚠️ Resume text too short, using fallback");
      resumeText = "Candidate with general software engineering background. Skills include programming and development.";
    }
    console.log(`✅ Resume text extracted: ${resumeText.length} characters`);

    // 4. Build AI Prompt
    const prompt = `You are an expert HR recruiter and ATS system. Analyze this resume against the job description.

Job Description:
"""
${jobDesc}
"""

Resume Content:
"""
${resumeText}
"""

IMPORTANT: Provide your analysis in EXACTLY this format (no extra text):

SCORE: [number between 0-100]%
MISSING: [comma-separated list of 3-5 critical missing skills or keywords]
SUMMARY: [one sentence professional summary of the match]
FEEDBACK: [3-5 detailed bullet points with specific improvement suggestions]
SEARCH_QUERY: [a 3-4 word job search query optimized for this candidate's profile]

Rules:
- Score must be realistic (20-95 range typically)
- Be specific in feedback
- Focus on actionable improvements
`;

    console.log("📤 Sending request to Google Gemini AI...");

    // 5. Call Google Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
      { 
        contents: [{ 
          parts: [{ text: prompt }] 
        }] 
      },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000 // 30 second timeout
      }
    );

    // 6. Validate Response
    if (!response.data || !response.data.candidates || response.data.candidates.length === 0) {
      console.error("❌ Empty response from Gemini");
      throw new Error("AI service returned no results");
    }

    const aiText = response.data.candidates[0]?.content?.parts[0]?.text || "";
    
    if (!aiText) {
      console.error("❌ No text in AI response");
      throw new Error("AI response was empty");
    }

    console.log("✅ AI Response received");
    console.log("📊 Response preview:", aiText.substring(0, 200));

    // 7. Parse AI Response
    let matchScore = 50; // Default fallback
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) {
      matchScore = parseInt(scoreMatch[1]);
      // Ensure score is in valid range
      matchScore = Math.max(0, Math.min(100, matchScore));
    } else {
      console.warn("⚠️ Could not parse score, using default: 50");
    }

    let summary = "Resume analyzed successfully.";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|$)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
    }

    let missingKeywords = [];
    const missingMatch = aiText.match(/MISSING:\s*(.+?)(?=\n|$)/i);
    if (missingMatch) {
      missingKeywords = missingMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 6);
    }
    if (missingKeywords.length === 0) {
      missingKeywords = ["Additional skills recommended"];
    }

    let feedback = "Continue refining your resume based on the job requirements.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) {
      feedback = feedbackMatch[1].trim();
    }

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) {
      searchQuery = queryMatch[1].trim().replace(/['"]/g, '');
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
    console.log("✅ SUCCESS - ANALYSIS COMPLETE");
    console.log(`Score: ${matchScore}%`);
    console.log(`Missing: ${missingKeywords.join(', ')}`);
    console.log(`Query: ${searchQuery}`);
    console.log("========================================\n");

    res.json(result);

  } catch (error) {
    console.error("========================================");
    console.error("❌ ERROR IN ANALYSIS");
    console.error("========================================");
    console.error("Error Type:", error.name);
    console.error("Error Message:", error.message);
    
    if (error.response) {
      console.error("API Error Status:", error.response.status);
      console.error("API Error Data:", JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code === 'ECONNABORTED') {
      console.error("⏱️ Request timeout");
    }
    
    console.error("========================================\n");

    // Return proper error response
    res.status(500).json({
      error: "Analysis failed",
      message: error.response?.data?.error?.message || error.message || "AI service error",
      details: "Please check server logs for more information"
    });
  }
});

// Job search endpoint (placeholder)
app.get('/search-jobs', async (req, res) => {
  const query = req.query.query || 'Software Engineer';
  console.log(`🔍 Job search request: ${query}`);
  
  // Return empty array for now - frontend will use mock data
  res.json([]);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    error: "Server error",
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log("\n========================================");
  console.log(`🟢 SERVER STARTED SUCCESSFULLY`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🔗 URL: http://localhost:${port}`);
  console.log(`📅 Time: ${new Date().toLocaleString()}`);
  console.log("========================================\n");
});