const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-extraction');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

//KEY
const API_KEY = process.env.GEMINI_API_KEY;

const upload = multer({ storage: multer.memoryStorage() });

// Route 1: Extract Text
app.post('/extract-text', upload.single('file'), async (req, res) => {
    console.log("👉 HIT /extract-text Endpoint");
    try {
        if (!req.file) {
            console.log("❌ ERROR: No file received. Name mismatch?");
            return res.json({ success: false, error: "No file" });
        }
        console.log("✅ File received:", req.file.originalname);

        const data = await pdf(req.file.buffer);
        console.log("✅ PDF Parsed. Text length:", data.text.length);
        
        res.json({ success: true, text: data.text });
    } catch (e) {
        console.error("🔥 CRASH:", e.message); // This will show us the real error
        res.json({ success: false, error: e.message });
    }
});

// Route 2: Analyze
app.post('/analyze', async (req, res) => {
    console.log("\n>> REQUEST RECEIVED. Using your specific model...");
    const { resumeText, jobDescription } = req.body;

    //  WE ARE USING A MODEL FROM YOUR LIST 
    const model = "gemini-2.5-flash";
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `
                        You are an ATS. Return JSON Only.
                        Compare Resume to JD.
                        Resume: ${resumeText.substring(0, 3000)}
                        JD: ${jobDescription.substring(0, 3000)}
                        Format: { "match_score": 85, "summary": "...", "missing_keywords": [] }
                    `}]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error(`❌ ERROR: ${data.error.message}`);
            throw new Error(data.error.message);
        }
        
        const text = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        console.log(">> SUCCESS: AI Responded!");
        res.json({ success: true, analysis: JSON.parse(text) });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// THIS ALLOWS RENDER TO SET THE PORT AUTOMATICALLY
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`\n✅ SERVER RUNNING on port ${PORT}`));