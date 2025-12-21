const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 🟢 WORKING ENGINE: pdf-extraction ---
// Your logs confirmed this works perfectly (Found 816 chars)
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
            extractedText = "⚠️ WARNING: This PDF seems empty. Please use a standard text PDF.";
        }
        res.json({ success: true, text: extractedText });

    } catch (error) {
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
    Task: Match Score (0-100%), 3 missing keywords, 2 improvements.
    `;

    try {
        // STRATEGY 1: Try the standard Flash model
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await modelFlash.generateContent(prompt);
        const response = await result.response;
        return res.json({ analysis: response.text() });

    } catch (err1) {
        console.log("⚠️ Flash failed, switching to Backup (Gemini Pro)...");
        
        try {
            // STRATEGY 2: Backup with Gemini Pro (Old Faithful)
            const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await modelPro.generateContent(prompt);
            const response = await result.response;
            return res.json({ analysis: response.text() });

        } catch (err2) {
            console.error("🔥 All Models Failed:", err2.message);
            // CRITICAL: Send the error to the user's screen so they see it!
            return res.json({ 
                analysis: `❌ API ERROR:\n${err2.message}\n\nPlease check that your Google Gemini API Key is valid and has credits.` 
            });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});