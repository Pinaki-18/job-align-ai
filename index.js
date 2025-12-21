const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-extraction');

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. TRIM THE KEY (Removes accidental spaces from copy-pasting)
const apiKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
const genAI = new GoogleGenerativeAI(apiKey);

// 2. USE THE PINNED VERSION (Fixes the 404 Error)
// 'gemini-1.5-flash' is an alias. 'gemini-1.5-flash-001' is the specific version.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

// --- ROUTE 1: EXTRACT TEXT ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: "No file uploaded." });
        
        console.log("📄 Processing PDF...");
        const data = await pdf(req.file.buffer);
        let extractedText = data.text.trim();
        
        console.log(`✅ PDF Success! Found ${extractedText.length} characters.`);
        res.json({ success: true, text: extractedText });

    } catch (error) {
        res.status(500).json({ success: false, error: "PDF Error: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE ---
app.post('/analyze', async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText || !jobDescription) return res.json({ analysis: "⚠️ Please provide both Resume and Job Description." });

    console.log("🧠 Attempting AI Analysis...");
    
    const prompt = `
    Act as a strict hiring manager.
    RESUME: "${resumeText.substring(0, 3000)}"
    JOB DESCRIPTION: "${jobDescription.substring(0, 3000)}"
    
    Output Format:
    1. MATCH SCORE: [0-100]%
    2. MISSING KEYWORDS: [List 3]
    3. IMPROVEMENT TIPS: [List 2]
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("✅ AI Success!");
        res.json({ analysis: text });

    } catch (error) {
        console.error("🔥 AI Error:", error);
        return res.json({ 
            analysis: `❌ API ERROR: ${error.message}\n\n(If this persists, your API Key might be for a Project that doesn't have the 'Generative Language API' enabled. Check console.cloud.google.com)` 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});