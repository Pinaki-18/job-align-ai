const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
// --- PDF SETUP ---
let pdfParseLib;
try {
    pdfParseLib = require('pdf-parse');
} catch (err) { console.error("PDF Lib missing"); }
async function parsePDF(buffer) {
    if (!pdfParseLib) return "PDF Error";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) { return ""; }
}
// -----------------
const app = express();
const port = 5001;
app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.post('/analyze', upload.single('resume'), async (req, res) => {
    try {
        console.log("--- Request Received ---");
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";
        console.log("--- Asking Gemini... ---");
        // Using 'gemini-pro' because it works, even if it is chatty
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // ✅ FIXED PROMPT - Clear, Direct Instructions
        const prompt = `
            Analyze this resume against the job description and provide a technical assessment.
            
            Job Description: "${req.body.jobDesc}"
            Resume Content: "${resumeText}"
            
            Provide your response in this EXACT format:
            
            Match Score: [number]/10
            
            Missing Keywords:
            - [keyword 1]
            - [keyword 2]
            - [keyword 3]
            
            Summary:
            [Brief 2-3 sentence technical assessment of the candidate's qualifications and fit]
            
            IMPORTANT INSTRUCTIONS:
            - Do NOT write as a hiring manager
            - Do NOT address the candidate directly
            - Do NOT use phrases like "Aditya" or "your profile" or "tips for you"
            - Write in third-person objective analysis only
            - Focus on technical skill matching and gaps
            - Keep it concise and factual
        `;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Output Received (Text Mode) ---");
        console.log(text); // Debug: see what Gemini returns
        
        // ---------------------------------------------------------
        // THE FIX: "Scrape" the data from the Essay
        // ---------------------------------------------------------
        // 1. Find the Score (e.g., "Match Score: 7.5/10")
        let matchScore = 70; // Safe default
        
        // Regex looks for a number (like 7, 7.5, 8) right after "Score"
        const scoreRegex = /Score[:\s]*([\d\.]+)/i;
        const found = text.match(scoreRegex);
        
        if (found && found[1]) {
            let rawNum = parseFloat(found[1]);
            // If it's 7.5, make it 75. If it's 8, make it 80.
            if (rawNum <= 10) {
                matchScore = rawNum * 10;
            } else {
                matchScore = rawNum;
            }
        }
        
        // 2. Extract Missing Keywords
        let missingKeywords = ["General Improvement"];
        const keywordSection = text.match(/Missing Keywords?:([\s\S]*?)(?=Summary:|$)/i);
        if (keywordSection && keywordSection[1]) {
            // Extract lines that start with - or bullet points
            const keywords = keywordSection[1]
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('-') || line.startsWith('•'))
                .map(line => line.replace(/^[-•]\s*/, '').trim())
                .filter(line => line.length > 0);
            
            if (keywords.length > 0) {
                missingKeywords = keywords;
            }
        }
        
        // 3. Extract Summary
        let summary = "Analysis completed successfully.";
        const summarySection = text.match(/Summary:([\s\S]*?)$/i);
        if (summarySection && summarySection[1]) {
            summary = summarySection[1].trim().substring(0, 250);
        }
        
        // 4. Force Build JSON
        const finalData = {
            matchScore: Math.round(matchScore),
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        console.log(`--- Parsed Score: ${finalData.matchScore} ---`);
        
        // Send ONLY JSON to frontend
        res.json(finalData);
    } catch (error) {
        console.error("Server Error:", error.message);
        res.json({
            matchScore: 0,
            missingKeywords: ["Server Error"],
            summary: "Failed to process AI response."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SCRAPER SERVER READY on http://localhost:${port}\n`));