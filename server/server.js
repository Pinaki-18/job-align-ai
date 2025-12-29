const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- PDF SETUP ---
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

// --- THE FIX: SMART MODEL SELECTOR ---
async function generateWithFallback(genAI, prompt) {
    // List of models to try in order
    const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"];
    
    for (const modelName of modelsToTry) {
        try {
            console.log(`👉 Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            return result.response.text(); // If success, return text immediately
        } catch (error) {
            console.error(`❌ ${modelName} failed: ${error.message.split(' ')[0]}`);
            // If it's the last model and it failed, throw error
            if (modelName === modelsToTry[modelsToTry.length - 1]) throw error;
            // Otherwise, continue loop to try next model
        }
    }
}

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("\n--- New Analysis Request ---");
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";
        
        // Check API Key
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Missing GEMINI_API_KEY in .env file");
        }
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

        // USE THE FALLBACK FUNCTION
        const text = await generateWithFallback(genAI, prompt);
        
        console.log("--- AI Success! Parsing Data... ---");

        // --- PARSER LOGIC ---
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
        console.error("🔥 ALL MODELS FAILED:", error.message);
        res.json({ 
            matchScore: 0, 
            missingKeywords: ["API Error"], 
            summary: "Could not connect to Google AI. Check Server Logs." 
        });
    }
});

app.listen(port, () => console.log(`\n🟢 AUTO-SWITCH SERVER READY on http://localhost:${port}\n`));