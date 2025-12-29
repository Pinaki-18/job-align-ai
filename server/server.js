const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// --- PDF SETUP ---
let pdfParseLib;
try {
    pdfParseLib = require('pdf-parse');
} catch (err) { 
    console.error("PDF Lib missing"); 
}

async function parsePDF(buffer) {
    if (!pdfParseLib) return "PDF Error";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) { 
        return ""; 
    }
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
        const jobDesc = req.body.jobDesc || "";
        
        console.log("--- Asking Gemini... ---");
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 0.3,
            }
        });
        
        const prompt = `
            ROLE: You are an automated ATS (Applicant Tracking System) generating a technical compatibility report.
            
            REQUIRED OUTPUT FORMAT (follow exactly):
            
            Match Score: [number]/10
            
            Missing Keywords:
            - [keyword]
            - [keyword]
            - [keyword]
            
            Summary:
            [Technical assessment in passive voice. Maximum 3 sentences. No personal pronouns.]
            
            ---
            
            STRICT RULES:
            ❌ DO NOT use: "you", "your", names, "hiring manager", "tips", "advice", "recommendations"
            ❌ DO NOT include extra sections, headers, or formatting
            ❌ DO NOT use conversational tone
            ✓ USE: passive voice, third-person, factual analysis only
            
            ---
            
            Job Description: "${jobDesc}"
            
            Resume Content: "${resumeText}"
            
            Begin response with "Match Score:" immediately.
        `;
        
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        console.log("--- Raw AI Output ---");
        console.log(text);
        
        // Filter out unwanted content
        const blockedPhrases = [
            /okay,?\s*\w+/gi,
            /let'?s take a look/gi,
            /hiring manager/gi,
            /your (profile|resume|experience|skills)/gi,
            /\b(you|your|you're|you have)\b/gi,
            /tips for/gi,
            /here('s| are) some/gi,
            /i('d| would) recommend/gi,
            /###+ .*/g,
            /\*\*.*?\*\*/g,
        ];
        
        blockedPhrases.forEach(regex => {
            text = text.replace(regex, '');
        });
        
        // Extract core content only
        const coreMatch = text.match(/Match Score:([\s\S]*)/i);
        if (coreMatch) {
            text = "Match Score:" + coreMatch[1];
        }
        
        // ---------------------------------------------------------
        // Parse Response Data
        // ---------------------------------------------------------
        
        // 1. Extract and convert score to percentage
        let matchScore = 70;
        const scoreRegex = /Match Score[:\s]*([\d\.]+)/i;
        const scoreMatch = text.match(scoreRegex);
        
        if (scoreMatch && scoreMatch[1]) {
            let rawNum = parseFloat(scoreMatch[1]);
            matchScore = rawNum <= 10 ? rawNum * 10 : rawNum;
        }
        
        matchScore = Math.max(0, Math.min(100, Math.round(matchScore)));
        
        // 2. Extract missing keywords
        let missingKeywords = ["No specific gaps identified"];
        const keywordSection = text.match(/Missing Keywords?:([\s\S]*?)(?=Summary:|$)/i);
        
        if (keywordSection && keywordSection[1]) {
            const keywords = keywordSection[1]
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.match(/^[-•*]\s*.+/))
                .map(line => line.replace(/^[-•*]\s*/, '').trim())
                .filter(line => line.length > 2 && line.length < 100);
            
            if (keywords.length > 0) {
                missingKeywords = keywords.slice(0, 10);
            }
        }
        
        // 3. Extract summary
        let summary = "Technical compatibility analysis completed.";
        const summarySection = text.match(/Summary:([\s\S]*?)$/i);
        
        if (summarySection && summarySection[1]) {
            let extractedSummary = summarySection[1]
                .trim()
                .split('\n')[0]
                .substring(0, 300);
            
            const hasBlockedContent = /\b(you|your|aditya|tips|advice|should|improve)\b/i.test(extractedSummary);
            
            if (!hasBlockedContent && extractedSummary.length > 20) {
                summary = extractedSummary;
            }
        }
        
        // Build response
        const finalData = {
            matchScore: matchScore,
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        console.log(`--- Analysis Complete ---`);
        console.log(`Match Score: ${finalData.matchScore}%`);
        console.log(`Missing Keywords: ${finalData.missingKeywords.length} found`);
        
        res.json(finalData);
        
    } catch (error) {
        console.error("❌ Server Error:", error.message);
        res.status(500).json({
            matchScore: 0,
            missingKeywords: ["Analysis failed - server error"],
            summary: "Unable to complete analysis due to technical error."
        });
    }
});

app.listen(port, () => {
    console.log(`\n🟢 SERVER RUNNING on http://localhost:${port}`);
    console.log(`📊 Ready to analyze resumes\n`);
});