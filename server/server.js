const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("--- 1. Request Received ---");

        // Check if resume file is uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        // Parse the PDF resume
        console.log("--- 2. Parsing PDF Resume ---");
        const pdfData = await pdfParse(req.file.buffer);
        const resumeText = pdfData.text;

        console.log("--- 3. Calling Gemini API ---");

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
        });

        const prompt = `
            You are a hiring manager. Analyze this candidate's resume against the job description.
            
            Job Description: "${req.body.jobDesc}"
            
            Resume Content: "${resumeText}"
            
            Provide your analysis in valid JSON format with the following structure:
            {
                "matchScore": <number between 0-100>,
                "missingKeywords": [<array of missing important keywords>],
                "summary": "<brief summary of candidate fit>"
            }
            
            Only return the JSON object, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("--- 4. Success! Response received. ---");
        
        // Clean the response
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanText));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ 
            error: error.message,
            details: "Failed to analyze resume. Check server logs for details."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SERVER RUNNING on http://localhost:${port}\n`));