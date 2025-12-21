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

// --- HELPER: FIND A WORKING MODEL ---
async function findActiveModel(apiKey) {
    console.log("🔍 Scanning for available models...");
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (!data.models) {
            console.error("❌ No models found. Raw response:", data);
            return null;
        }

        // Look for any model that starts with 'models/gemini' and supports content generation
        const activeModel = data.models.find(m => 
            m.name.includes('gemini') && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        if (activeModel) {
            console.log(`✅ Found active model: ${activeModel.name}`);
            return activeModel.name; // e.g., 'models/gemini-pro'
        }
        
        return "models/gemini-pro"; // Fallback

    } catch (error) {
        console.error("⚠️ Could not list models:", error.message);
        return "models/gemini-pro"; // Fallback
    }
}

// --- ROUTE 1: EXTRACT TEXT ---
app.post('/extract-text', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.json({ success: false, error: "No file uploaded." });
        const data = await pdf(req.file.buffer);
        res.json({ success: true, text: data.text.trim() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ROUTE 2: ANALYZE (Smart Mode) ---
app.post('/analyze', async (req, res) => {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText || !jobDescription) return res.json({ analysis: "⚠️ Missing text." });

    // 1. Prepare Key
    const API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
    
    // 2. Find the Right Model Name Dynamically
    const modelName = await findActiveModel(API_KEY);
    
    if (!modelName) {
        return res.json({ analysis: "❌ Critical Error: Your API Key has access to 0 models. Please create a key in a new project." });
    }

    // 3. Construct URL using the found name
    // Note: modelName already includes 'models/', so we don't add it again.
    // We strip 'models/' if it exists to be safe for the URL format.
    const cleanModelName = modelName.replace('models/', '');
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${API_KEY}`;

    console.log(`🚀 Sending request to: ${cleanModelName}`);

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
        res.json({ analysis: analysis });

    } catch (error) {
        console.error("🔥 API Error:", error.message);
        res.json({ 
            analysis: `❌ API ERROR: ${error.message}\n\n(Model used: ${cleanModelName})` 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});