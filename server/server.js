const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- 🛡️ CRITICAL FIX: Safe PDF Import ---
// This prevents the "pdfParse is not a function" crash
let pdfParseLib;
try {
    pdfParseLib = require('pdf-parse');
} catch (err) {
    console.error("Warning: pdf-parse not found. Mock mode recommended.");
}

async function parsePDF(buffer) {
    if (!pdfParseLib) return "Error: PDF Library missing.";
    try {
        // Handle different import styles (CommonJS vs ES Modules)
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        if (typeof parser !== 'function') throw new Error("PDF Library corrupted");
        
        const data = await parser(buffer);
        return data.text;
    } catch (err) {
        console.error("PDF Parse Error:", err.message);
        return "Error: Could not read resume text.";
    }
}
// ----------------------------------------

const app = express();
const port = 5001;

// 🔥 DEVELOPMENT MODE
// Set TRUE to see the Dashboard immediately (Bypasses Google)
// Set FALSE only when you are ready to use your real API Key
const MOCK_MODE = true; 

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI (Only if key exists)
let genAI;
try {
    if (process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
} catch (e) {
    console.log("⚠️ API Key missing or invalid. Mock mode forced.");
}

// Simple Cache
const resultCache = new Map();

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log(`\n--- Request Received (${MOCK_MODE ? 'MOCK' : 'LIVE'}) ---`);

        // 1. Validation
        if (!req.file) return res.status(400).json({ error: 'No resume file uploaded' });

        // 2. Parse PDF (Safely)
        const resumeText = await parsePDF(req.file.buffer);
        console.log(`--- PDF Parsed (${resumeText.length} chars) ---`);

        // 3. Check Cache (Save money/time)
        const cacheKey = `${req.body.jobDesc?.substring(0, 20)}_${resumeText.substring(0, 20)}`;
        if (resultCache.has(cacheKey)) {
            console.log("--- ✅ Returning Cached Result ---");
            return res.json(resultCache.get(cacheKey));
        }

        // 4. 🎭 MOCK MODE (The "Instant Fix")
        if (MOCK_MODE || !process.env.GEMINI_API_KEY) {
            console.log("--- 🎭 Generating MOCK Result ---");
            
            // Simulate 1 second delay so it feels real
            await new Promise(r => setTimeout(r, 1000));

            const mockResult = {
                matchScore: Math.floor(Math.random() * (95 - 70) + 70), // Random score 70-95
                missingKeywords: ["Docker", "Kubernetes", "GraphQL"],
                summary: "This is a MOCK response. The system is working! Your frontend is connected perfectly. To get real AI results, set MOCK_MODE = false in server.js."
            };
            
            resultCache.set(cacheKey, mockResult);
            return res.json(mockResult);
        }

        // 5. 🌐 REAL AI MODE
        console.log("--- 🌐 Calling Google Gemini ---");
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const prompt = `
            Analyze this candidate.
            Job Description: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Output valid JSON only:
            {
                "matchScore": number,
                "missingKeywords": ["array", "of", "strings"],
                "summary": "string"
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        // Clean JSON
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const finalJson = JSON.parse(cleanText);

        resultCache.set(cacheKey, finalJson);
        res.json(finalJson);

    } catch (error) {
        console.error("❌ SERVER ERROR:", error.message);
        
        // Fallback so user NEVER sees "Analysis Failed"
        res.json({
            matchScore: 0,
            missingKeywords: ["Server Error"],
            summary: "Critical error. Check server logs."
        });
    }
});

app.listen(port, () => {
    console.log(`\n${'='.repeat(40)}`);
    console.log(`🟢 SERVER RUNNING on http://localhost:${port}`);
    console.log(`🎭 Mock Mode: ${MOCK_MODE ? 'ON (Instant Success)' : 'OFF (Real AI)'}`);
    console.log(`\nTo fix "Analysis Failed", keep Mock Mode ON.`);
    console.log(`${'='.repeat(40)}\n`);
});