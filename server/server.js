const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse'); 
require('dotenv').config();

const app = express();
const port = 5001; // Using 5001 to avoid "Ghost" servers

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No PDF file uploaded" });
        if (!req.body.jobDesc) return res.status(400).json({ error: "No Job Description provided" });

        console.log("1. Parsing PDF...");
        // Simple PDF Parsing (Fixed)
        const pdfData = await pdf(req.file.buffer);
        const resumeText = pdfData.text;

        console.log("2. Sending to Gemini...");
        // AI Configuration
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

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("3. Success! Sending Data.");
        res.json(JSON.parse(text));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));