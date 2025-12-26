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

// --- PDF PARSER ---
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
        return { text: "" };
    }
}

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        const file = req.file;
        const jobDescription = req.body.jobDesc;

        if (!file || !jobDescription) return res.status(400).json({ error: "Missing data" });

        const pdfData = await parsePDF(file.buffer);
        const resumeText = pdfData.text || "";

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // --- STRICT PROMPT ---
        const prompt = `
            Act as a data API. 
            JD: "${jobDescription}"
            Resume: "${resumeText}"
            
            Return JSON ONLY. No text. No markdown.
            Structure:
            {
                "matchScore": 85,
                "missingKeywords": ["SQL", "Git", "API Integration"],
                "summary": "Candidate matches core React/Node stack well but lacks SQL/Git."
            }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        // --- SAFETY CLEANER ---
        // This removes the "Okay, here is the analysis..." text if the AI adds it
        const firstBracket = text.indexOf('{');
        const lastBracket = text.lastIndexOf('}');
        if (firstBracket !== -1 && lastBracket !== -1) {
            text = text.substring(firstBracket, lastBracket + 1);
        }
        
        console.log("Cleaned JSON:", text); // Check your terminal
        
        res.json(JSON.parse(text));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));