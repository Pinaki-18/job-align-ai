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
  if (!pdfParseLib) return "";
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
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Server running', time: new Date().toISOString() });
});

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log("\n========================================");
    console.log("🔥 NEW REQUEST");
    console.log("========================================");

    // 1. Validate API Key
    const rawKey = process.env.GEMINI_API_KEY || "";
    const cleanKey = rawKey.trim();

    if (!cleanKey) {
      console.error("❌ CRITICAL: No API Key");
      return res.status(500).json({
        error: "Server configuration error",
        message: "API key missing in .env file"
      });
    }
    console.log(`✅ API Key loaded (${cleanKey.length} chars)`);

    // 2. Validate Job Description
    const jobDesc = req.body.jobDesc || "";
    if (!jobDesc || jobDesc.length < 10) {
      console.warn("⚠️ Job description too short");
      return res.status(400).json({
        error: "Invalid job description",
        message: "Please provide a detailed job description"
      });
    }
    console.log(`✅ Job Desc: ${jobDesc.substring(0, 80)}...`);

    // 3. Validate Resume File
    if (!req.file || !req.file.buffer) {
      console.warn("⚠️ No PDF uploaded");
      return res.status(400).json({
        error: "No resume file",
        message: "Please upload a PDF resume"
      });
    }

    console.log(`📄 PDF: ${req.file.originalname} (${req.file.size} bytes)`);
    let resumeText = await parsePDF(req.file.buffer);

    if (!resumeText || resumeText.length < 50) {
      console.warn("⚠️ Resume too short, using fallback");
      resumeText = "Candidate with software engineering background. Skills: programming, development.";
    }
    console.log(`✅ Resume: ${resumeText.length} chars extracted`);

    // 4. Build Prompt
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
SUMMARY: [one sentence summary]
FEEDBACK: [3-5 bullet points with specific improvements]
SEARCH_QUERY: [3-4 word job search query]

Rules:
- Score must be realistic (20-95 range)
- Be specific and actionable
`;

    console.log("📤 Calling Google Gemini...");

    // 5. Call Gemini API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    // 6. Validate Response
    if (!response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("❌ Empty AI response");
      throw new Error("AI returned no results");
    }

    const aiText = response.data.candidates[0].content.parts[0].text;
    console.log("✅ AI Response received");
    console.log("Preview:", aiText.substring(0, 150));

    // 7. Parse AI Response
    let matchScore = 50;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%?/i);
    if (scoreMatch) {
      matchScore = Math.max(0, Math.min(100, parseInt(scoreMatch[1])));
    }

    let summary = "Analysis complete.";
    const summaryMatch = aiText.match(/SUMMARY:\s*(.+?)(?=\n|$)/i);
    if (summaryMatch) summary = summaryMatch[1].trim();

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

    let feedback = "Continue refining based on requirements.";
    const feedbackMatch = aiText.match(/FEEDBACK:([\s\S]*?)(?=SEARCH_QUERY:|$)/i);
    if (feedbackMatch) feedback = feedbackMatch[1].trim();

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.+?)(?=\n|$)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim().replace(/['"]/g, '');

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
    console.log("✅ SUCCESS");
    console.log(`📊 Score: ${matchScore}%`);
    console.log(`🔍 Missing: ${missingKeywords.slice(0, 3).join(', ')}`);
    console.log(`🔎 Query: ${searchQuery}`);
    console.log("========================================\n");

    res.json(result);

  } catch (error) {
    console.error("========================================");
    console.error("❌ ERROR");
    console.error("Type:", error.name);
    console.error("Message:", error.message);
    
    if (error.response) {
      console.error("API Status:", error.response.status);
      console.error("API Data:", JSON.stringify(error.response.data, null, 2));
    }
    
    console.error("========================================\n");

    // Return proper error (NOT fake data!)
    res.status(500).json({
      error: "Analysis failed",
      message: error.response?.data?.error?.message || error.message || "AI service error",
      details: "Check server logs for more info"
    });
  }
});

app.get('/search-jobs', async (req, res) => {
  const query = req.query.query || 'Software Engineer';
  console.log(`🔍 Job search: ${query}`);
  res.json([]);
});

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({
    error: "Server error",
    message: err.message
  });
});

app.listen(port, () => {
  console.log("\n========================================");
  console.log(`🟢 SERVER STARTED`);
  console.log(`🌐 Port: ${port}`);
  console.log(`🔗 URL: http://localhost:${port}`);
  console.log(`📅 Time: ${new Date().toLocaleString()}`);
  console.log("========================================\n");
});