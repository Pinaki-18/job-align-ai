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
            console.log(`--- 2. PDF Parsed Successfully (${resumeText.length} chars) ---`);
        } catch (pdfError) {
            console.error('PDF Error:', pdfError);
            return res.status(500).json({ error: 'Failed to read PDF file.' });
        }

        // --- GEMINI CONFIG ---
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        });

        // --- STRICT ATS PROMPT ---
        const prompt = `
You are an ATS resume analyzer.

STRICT RULES:
- Do NOT role-play.
- Do NOT act as a hiring manager.
- Do NOT address the candidate by name.
- Do NOT add greetings, opinions, or encouragement.
- Use neutral, professional, ATS-style language.
- Return ONLY valid JSON.

TASK:
Compare the resume with the job description and evaluate alignment.

JOB DESCRIPTION:
${req.body.jobDesc}

RESUME:
${resumeText}

OUTPUT FORMAT (JSON ONLY):
{
  "matchScore": number,
  "missingKeywords": ["skill1", "skill2"],
  "summary": "One-paragraph neutral summary describing alignment and gaps."
}
`;

        console.log('--- 3. Sending to Gemini ---');
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        console.log('--- 4. Response Received ---');

        // --- CLEAN & PARSE JSON ---
        const cleanText = text.replace(/```json|```/g, '').trim();
        const parsedResponse = JSON.parse(cleanText);

        res.json(parsedResponse);

    } catch (error) {
        console.error('CRITICAL SERVER ERROR:', error);
        res.status(500).json({
            error: 'AI Analysis Failed',
            details: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`\n🟢 SERVER RUNNING on http://localhost:${port}\n`);
});
