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
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 0.3,
            }
        });
        
        const prompt = `
            ROLE: You are an automated ATS (Applicant Tracking System) generating a technical compatibility score.
            
            STRICT OUTPUT FORMAT REQUIRED - NO DEVIATION ALLOWED:
            
            Match Score: [number]/10
            
            Missing Keywords:
            - [keyword]
            - [keyword]
            - [keyword]
            
            Summary:
            [Technical assessment in passive voice, third-person only. Maximum 3 sentences.]
            
            ---
            
            PROHIBITED CONTENT - DO NOT INCLUDE:
            ❌ Names of candidates
            ❌ Words: "you", "your", "Aditya", "hiring manager", "tips", "advice", "improve", "boost", "should"
            ❌ Bullet point sections titled "Strengths", "Tips", "Action Items", "Recommendations"
            ❌ Conversational greetings or sign-offs
            ❌ Any text outside the 3-section format above
            
            REQUIRED STYLE:
            ✓ Use passive voice: "Python experience is demonstrated" NOT "You demonstrate Python"
            ✓ Be factual and robotic
            ✓ Stick to the format above ONLY
            
            ---
            
            Job Description: "${req.body.jobDesc}"
            
            Resume Content: "${resumeText}"
            
            Generate ONLY the 3-section output above. Begin with "Match Score:" immediately.
        `;
        
        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        console.log("--- Raw AI Output ---");
        console.log(text);
        
        // Aggressive filtering
        const blockedPhrases = [
            /okay,?\s*aditya/gi,
            /let'?s take a look/gi,
            /hiring manager/gi,
            /your (profile|resume|experience)/gi,
            /\byou('re| are| have)\b/gi,
            /tips for/gi,
            /here('s| are) some/gi,
            /i('d| would) recommend/gi,
            /### .*/g,
            /\*\*.*?\*\*/g,
        ];
        
        blockedPhrases.forEach(regex => {
            text = text.replace(regex, '');
        });
        
        const coreMatch = text.match(/Match Score:([\s\S]*)/i);
        if (coreMatch) {
            text = "Match Score:" + coreMatch[1];
        }
        
        // ---------------------------------------------------------
        // Extract structured data
        // ---------------------------------------------------------
        
        // 1. Extract Score and convert to percentage
        let matchScore = 70; // Default 70%
        const scoreRegex = /Match Score[:\s]*([\d\.]+)/i;
        const scoreMatch = text.match(scoreRegex);
        
        if (scoreMatch && scoreMatch[1]) {
            let rawNum = parseFloat(scoreMatch[1]);
            // Convert to percentage (0-100 scale)
            if (rawNum <= 10) {
                matchScore = Math.round(rawNum * 10); // 8/10 becomes 80%
            } else {
                matchScore = Math.round(rawNum); // Already in percentage
            }
        }
        
        // Ensure it stays within 0-100 range
        matchScore = Math.max(0, Math.min(100, matchScore));
        
        // 2. Extract Missing Keywords
        let missingKeywords = ["Review required for detailed assessment"];
        const keywordSection = text.match(/Missing Keywords?:([\s\S]*?)(?=Summary:|$)/i);
        
        if (keywordSection && keywordSection[1]) {
            const keywords = keywordSection[1]
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.match(/^[-•*]\s*.+/))
                .map(line => line.replace(/^[-•*]\s*/, '').trim())
                .filter(line => line.length > 2 && line.length < 80);
            
            if (keywords.length > 0) {
                missingKeywords = keywords.slice(0, 8);
            }
        }
        
        // 3. Extract Summary
        let summary = "Automated technical compatibility analysis completed.";
        const summarySection = text.match(/Summary:([\s\S]*?)$/i);
        
        if (summarySection && summarySection[1]) {
            let extractedSummary = summarySection[1]
                .trim()
                .split('\n')[0]
                .substring(0, 250);
            
            const hasBlockedContent = /\b(you|your|aditya|tips|advice|should|improve)\b/i.test(extractedSummary);
            
            if (!hasBlockedContent && extractedSummary.length > 20) {
                summary = extractedSummary;
            }
        }
        
        // ✅ Return percentage-based score
        const finalData = {
            matchScore: matchScore, // Now it's 80 instead of 8
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        console.log(`--- Final Parsed Data ---`);
        console.log(`Match Score: ${finalData.matchScore}%`); // Shows "80%"
        console.log(JSON.stringify(finalData, null, 2));
        
        res.json(finalData);
        
    } catch (error) {
        console.error("Server Error:", error.message);
        res.json({
            matchScore: 0,
            missingKeywords: ["System error during analysis"],
            summary: "Unable to complete automated analysis."
        });
    }
});

app.listen(port, () => console.log(`\n🟢 SCRAPER SERVER READY on http://localhost:${port}\n`));