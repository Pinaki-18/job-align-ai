const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

// --- SMART MODEL SWITCHER ---
// This function tries multiple model names until one works.
async function generateWithFallback(genAI, prompt) {
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];
    
    for (const modelName of modelsToTry) {
        try {
            console.log(`👉 Attempting connection with model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text(); 
        } catch (error) {
            console.warn(`⚠️ ${modelName} failed: ${error.message.split(' ')[0]}`);
            // If this was the last model, throw the error to be caught below
            if (modelName === modelsToTry[modelsToTry.length - 1]) throw error;
        }
    }
}

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("\n--- New Request Received ---");
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";

        if (!process.env.GEMINI_API_KEY) throw new Error("API Key missing");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        const prompt = `
            Act as a Resume Scorer. 
            Job Description: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Strictly output in this format:
            SCORE: [Number 0-100]%
            SUMMARY: [One professional sentence about the match]
            MISSING: [Comma separated list of missing skills]
        `;

        // CALL THE SWITCHER
        const text = await generateWithFallback(genAI, prompt);
        
        console.log("--- ✅ AI Connected! Parsing Results... ---");

        // --- PARSE RESULTS ---
        let matchScore = 70; 
        const scoreMatch = text.match(/(\d{1,3})%/); 
        if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

        let summary = "Analysis complete.";
        const summaryMatch = text.match(/SUMMARY:\s*(.*)/i);
        if (summaryMatch) summary = summaryMatch[1].trim();

        let missingKeywords = ["General Improvements"];
        const missingMatch = text.match(/MISSING:\s*(.*)/i);
        if (missingMatch) missingKeywords = missingMatch[1].split(',').map(s => s.trim()).slice(0, 4);

        res.json({
            matchScore: matchScore,
            missingKeywords: missingKeywords,
            summary: summary.replace(/\*/g, "")
        });

    } catch (error) {
        console.error("❌ ALL MODELS FAILED:", error.message);
        res.json({ 
            matchScore: 0, 
            missingKeywords: ["API Error"], 
            summary: "Could not connect to Google AI. Please check server logs." 
        });
    }
});

app.listen(port, () => console.log(`\n🟢 AUTO-SWITCH SERVER READY on http://localhost:${port}\n`));