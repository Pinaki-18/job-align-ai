const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => res.send("Server is Online 🚀"));

app.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    // 1. Get and Clean the Key
    const apiKey = (process.env.GEMINI_API_KEY || "").trim();
    
    // 2. Prepare the Request
    const jobDesc = req.body.jobDesc || "Software Engineer";
    const prompt = `Score this resume for the job: ${jobDesc}. 
    Format response strictly as:
    SCORE: [0-100]%
    MISSING: [Skill1, Skill2]
    SUMMARY: [One sentence]
    FEEDBACK: [Bullet points]
    SEARCH_QUERY: [Job Title]`;

    // 3. USE THE STABLE V1 PRODUCTION ENDPOINT
    // This fixes the 'not found' error from the beta version
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    const aiText = response.data.candidates[0].content.parts[0].text;
    
    // 4. Parse the AI Response
    let matchScore = 85;
    const scoreMatch = aiText.match(/SCORE:\s*(\d{1,3})%/i);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    res.json({
      matchScore: matchScore,
      missingKeywords: ["Skill Check Pass"],
      summary: "Success",
      feedback: aiText,
      searchQuery: "Software Engineer",
      jobs: []
    });

  } catch (error) {
    // This will display the EXACT reason on your Vercel screen if it fails
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      errorMsg = error.response.data.error.message;
    }
    
    res.json({ 
      matchScore: 10, 
      missingKeywords: ["CONNECTION_ERROR"],
      feedback: `GOOGLE REJECTED: ${errorMsg}` 
    });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));