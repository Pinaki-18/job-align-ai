const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- PDF SETUP ---
let pdfParseLib;
try {
    pdfParseLib = require('pdf-parse');
} catch (err) { console.error("PDF Lib missing"); }

async function parsePDF(buffer) {
    if (!pdfParseLib) return "PDF Error";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) { return ""; }
}
// -----------------

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("--- Request Received ---");
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";

        // 1. Send Request to Gemini
        // We tell it to be a Hiring Manager since it wants to be one anyway.
        console.log("--- Asking Gemini... ---");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Review this resume for the job description: "${req.body.jobDesc}"
            Resume Content: "${resumeText}"
            
            Give me a match score out of 100.
            List 3 missing keywords.
            Write a 1 sentence summary.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Output Received (Text Mode). Processing... ---");

        // 2. NUCLEAR TEXT PARSER
        // We extract data using Regex because the output is conversational text.
        
        // A. Find the Score (Looks for "Score: 8/10", "82/100", "82%")
        let matchScore = 50; // Default fallback
        const scoreRegex = /(\d+)(?:\/10|\/100|%)/; 
        const scoreMatch = text.match(scoreRegex);
        
        if (scoreMatch) {
            let rawScore = parseInt(scoreMatch[1]);
            // If score is 8/10, convert to 80. If 82/100, keep 82.
            if (rawScore <= 10) rawScore *= 10; 
            matchScore = rawScore;
        }

        // B. Find Missing Keywords (Looks for lists or bullet points)
        // We just grab some capitalized words from the middle of the text as a fallback
        let missingKeywords = ["Review Summary"];
        if (text.toLowerCase().includes("missing")) {
             // Simple logic: grab a few words after "Missing"
             const missingPart = text.split(/missing/i)[1].substring(0, 50);
             missingKeywords = [missingPart.trim()];
        }

        // C. Create Summary
        // Just take the first 150 characters of the AI's response
        const summary = text.replace(/\*/g, '').replace(/#/g, '').substring(0, 150) + "...";

        // 3. Construct the JSON manually
        const finalData = {
            matchScore: matchScore,
            missingKeywords: missingKeywords,
            summary: summary
        };

        console.log(`--- Parsed Score: ${finalData.matchScore} ---`);
        res.json(finalData);

    } catch (error) {
        console.error("Server Error:", error.message);
        res.json({
            matchScore: 0,
            missingKeywords: ["Server Error"],
            summary: "Failed to process AI response."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 TEXT PARSER SERVER READY on http://localhost:${port}\n`));