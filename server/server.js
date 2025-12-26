const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- BULLETPROOF PDF PARSER IMPORT ---
// This handles every possible version of the library (Class, Function, or Default)
let pdfLibrary = require('pdf-parse');

async function parsePDF(buffer) {
    try {
        // Method 1: Standard Function Call (Most common)
        if (typeof pdfLibrary === 'function') {
             return await pdfLibrary(buffer);
        }
        // Method 2: Default Export (Common in newer Node versions)
        if (pdfLibrary.default && typeof pdfLibrary.default === 'function') {
            return await pdfLibrary.default(buffer);
        }
        // Method 3: Class Constructor (The error you saw earlier)
        // We try to instantiate it if the function call fails
        const Parser = pdfLibrary.default || pdfLibrary;
        return new Parser(buffer);
    } catch (err) {
        // If Method 1 failed because it's a class, try Method 3 specifically here
        if (err.message.includes("Class constructor")) {
             const Parser = pdfLibrary;
             return new Parser(buffer);
        }
        throw err;
    }
}
// --------------------------------------

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

        console.log(`[1] Processing file: ${file.originalname} (${file.size} bytes)`);

        let resumeText = "";
        
        try {
            const pdfData = await parsePDF(file.buffer);
            resumeText = pdfData.text || "";
            // Clean up text (remove excessive newlines)
            resumeText = resumeText.replace(/\n\s*\n/g, '\n').trim();
            console.log(`[2] PDF Parsed. Text length: ${resumeText.length} characters.`);
        } catch (pdfError) {
            console.error("[ERROR] PDF Parsing failed:", pdfError.message);
            resumeText = ""; // Continue even if parsing fails
        }

        // If text is empty, warn the user but don't crash
        if (resumeText.length < 50) {
            console.warn("[WARNING] Resume text is very short or empty. This might be an image PDF.");
            resumeText = " [Note to AI: The resume text could not be extracted (it might be an image). Please analyze based on what you can infer, or return a match score of 0 and suggest uploading a text-based PDF.] ";
        }

        console.log("[3] Sending to Gemini...");
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
            Act as an API that parses resumes against JDs.
            Job Description: "${jobDescription}"
            Resume Content: "${resumeText}"
            
            Analysis Rules:
            1. You are NOT a human. Do NOT speak. Do NOT say "Here is the analysis".
            2. Return ONLY a JSON object. Nothing else.
            3. If the resume is an image/empty, set matchScore to 0.

            Output Format (JSON ONLY):
            {
                "matchScore": 65,
                "missingKeywords": ["Git", "SQL", "Unit Testing"],
                "summary": "Candidate has strong React/Node skills but lacks required backend fundamentals like SQL and Git."
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        console.log("[4] Gemini Response Received");
        res.json(JSON.parse(text));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));