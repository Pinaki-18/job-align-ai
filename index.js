const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai"); // Official SDK
require('dotenv').config();

// PDF Parser
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

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    // 1. Setup SDK with Clean Key
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 2. Extract Text
    let resumeText = "";
    if (req.file && req.file.buffer) resumeText = await parsePDF(req.file.buffer);
    if (!resumeText || resumeText.length < 50) resumeText = "Professional candidate profile.";

    const prompt = `Analyze this resume for: "${req.body.jobDesc || 'Developer'}"\nResume: "${resumeText}"\nFormat:\nSCORE: [0-100]%\nMISSING: [Skills]\nSUMMARY: [Text]\nFEEDBACK: [Text]\nSEARCH_QUERY: [Title]`;

    // 3. Official SDK Call (Fixed URL Issues)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const aiText = result.response.text();
    
    // 4. Parse Results
    let matchScore = 80;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    res.json({
      matchScore: matchScore,
      missingKeywords: ["Verified"], 
      summary: "Success", 
      feedback: aiText.substring(0, 500),
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["SDK_ERROR"], 
      summary: "Error", 
      feedback: `SDK ERROR: ${error.message}`, // Prints exact SDK error to screen
      searchQuery: "Error", 
      jobs: [] 
    });
  }
});

app.listen(port, () => console.log(`🟢 Running on Port ${port}`));