const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- SAFE PDF PARSER ---
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
// ------------------------

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("\n--- New Request Received ---");

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        // 1. Read PDF
        const resumeText = await parsePDF(req.file.buffer);
        console.log(`--- PDF Read (${resumeText.length} chars) ---`);

        // 2. Send to AI
        console.log("--- Sending to Gemini... ---");
        // Using gemini-pro (Standard Model)
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            You are a rigorous code parser.
            Job Description: "${req.body.jobDesc}"
            Resume Text: "${resumeText}"
            
            Analyze the match. 
            CRITICAL INSTRUCTION: Output ONLY a valid JSON object. 
            Do NOT write "Here is the analysis". Do NOT write "Okay Aditya".
            Just the JSON.
            
            Required JSON Format:
            {
                "matchScore": <number 0-100>,
                "missingKeywords": ["skill1", "skill2"],
                "summary": "<short 1-sentence summary>"
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Responded. Extracting JSON... ---");

        // --- 3. THE FIX: Find JSON inside the Essay ---
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("AI output contained no JSON data");
        }

        // Cut out the clean JSON part
        const cleanJson = text.substring(jsonStart, jsonEnd);
        const finalData = JSON.parse(cleanJson);

        console.log(`--- Success! Score: ${finalData.matchScore} ---`);
        res.json(finalData);

    } catch (error) {
        console.error("Error:", error.message);
        // Fallback: If AI fails, give a generic score so UI doesn't crash
        res.json({
            matchScore: 0,
            missingKeywords: ["Error Parsing AI Response"],
            summary: "The AI analysis failed. Please try again."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SERVER READY on http://localhost:${port}\n`));