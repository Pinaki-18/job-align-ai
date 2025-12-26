const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 5000;

// Enable CORS for all origins (Simplifies local vs prod issues)
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- ROBUST PDF PARSER ---
// Handles different versions of the library to prevent crashes
let pdfLibrary = require('pdf-parse');
async function parsePDF(buffer) {
    try {
        if (typeof pdfLibrary === 'function') return await pdfLibrary(buffer);
        if (pdfLibrary.default && typeof pdfLibrary.default === 'function') return await pdfLibrary.default(buffer);
        const Parser = pdfLibrary.default || pdfLibrary;
        return new Parser(buffer);
    } catch (err) {
        console.error("PDF Parsing Warning:", err.message);
        return { text: "" }; // Return empty string instead of crashing
    }
}

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("--- 1. Request Received ---");
        
        // 1. Validation
        if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
        if (!req.body.jobDesc) return res.status(400).json({ error: "No Job Description provided" });

        // 2. Parse PDF
        const pdfData = await parsePDF(req.file.buffer);
        const resumeText = pdfData.text || "";
        console.log(`--- 2. PDF Parsed (${resumeText.length} chars) ---`);

        // 3. AI Configuration (The "Pro" Setup)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            // CRITICAL: This line forces the AI to output valid JSON only.
            generationConfig: { responseMimeType: "application/json" } 
        });
        
        const prompt = `
            Act as a strict Resume Scoring API.
            JD: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Task: Compare the resume to the JD and calculate a match score.
            
            REQUIRED JSON OUTPUT FORMAT:
            {
                "matchScore": <number 0-100>,
                "missingKeywords": ["<skill1>", "<skill2>", "<skill3>"],
                "summary": "<short professional summary>"
            }
        `;

        console.log("--- 3. Sending to Gemini... ---");
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        // 4. Data Sanitization (Strip markdown just in case)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log("--- 4. Gemini Response: ---");
        console.log(text); // Verify output in terminal

        // 5. Final Parsing & Response
        const jsonResponse = JSON.parse(text);
        res.json(jsonResponse);

    } catch (error) {
        console.error("CRITICAL SERVER ERROR:", error);
        // Send a "Safe" fallback JSON so the frontend doesn't crash
        res.status(500).json({ 
            matchScore: 0, 
            missingKeywords: ["Server Error"], 
            summary: "Analysis failed. Please try again." 
        });
    }
});

app.listen(port, () => console.log(`\n🟢 PRO SERVER RUNNING on http://localhost:${port}\n`));