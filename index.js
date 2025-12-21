const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 🟢 WORKING ENGINE: pdf-extraction ---
// We are keeping this because your logs PROVED it works (Found 816 chars)
const pdf = require('pdf-extraction'); 
// -----------------------------------------

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 🛡️ AI CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// WE ARE SWITCHING TO 'gemini-pro'
// Why? Because 'gemini-1.5-flash' was giving you 404 errors.
// 'gemini-pro' is the standard, stable model that works everywhere.
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- ROUTE 1: EXTRACT TEXT (Proven to Work) ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, error: "No file uploaded." });
        }

        console.log("📄 PDF Uploaded. Starting extraction...");

        const data = await pdf(req.file.buffer);
        let extractedText = data.text.trim();

        // Log the success for your peace of mind
        console.log(`✅ Success! Found ${extractedText.length} characters.`);

        if (extractedText.length < 50) {
            extractedText = "⚠️ WARNING: Text is too short. Please upload a standard text-based PDF.";
        }

        res.json({ success: true, text: extractedText });

    } catch (error) {
        console.error("🔥 PDF Error:", error);
        res.status(500).json({ success: false, error: "Server Error: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE (Using the Safe Model) ---
app.post('/analyze', async (req, res) => {
    try {
        const { resumeText, jobDescription } = req.body;
        
        if (!resumeText || !jobDescription) {
            return res.json({ error: "Missing Resume or Job Description text." });
        }

        console.log("🧠 AI Analysis Requested...");

        const prompt = `
        You are an expert technical recruiter. 
        Compare the RESUME to the JOB DESCRIPTION below.
        
        RESUME:
        "${resumeText.substring(0, 3000)}"
        
        JOB DESCRIPTION:
        "${jobDescription.substring(0, 3000)}"
        
        OUTPUT FORMAT:
        1. Match Score: [0-100]%
        2. Missing Skills: [List 3 key missing skills]
        3. Improvement Tips: [List 2 specific tips]
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysisText = response.text();
        
        console.log("✅ AI Response Successfully Generated!");
        res.json({ analysis: analysisText });

    } catch (error) {
        console.error("🔥 AI Error:", error);
        
        // This will print the exact reason if it fails, so we don't have to guess
        res.status(500).json({ 
            error: "AI Failed. Check Server Logs.", 
            details: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});