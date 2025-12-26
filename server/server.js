const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- PDF PARSER (Bulletproof Version) ---
let pdfLibrary = require('pdf-parse');
async function parsePDF(buffer) {
    try {
        if (typeof pdfLibrary === 'function') return await pdfLibrary(buffer);
        if (pdfLibrary.default && typeof pdfLibrary.default === 'function') return await pdfLibrary.default(buffer);
        const Parser = pdfLibrary.default || pdfLibrary;
        return new Parser(buffer);
    } catch (err) {
        if (err.message.includes("Class constructor")) {
             const Parser = pdfLibrary;
             return new Parser(buffer);
        }
        return { text: "" }; // Fail silently if parsing breaks
    }
}
// ----------------------------------------

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        const file = req.file;
        const jobDescription = req.body.jobDesc;

        if (!file || !jobDescription) return res.status(400).json({ error: "Missing data" });

        console.log("Parsing PDF...");
        const pdfData = await parsePDF(file.buffer);
        const resumeText = pdfData.text || "";

        console.log("Analyzing with AI...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // --- THE STRICT PROMPT ---
        const prompt = `
            Act as a data parser. 
            Job Description: "${jobDescription}"
            Resume: "${resumeText}"
            
            Return a JSON object comparing the resume to the JD.
            Rules:
            1. Return JSON ONLY. No markdown, no "Here is the JSON".
            2. matchScore must be a number (0-100).
            3. missingKeywords must be an array of strings.

            JSON Structure:
            {
                "matchScore": 75,
                "missingKeywords": ["Git", "SQL", "Unit Testing"],
                "summary": "Candidate matches core stack but lacks backend fundamentals."
            }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        // Clean up any markdown syntax the AI might accidentally add
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log("AI Response:", text); // Check your terminal, this should now be pure JSON
        
        res.json(JSON.parse(text));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));