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
const port = 5001;
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("\n--- New Analysis Request ---");
        
        let resumeText = req.file ? await parsePDF(req.file.buffer) : "";
        if (!resumeText || resumeText.length < 50) {
            resumeText = `Name: Candidate. Role: Software Engineer.`;
        }

        if (!process.env.GEMINI_API_KEY) throw new Error("API Key is missing");

        const prompt = `
            Analyze this resume against the Job Description.
            Job Description: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Output strictly in this format:
            SCORE: [Number 0-100]%
            MISSING: [Comma separated list of missing critical skills]
            SUMMARY: [One professional sentence summary]
            FEEDBACK: [3-4 detailed bullet points]
            SEARCH_QUERY: [Generate the PERFECT 3-4 word job search query]
        `;

        console.log("👉 Sending Request to Gemini...");

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' } }
        );

        if (!response.data.candidates || response.data.candidates.length === 0) {
             throw new Error("Google AI returned no results.");
        }

        const text = response.data.candidates[0].content.parts[0].text;
        console.log("--- ✅ Success! Google Responded ---");

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

        // ⚠️ FIXED: Added "jobs: []" so Frontend doesn't crash
        res.json({ 
            matchScore, 
            missingKeywords, 
            summary, 
            feedback, 
            searchQuery,
            jobs: [] // <--- This prevents the blank screen crash
        });

    } catch (error) {
        console.error("❌ Error:", error.message);
        res.json({ 
            matchScore: 10, 
            missingKeywords: ["Error with AI"], 
            summary: "Analysis Failed", 
            feedback: "Please try again later.", 
            searchQuery: "Developer",
            jobs: [] // <--- Safety for error cases too
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SERVER READY on http://localhost:${port}\n`));