const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse'); // Simple import
require('dotenv').config();

const app = express();
const port = 5001; // Keep using 5001 to avoid ghosts

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("--- 1. Request Received ---");

        if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
        if (!req.body.jobDesc) return res.status(400).json({ error: "No Job Description provided" });

        // --- FIXED PDF PARSING ---
        // We use the library directly, no complex constructors
        let resumeText = "";
        try {
            const pdfData = await pdf(req.file.buffer);
            resumeText = pdfData.text;
            console.log(`--- 2. PDF Parsed Successfully (${resumeText.length} chars) ---`);
        } catch (pdfError) {
            console.error("PDF Error:", pdfError);
            return res.status(500).json({ error: "Failed to read PDF file." });
        }

        // --- AI CONFIGURATION ---
        // Using gemini-1.5-flash. If this fails, the SDK update (Step 1) didn't work.
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            generationConfig: { responseMimeType: "application/json" } 
        });

        const prompt = `
            Analyze this resume against the JD.
            JD: "${req.body.jobDesc}"
            Resume: "${resumeText}"
            
            Return JSON schema:
            {
                "matchScore": number,
                "missingKeywords": ["skill1", "skill2"],
                "summary": "string"
            }
        `;

        console.log("--- 3. Sending to Gemini... ---");
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- 4. Success! Response received. ---");
        
        // Clean and Parse
        const jsonText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(jsonText));

    } catch (error) {
        console.error("CRITICAL SERVER ERROR:", error);
        res.status(500).json({ 
            error: "AI Analysis Failed", 
            details: error.message 
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SERVER RUNNING on http://localhost:${port}\n`));