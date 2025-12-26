const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- BULLETPROOF PDF PARSER ---
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
        throw err;
    }
}
// ------------------------------

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get('/', (req, res) => res.send('Server is running.'));

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        const file = req.file;
        const jobDescription = req.body.jobDesc;

        if (!file || !jobDescription) return res.status(400).json({ error: "Missing data" });

        // 1. Parse PDF
        let resumeText = "";
        try {
            const pdfData = await parsePDF(file.buffer);
            resumeText = pdfData.text || "";
        } catch (e) {
            console.error("PDF Parse Error:", e);
        }

        // 2. Strict JSON Prompt
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Act as a strict data parser. 
            Job Description: "${jobDescription}"
            Resume Content: "${resumeText}"
            
            Instructions:
            1. Analyze the match between the resume and JD.
            2. Return ONLY a valid JSON object. 
            3. DO NOT write any introductory text (no "Here is the analysis", no "JSON:").
            4. DO NOT use markdown code blocks (\`\`\`json). Just the raw object.
            
            Required JSON Structure:
            {
                "matchScore": 0, // Integer between 0 and 100
                "missingKeywords": ["Skill1", "Skill2"], // Array of missing hard skills from JD
                "summary": "2 sentence professional summary of the fit."
            }
        `;

        const result = await model.generateContent(prompt);
        
        // 3. Clean the output just in case AI adds markdown
        let text = result.response.text();
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log("Gemini Output:", text); // Log it so you can see it in terminal
        
        res.json(JSON.parse(text));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));