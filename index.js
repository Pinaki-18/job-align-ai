const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenAI } = require("@google/genai"); // 👈 Use the new SDK
require('dotenv').config();

// PDF Parser
let pdfParseLib;
try { pdfParseLib = require('pdf-parse'); } catch (e) {}

async function parsePDF(buffer) {
  if (!pdfParseLib) return "";
  try {
    const data = await pdfParseLib(buffer);
    return data.text;
  } catch (err) { return ""; }
}

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    // 1. Initialize Client (Auto-picks up GEMINI_API_KEY from environment)
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    const ai = new GoogleGenAI({ 
      apiKey: apiKey,
      apiVersion: 'v1' // 👈 Switch to stable v1 for better reliability
    });
    
    // 2. Extract Resume Text
    let resumeText = "";
    if (req.file && req.file.buffer) resumeText = await parsePDF(req.file.buffer);
    if (!resumeText || resumeText.length < 50) resumeText = "Candidate Name: Sample User.";

    const prompt = `Analyze this resume for: "${req.body.jobDesc}"\nResume: "${resumeText}"\nFormat:\nSCORE: [0-100]%\nMISSING: [Skills]\nSUMMARY: [Text]\nFEEDBACK: [Text]\nSEARCH_QUERY: [Title]`;

    // 3. Use Latest Stable Model: gemini-2.5-flash
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", // 👈 Upgraded to latest stable model
      contents: prompt
    });
    
    const aiText = response.text;
    
    // 4. Parse Score
    let matchScore = 80;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    res.json({
      matchScore: matchScore,
      missingKeywords: ["Success"], 
      summary: "Analysis Complete", 
      feedback: aiText,
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["GENAI_SDK_ERROR"], 
      summary: "Error", 
      feedback: `ERROR: ${error.message}`, 
      searchQuery: "Error", 
      jobs: [] 
    });
  }
});

app.listen(port, () => console.log(`🟢 Running on Port ${port}`));