const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- 1. SAFE PDF IMPORT (Keep this, it works!) ---
let pdfParseLib;
try {
    pdfParseLib = require('pdf-parse');
} catch (err) {
    console.error("Warning: pdf-parse not found.");
}

async function parsePDF(buffer) {
    if (!pdfParseLib) return "Error: PDF Library missing.";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) {
        console.error("PDF Error:", err.message);
        return "";
    }
}
// --------------------------------------------------

const app = express();
const port = 5001;

// Set to FALSE to use Real AI (Since it is working now!)
const MOCK_MODE = false; 

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log(`\n--- Request Received (Mock: ${MOCK_MODE}) ---`);

        // 1. Parse PDF
        if (!req.file) return res.status(400).json({ error: 'No file' });
        const resumeText = await parsePDF(req.file.buffer);
        console.log(`--- PDF Read: ${resumeText.substring(0, 20)}... ---`);

        // 2. Mock Mode (Optional)
        if (MOCK_MODE) {
            await new Promise(r => setTimeout(r, 1000));
            return res.json({
                matchScore: 85,
                missingKeywords: ["MockData"],
                summary: "Mock Mode is ON. Set MOCK_MODE = false to use Real AI."
            });
        }

        // 3. Real AI Request
        console.log("--- Sending to Gemini... ---");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            You are a Resume Scanner API. 
            Job Description: "${req.body.jobDesc}"
            Resume Text: "${resumeText}"
            
            Analyze the match. 
            CRITICAL: Output ONLY a valid JSON object. Do not speak. Do not write an intro.
            
            Expected JSON Structure:
            {
                "matchScore": <number between 0-100>,
                "missingKeywords": ["skill1", "skill2"],
                "summary": "<short analysis>"
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Responded. Cleaning output... ---");

        // --- 4. THE FIX: Extract JSON from "Essay" ---
        // This finds the first "{" and the last "}" to ignore any intro text
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("AI did not return JSON");
        }

        const cleanJson = text.substring(jsonStart, jsonEnd);
        const finalData = JSON.parse(cleanJson);

        console.log(`--- Success! Score: ${finalData.matchScore} ---`);
        res.json(finalData);

    } catch (error) {
        console.error("Error:", error.message);
        // Fallback so UI never breaks
        res.json({
            matchScore: 0,
            missingKeywords: ["AI Error"],
            summary: "The AI analysis failed to format correctly. Please try again."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SERVER READY on http://localhost:${port}\n`));