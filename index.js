const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const pdf = require('pdf-extraction'); 

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- ROUTE 1: EXTRACT TEXT ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: "No file uploaded." });
        console.log("📄 Processing PDF...");
        const data = await pdf(req.file.buffer);
        res.json({ success: true, text: data.text.trim() });
    } catch (error) {
        res.status(500).json({ success: false, error: "PDF Error: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE (Direct Connection) ---
app.post('/analyze', async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText || !jobDescription) return res.json({ analysis: "⚠️ Missing text." });

    console.log("🧠 Connecting to Google (Standard Model)...");
    
    // 1. Get Key
    const API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    
    // 2. URL for the STANDARD model (This works once API is enabled)
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

    const requestBody = {
        contents: [{
            parts: [{
                text: `Act as a hiring manager. Match Score & Tips for: \nRESUME: ${resumeText.substring(0, 3000)} \n JD: ${jobDescription.substring(0, 3000)}`
            }]
        }]
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const analysis = data.candidates[0].content.parts[0].text;
        console.log("✅ AI Success!");
        res.json({ analysis: analysis });

    } catch (error) {
        console.error("🔥 API Error:", error.message);
        res.json({ 
            analysis: `❌ API ERROR: ${error.message}\n\n(Note: Google takes 2-3 minutes to activate the API after you click 'Enable'. If you just clicked it, wait a moment and try again.)` 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});