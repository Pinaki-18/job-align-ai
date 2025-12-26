const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log('--- 1. Request Received ---');

        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (!req.body.jobDesc) {
            return res.status(400).json({ error: 'No Job Description provided' });
        }

        // --- PDF PARSING ---
        let resumeText = '';
        try {
            const pdfData = await pdf(req.file.buffer);
            resumeText = pdfData.text;
            console.log(`--- 2. PDF Parsed (${resumeText.length} chars) ---`);
        } catch (err) {
            console.error('PDF Parse Error:', err);
            return res.status(500).json({ error: 'Failed to read PDF file' });
        }

        // --- GEMINI MODEL ---
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1,
                topP: 0.8
            }
        });

        // --- HARD-LOCKED ATS PROMPT ---
        const result = await model.generateContent([
            {
                role: 'user',
                parts: [{
                    text: `
SYSTEM INSTRUCTION (MANDATORY):
You are an automated ATS resume evaluation engine.

NON-NEGOTIABLE RULES:
- You MUST NOT role-play.
- You MUST NOT act as a hiring manager.
- You MUST NOT mention or address any person by name.
- You MUST NOT include headings, sections, or commentary.
- You MUST NOT add opinions or conversational language.
- You MUST output ONLY valid JSON.
- Any rule violation is a failure.

--------------------------------------------------

TASK:
Evaluate how well the resume matches the job description.

JOB DESCRIPTION:
${req.body.jobDesc}

RESUME:
${resumeText}

OUTPUT FORMAT (JSON ONLY):
{
  "matchScore": number,
  "missingKeywords": ["skill1", "skill2"],
  "summary": "Neutral ATS-style summary of alignment and gaps."
}
`
                }]
            }
        ]);

        console.log('--- 3. Gemini Response Received ---');

        const rawText = result.response.text();
        const cleanText = rawText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanText);

        res.json(parsed);

    } catch (error) {
        console.error('CRITICAL ERROR:', error);
        res.status(500).json({
            error: 'AI Analysis Failed',
            details: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`\n🟢 SERVER RUNNING → http://localhost:${port}\n`);
});
