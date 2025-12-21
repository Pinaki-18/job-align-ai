const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- 🛑 THE FIX IS HERE 🛑 ---
// We import the library as a generic object first
const pdfLib = require('pdf-parse');
// Then we check: Is the function inside .default? If yes, grab it. If no, use the object.
const pdfParse = pdfLib.default || pdfLib; 
// -----------------------------

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- ROUTE 1: EXTRACT TEXT ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, error: "No file uploaded." });
        }

        console.log("📄 PDF Library Type:", typeof pdfParse); // This log will prove it's fixed

        // Now we can safely call it because we fixed the import above
        const data = await pdfParse(req.file.buffer);
        let extractedText = data.text.trim();

        console.log(`✅ Text Extracted. Length: ${extractedText.length}`);

        if (extractedText.length < 50) {
            extractedText = "⚠️ WARNING: We found almost no text. This might be an image-based PDF.";
        }

        res.json({ success: true, text: extractedText });

    } catch (error) {
        console.error("🔥 PDF Error:", error);
        res.status(500).json({ success: false, error: "PDF Parsing failed: " + error.message });
    }
});

// --- ROUTE 2: ANALYZE ---
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