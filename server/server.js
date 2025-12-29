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
    console.error("⚠️  PDF Library missing"); 
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

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze', upload.single('resume'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log("\n" + "=".repeat(50));
        console.log("🎯 NEW ANALYSIS REQUEST");
        console.log("=".repeat(50));
        
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";
        const jobDesc = req.body.jobDesc || "";
        
        console.log(`📄 Resume: ${resumeText.length} chars`);
        console.log(`📋 Job Desc: ${jobDesc.length} chars`);
        console.log("🤖 Calling Gemini AI...\n");
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 0.1, // VERY LOW for robotic output
                topP: 0.5,
            }
        });

        // NUCLEAR PROMPT - Forces ATS scanner mode
        const prompt = `Act as an automated ATS scanner. Generate ONLY this exact structure:

Match Score: [number 50-95]%

Technical Analysis:
[Exactly 2 factual sentences. Third-person only. State what skills match and what's missing. NO advice, NO "you/your".]

Missing Skills:
- [skill from job description]
- [skill from job description]
- [skill from job description]

JOB REQUIREMENTS:
${jobDesc}

RESUME DATA:
${resumeText}

FORBIDDEN: Do NOT write "Aditya", "you", "your", "hiring manager", "tips", "should", "recommend", conversational tone, extra sections, or personal advice.

START OUTPUT (begin with "Match Score:"):`;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        
        console.log("📥 RAW RESPONSE:");
        console.log(text.substring(0, 200) + "...\n");
        
        // AGGRESSIVE FILTERING
        const killPhrases = [
            /okay,?\s+\w+/gi,
            /let'?s (take a look|break down|analyze)/gi,
            /hiring manager/gi,
            /dear \w+/gi,
            /hi \w+/gi,
            /\b(you|your|you're|you have|you should)\b/gi,
            /(tips?|advice|recommend|improve|boost|should consider)/gi,
            /###+ .*/g,
            /\*\*/g,
        ];
        
        killPhrases.forEach(regex => {
            text = text.replace(regex, '');
        });
        
        // Extract only core content
        const coreMatch = text.match(/Match Score:([\s\S]*)/i);
        if (coreMatch) {
            text = "Match Score:" + coreMatch[1];
        }
        
        // 1. EXTRACT SCORE
        let matchScore = 70;
        const scoreMatch = text.match(/Match Score[:\s]*([\d\.]+)/i);
        
        if (scoreMatch && scoreMatch[1]) {
            let score = parseFloat(scoreMatch[1]);
            if (score <= 1) score *= 100;
            if (score <= 10) score *= 10;
            matchScore = Math.max(50, Math.min(95, Math.round(score)));
        }
        
        console.log(`✓ Score: ${matchScore}%`);
        
        // 2. EXTRACT SUMMARY
        let summary = "Automated technical scan completed.";
        const summaryPatterns = [
            /Technical Analysis[:\s\n]+([\s\S]*?)(?=Missing|$)/i,
            /Analysis[:\s\n]+([\s\S]*?)(?=Missing|$)/i,
            /Initial Impression[:\s\n]+([\s\S]*?)(?=Missing|$)/i,
        ];
        
        for (const pattern of summaryPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                let extracted = match[1]
                    .replace(/[*#\n]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                // Remove sentences with forbidden words
                const sentences = extracted.split(/[.!?]+/).filter(s => {
                    const lower = s.toLowerCase();
                    return s.length > 20 &&
                           !lower.includes('you ') &&
                           !lower.includes('your ') &&
                           !lower.includes('should') &&
                           !lower.includes('tip');
                });
                
                if (sentences.length >= 1) {
                    summary = sentences.slice(0, 2).join('. ').trim() + '.';
                    break;
                }
            }
        }
        
        if (summary.length > 350) {
            summary = summary.substring(0, 347) + "...";
        }
        
        console.log(`✓ Summary: ${summary.substring(0, 50)}...`);
        
        // 3. EXTRACT KEYWORDS
        let missingKeywords = [];
        const keywordPatterns = [
            /Missing Skills[:\s\n]+([\s\S]*?)(?=$)/i,
            /Missing Keywords[:\s\n]+([\s\S]*?)(?=$)/i,
        ];
        
        for (const pattern of keywordPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const lines = match[1].split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.match(/^[-•*]\s+(.+)/)) {
                        const keyword = trimmed
                            .replace(/^[-•*]\s+/, '')
                            .replace(/[*_]/g, '')
                            .trim();
                        
                        if (keyword.length > 2 && keyword.length < 80) {
                            missingKeywords.push(keyword);
                        }
                    }
                }
                
                if (missingKeywords.length > 0) break;
            }
        }
        
        if (missingKeywords.length === 0) {
            missingKeywords = ["No critical gaps detected"];
        }
        
        missingKeywords = missingKeywords.slice(0, 8);
        console.log(`✓ Keywords: ${missingKeywords.length} found`);
        
        const finalData = {
            matchScore: matchScore,
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        const elapsed = Date.now() - startTime;
        console.log(`\n✅ COMPLETE (${elapsed}ms)`);
        console.log("=".repeat(50) + "\n");
        
        res.json(finalData);

    } catch (error) {
        console.error("\n❌ ERROR:", error.message, "\n");
        res.status(500).json({
            matchScore: 0,
            missingKeywords: ["Analysis failed"],
            summary: "Unable to complete scan."
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', gemini: !!process.env.GEMINI_API_KEY });
});

app.listen(port, () => {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 JOBALIGN AI SERVER");
    console.log("=".repeat(60));
    console.log(`📍 http://localhost:${port}`);
    console.log(`🤖 Gemini: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log("=".repeat(60) + "\n");
});