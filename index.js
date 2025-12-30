const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const pdfParse = require('pdf-parse'); // Library to read PDF text
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
// Configure Multer to handle file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => res.send("Server is Online 🚀"));

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    // 1. VALIDATE API KEY
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY in environment variables.");
    }

    // 2. EXTRACT TEXT FROM RESUME
    let resumeText = "";
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        // Extract text from PDF buffer
        const data = await pdfParse(req.file.buffer);
        resumeText = data.text;
      } else {
        // Fallback for text files
        resumeText = req.file.buffer.toString('utf-8');
      }
    } else {
      resumeText = "(No resume provided)";
    }

    const jobDesc = req.body.jobDesc || "Software Engineer";

    // 3. CONSTRUCT PROMPT
    // We now inject the ACTUAL resume text into the prompt
    const prompt = `
    Analyze the following Resume against the Job Description.
    
    RESUME CONTENT:
    ${resumeText.substring(0, 10000)} // Limit text to prevent timeout
    
    JOB DESCRIPTION:
    ${jobDesc}
    
    Return the response strictly in this format:
    SCORE: [0-100]%
    MISSING: [List of missing skills]
    SUMMARY: [One sentence summary]
    FEEDBACK: [Detailed feedback]
    SEARCH_QUERY: [A suitable job title for this resume]
    `;

    // 4. CALL GOOGLE GEMINI API
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    // 5. PARSE RESPONSE
    if (!response.data.candidates || !response.data.candidates[0]) {
      throw new Error("AI returned no candidates.");
    }

    const aiText = response.data.candidates[0].content.parts[0].text;
    
    let matchScore = 0;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    let searchQuery = "Software Engineer";
    const queryMatch = aiText.match(/SEARCH_QUERY:\s*(.*)/i);
    if (queryMatch) searchQuery = queryMatch[1].trim();

    // Send success response
    res.json({
      matchScore: matchScore,
      missingKeywords: [],
      summary: "Analysis Complete",
      feedback: aiText,
      searchQuery: searchQuery,
      jobs: [] 
    });

  } catch (error) {
    // 6. DETAILED ERROR LOGGING
    // This helps you debug in Vercel logs
    console.error("=== ANALYSIS ERROR ===");
    console.error(error.message);
    if (error.response) {
        console.error("Google API Status:", error.response.status);
        console.error("Google API Data:", JSON.stringify(error.response.data));
    }

    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      errorMsg = error.response.data.error.message;
    }
    
    res.status(500).json({ 
      matchScore: 0, 
      missingKeywords: ["CONNECTION_ERROR"],
      feedback: `GOOGLE REJECTED: ${errorMsg}` 
    });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));