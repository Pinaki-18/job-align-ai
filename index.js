const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 🟢 WORKING ENGINE: pdf-extraction ---
// We use this because your logs PROVED it works (Found 816 chars)
const pdf = require('pdf-extraction'); 
// -----------------------------------------

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- ROUTE 1: EXTRACT TEXT (Proven to Work) ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: "No file uploaded." });
        
        console.log("📄 Processing PDF...");
        const data = await pdf(req.file.buffer);
        let extractedText = data.text.trim();
        
        console.log(`✅ PDF Success! Found ${extractedText.length} characters.`);

        if (extractedText.length < 50) {
            extractedText = "⚠️ WARNING: This PDF seems empty or is a scanned image. Please use a text-based PDF.";
        }
        res.json({ success: true, text: extractedText });

    } catch (error) {
        console.error("PDF Error:", error);
        res.status(500).json({ success: false, error: "PDF Error: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE (With Auto-Backup) ---
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
        // STRATEGY 1: Try standard Flash model
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await modelFlash.generateContent(prompt);
        const response = await result.response;
        return res.json({ analysis: response.text() });

    } catch (err1) {
        console.log("⚠️ Flash failed, switching to Backup (Gemini Pro)...");
        
        try {
            // STRATEGY 2: Backup with Gemini Pro
            const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await modelPro.generateContent(prompt);
            const response = await result.response;
            return res.json({ analysis: response.text() });

        } catch (err2) {
            console.error("🔥 All Models Failed:", err2.message);
            // SEND ERROR TO FRONTEND SO YOU CAN SEE IT
            return res.json({ 
                analysis: `❌ API ERROR: Your API Key is invalid or has no credits.\n\nTechnical Details: ${err2.message}\n\nPlease get a new key from aistudio.google.com.` 
            });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});