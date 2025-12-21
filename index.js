const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse'); // Renamed to avoid errors
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- ROUTE 1: EXTRACT TEXT FROM PDF ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    console.log("👉 HIT /extract-text Endpoint");
    
    try {
        if (!req.file) {
            console.log("❌ No file received");
            return res.json({ success: false, error: "No file uploaded." });
        }

        console.log("✅ File received:", req.file.originalname);

        // USE THE RENAMED TOOL HERE:
        const data = await pdfParse(req.file.buffer);
        
        let extractedText = data.text.trim();
        console.log(`✅ PDF Parsed. Text length: ${extractedText.length}`);

        if (extractedText.length < 50) {
            extractedText = "⚠️ WARNING: We found almost no text in this PDF. It might be a scanned image or a photo-based resume. Please use a standard text PDF.";
        }

        res.json({ success: true, text: extractedText });

    } catch (error) {
        console.error("🔥 CRASH:", error.message);
        res.status(500).json({ success: false, error: "Server Error: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE RESUME WITH AI ---
app.post('/analyze', async (req, res) => {
    try {
        const { resumeText, jobDescription } = req.body;
        if (!resumeText || !jobDescription) return res.json({ error: "Missing text" });

        const prompt = `
        Act as a strict hiring manager.
        RESUME: "${resumeText.substring(0, 3000)}"
        JOB DESCRIPTION: "${jobDescription.substring(0, 3000)}"
        
        Task: Give a Match Score (0-100%), 3 missing keywords, and 2 improvements.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        res.json({ analysis: response.text() });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "AI Analysis failed." });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});