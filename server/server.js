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
        console.log(`--- PDF Read (${resumeText.length} chars) ---`);

        // 1. Send Request
        console.log("--- Asking Gemini... ---");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Act as a Resume Scoring Algorithm.
            Job Description: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Provide a Match Score (0-100) and a list of missing keywords.
            If you write an introduction like "Okay Aditya", I will fail.
            JUST DATA.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Output Received. Cleaning... ---");

        // 2. THE FIX: The "Essay Scraper" logic
        // We assume the AI messed up and wrote text. We extract data manually.
        
        let matchScore = 0;
        let summary = "Analysis complete.";
        let missingKeywords = ["General Review"];

        // Strategy A: Try to find valid JSON first
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd !== -1) {
            try {
                const jsonPart = JSON.parse(text.substring(jsonStart, jsonEnd));
                matchScore = jsonPart.matchScore || 0;
                summary = jsonPart.summary || summary;
                missingKeywords = jsonPart.missingKeywords || missingKeywords;
            } catch (e) { console.log("JSON Parse failed, switching to Text Scraper..."); }
        }

        // Strategy B: "Scrape" the text for numbers if JSON failed
        if (matchScore === 0) {
            // Regex to find "Score: 82" or "82/100" or "82%"
            const scoreRegex = /(?:Score|Match|Rating)[:\s]*(\d+)/i;
            const found = text.match(scoreRegex);
            if (found && found[1]) {
                matchScore = parseInt(found[1]);
            }
            // Use the whole text as summary if it's short, or cut it
            summary = text.replace(/\n/g, ' ').substring(0, 150) + "...";
        }

        const finalData = {
            matchScore: matchScore,
            missingKeywords: ["See summary"], // Simplified for text mode
            summary: summary
        };

        console.log(`--- Success! Extracted Score: ${finalData.matchScore} ---`);
        res.json(finalData);

    } catch (error) {
        console.error("Server Error:", error.message);
        // Fallback: Frontend needs JSON, so we give it JSON.
        res.json({
            matchScore: 0,
            missingKeywords: ["Server Error"],
            summary: "Failed to process AI response."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SCRAPER SERVER READY on http://localhost:${port}\n`));