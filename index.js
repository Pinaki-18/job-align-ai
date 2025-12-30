const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios'); 
require('dotenv').config();

// --- PDF PARSER ---
let pdfParseLib;
try { pdfParseLib = require('pdf-parse'); } catch (err) {}

async function parsePDF(buffer) {
    if (!pdfParseLib) return "";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) { return ""; }
}

const app = express();
const port = process.env.PORT || 5001; 

app.use(cors());
app.use(express.json());

// Increase limit for PDF uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("\n--- New Analysis Request ---");

        // 1. AUTO-FIX API KEY (Removes invisible spaces/newlines)
        const rawKey = process.env.GEMINI_API_KEY || "";
        const cleanKey = rawKey.trim(); 

        if (!cleanKey) {
            throw new Error("API Key is missing (Checked .env)");
        }
        console.log(`🔑 API Key loaded (Length: ${cleanKey.length} chars)`);

        // 2. Parse PDF
        let resumeText = "";
        if (req.file && req.file.buffer) {
            console.log(`📄 PDF Received: ${req.file.originalname} (${req.file.size} bytes)`);
            resumeText = await parsePDF(req.file.buffer);
        } else {
            console.log("⚠️ No PDF file detected in request.");
        }

        // Fallback if parsing failed
        if (!resumeText || resumeText.length < 50) {
            console.log("⚠️ Text too short or empty. Using fallback context.");
            resumeText = "Candidate Name: User. Role: Software Engineer. Skills: Java, Python, React.";
        }

        const prompt = `
            Analyze this resume against the Job Description.
            Job Description: "${req.body.jobDesc || 'Software Engineer'}"
            Resume: "${resumeText}"
            
            Output strictly in this format:
            SCORE: [Number 0-100]%
            MISSING: [Comma separated list of missing critical skills]
            SUMMARY: [One professional sentence summary]
            FEEDBACK: [3-4 detailed bullet points on specific changes]
            SEARCH_QUERY: [Generate the PERFECT 3-4 word job search query]
        `;

        console.log("👉 Sending Request to Gemini...");

        // 3. Call Google (Using the CLEAN KEY)
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("--- ✅ Success! Google Responded ---");

        // 4. Parse the Answer
        let matchScore = 70; 
        const scoreMatch = text.match(/SCORE:\s*(\d{1,3})%/i); 
        if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

        let summary = "Analysis complete.";
        const summaryMatch = text.match(/SUMMARY:\s*(.*)/i);
        if (summaryMatch) summary = summaryMatch[1].trim();

        let missingKeywords = ["General Improvements"];
        const missingMatch = text.match(/MISSING:\s*(.*)/i);
        if (missingMatch) missingKeywords = missingMatch[1].split(',').map(s => s.trim()).slice(0, 4);

        let feedback = "No specific feedback provided.";
        const feedbackMatch = text.match(/FEEDBACK:([\s\S]*?)SEARCH_QUERY:/i); 
        if (feedbackMatch) feedback = feedbackMatch[1].trim();
        else {
             const simpleFeedback = text.match(/FEEDBACK:([\s\S]*?)$/i);
             if (simpleFeedback) feedback = simpleFeedback[1].trim();
        }

        let searchQuery = "Software Engineer";
        const queryMatch = text.match(/SEARCH_QUERY:\s*(.*)/i);
        if (queryMatch) searchQuery = queryMatch[1].trim();

        res.json({ matchScore, missingKeywords, summary, feedback, searchQuery, jobs: [] });

    } catch (error) {
        console.error("❌ Error:", error.message);
        if (error.response) {
            console.error("🔍 Google Error Detail:", error.response.data);
        }
        
        // Return SAFE response (10%)
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

app.listen(port, () => console.log(`\n🟢 SERVER READY on port ${port}\n`));