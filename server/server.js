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
        
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        
        // ✅ STRONGER PROMPT - Forces objective analysis format
        const prompt = `
            You are a resume analysis system. Analyze the resume against the job description and provide ONLY a technical compatibility report.
            
            Job Description: "${req.body.jobDesc}"
            Resume Content: "${resumeText}"
            
            CRITICAL RULES:
            1. Do NOT write as a hiring manager or recruiter
            2. Do NOT address anyone by name or use "you/your"
            3. Do NOT give advice or tips
            4. Do NOT use conversational tone
            5. Write ONLY an objective technical assessment
            
            Output format (follow EXACTLY):
            
            Match Score: [X]/10
            
            Missing Keywords:
            - [keyword 1]
            - [keyword 2]
            - [keyword 3]
            - [keyword 4]
            
            Summary:
            [Write 2-3 sentences analyzing technical skill alignment between resume and job description. Use third-person objective language only.]
            
            Example of correct tone: "The resume demonstrates Python experience through project work. Missing explicit mentions of Django and PostgreSQL frameworks listed in job requirements. Overall technical alignment is moderate."
            
            Example of INCORRECT tone (do NOT use): "Aditya, your resume shows great Python skills! Here are some tips..."
        `;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("--- AI Output Received ---");
        console.log(text);
        
        // ---------------------------------------------------------
        // Extract structured data from response
        // ---------------------------------------------------------
        
        // 1. Extract Score
        let matchScore = 70;
        const scoreRegex = /Match Score[:\s]*([\d\.]+)/i;
        const scoreMatch = text.match(scoreRegex);
        
        if (scoreMatch && scoreMatch[1]) {
            let rawNum = parseFloat(scoreMatch[1]);
            matchScore = rawNum <= 10 ? rawNum * 10 : rawNum;
        }
        
        // 2. Extract Missing Keywords
        let missingKeywords = ["Technical alignment needs improvement"];
        const keywordSection = text.match(/Missing Keywords?:([\s\S]*?)(?=Summary:|$)/i);
        
        if (keywordSection && keywordSection[1]) {
            const keywords = keywordSection[1]
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.match(/^[-•*]\s*.+/))
                .map(line => line.replace(/^[-•*]\s*/, '').trim())
                .filter(line => line.length > 0 && line.length < 100);
            
            if (keywords.length > 0) {
                missingKeywords = keywords.slice(0, 10); // Limit to 10 keywords
            }
        }
        
        // 3. Extract Summary
        let summary = "Technical analysis completed.";
        const summarySection = text.match(/Summary:([\s\S]*?)$/i);
        
        if (summarySection && summarySection[1]) {
            const extractedSummary = summarySection[1].trim();
            // Filter out any "tips" or advice-giving language
            if (!extractedSummary.toLowerCase().includes('tip') && 
                !extractedSummary.toLowerCase().includes('advice') &&
                !extractedSummary.toLowerCase().includes('you should')) {
                summary = extractedSummary.substring(0, 300);
            }
        }
        
        const finalData = {
            matchScore: Math.round(matchScore),
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        console.log(`--- Parsed Score: ${finalData.matchScore} ---`);
        console.log(`--- Keywords: ${finalData.missingKeywords.join(', ')} ---`);
        
        res.json(finalData);
        
    } catch (error) {
        console.error("Server Error:", error.message);
        res.json({
            matchScore: 0,
            missingKeywords: ["Analysis failed"],
            summary: "Unable to process resume analysis."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SCRAPER SERVER READY on http://localhost:${port}\n`));