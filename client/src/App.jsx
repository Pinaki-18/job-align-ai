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
    console.error("⚠️  PDF Library missing - install with: npm install pdf-parse"); 
}

async function parsePDF(buffer) {
    if (!pdfParseLib) return "PDF parsing unavailable";
    try {
        const parser = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default;
        const data = await parser(buffer);
        return data.text;
    } catch (err) { 
        console.error("❌ PDF Parse Error:", err.message);
        return ""; 
    }
}

// -----------------
const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================
// MAIN ANALYZE ENDPOINT
// ============================================
app.post('/analyze', upload.single('resume'), async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log("\n" + "=".repeat(50));
        console.log("🎯 NEW ANALYSIS REQUEST");
        console.log("=".repeat(50));
        
        // Extract resume text
        const resumeText = req.file ? await parsePDF(req.file.buffer) : "";
        const jobDesc = req.body.jobDesc || "";
        
        if (!resumeText || resumeText.length < 50) {
            throw new Error("Resume text too short or invalid");
        }
        
        if (!jobDesc || jobDesc.length < 20) {
            throw new Error("Job description too short");
        }
        
        console.log(`📄 Resume extracted: ${resumeText.length} characters`);
        console.log(`📋 Job description: ${jobDesc.length} characters`);
        
        console.log("\n🤖 Calling Gemini AI...");
        
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            generationConfig: {
                temperature: 0.4, // Balanced creativity
                topP: 0.8,
                topK: 40,
            }
        });

        // ============================================
        // ENHANCED PROMPT - No "Hiring Manager" tone
        // ============================================
        const prompt = `
You are an ATS (Applicant Tracking System) performing technical resume analysis.

JOB DESCRIPTION:
${jobDesc}

RESUME CONTENT:
${resumeText}

TASK: Analyze the resume against the job description and provide a structured technical assessment.

OUTPUT FORMAT (must follow exactly):

Match Score: [number]%

Initial Impression:
[Write 2-3 objective sentences analyzing the technical fit. Use third-person perspective. Be factual and concise. Do NOT use "you/your" or give advice.]

Missing Keywords:
- [keyword 1]
- [keyword 2]
- [keyword 3]
- [keyword 4]
- [keyword 5]

RULES:
- Be objective and technical
- No conversational tone
- No "hiring manager" perspective
- No tips or recommendations
- Just analyze the match
- List actual missing technical skills/keywords from the JD
- Score should reflect realistic alignment (50-95% range typical)

Begin response now:
        `.trim();

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        console.log("\n" + "=".repeat(50));
        console.log("📥 RAW AI RESPONSE:");
        console.log("=".repeat(50));
        console.log(text.substring(0, 300) + "...\n");
        
        // ============================================
        // SMART PARSING ENGINE
        // ============================================
        console.log("⚙️  Parsing AI response...");
        
        // 1. EXTRACT MATCH SCORE
        let matchScore = 70; // Safe default
        
        const scorePatterns = [
            /Match Score[:\s*]*([\d\.]+)\s*%/i,
            /Score[:\s*]*([\d\.]+)\s*%/i,
            /Match[:\s*]*([\d\.]+)\s*%/i,
            /([\d\.]+)\s*%\s*Match/i
        ];
        
        for (const pattern of scorePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                let score = parseFloat(match[1]);
                
                // Handle decimal format (0.85 → 85%)
                if (score <= 1) {
                    score *= 100;
                }
                
                // Handle /10 format (8.5/10 → 85%)
                if (score <= 10) {
                    score *= 10;
                }
                
                // Ensure realistic range
                matchScore = Math.max(0, Math.min(100, Math.round(score)));
                break;
            }
        }
        
        console.log(`   ✓ Match Score: ${matchScore}%`);
        
        // 2. EXTRACT SUMMARY (Initial Impression)
        let summary = "Technical analysis completed.";
        
        const summaryPatterns = [
            /Initial Impression[:\s\n]+([\s\S]*?)(?=Missing Keywords|###|$)/i,
            /Summary[:\s\n]+([\s\S]*?)(?=Missing Keywords|###|$)/i,
            /Assessment[:\s\n]+([\s\S]*?)(?=Missing Keywords|###|$)/i
        ];
        
        for (const pattern of summaryPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                summary = match[1]
                    .replace(/[*#\n]+/g, ' ') // Remove markdown and newlines
                    .replace(/\s+/g, ' ')      // Normalize spaces
                    .trim();
                
                if (summary.length > 50) {
                    break;
                }
            }
        }
        
        // Fallback: Get first substantial paragraph
        if (summary.length < 50) {
            const paragraphs = text.split('\n').filter(p => 
                p.length > 60 && 
                !p.toLowerCase().includes('match score') &&
                !p.toLowerCase().includes('missing keywords')
            );
            if (paragraphs.length > 0) {
                summary = paragraphs[0].replace(/[*#]/g, '').trim();
            }
        }
        
        // Limit length
        if (summary.length > 400) {
            summary = summary.substring(0, 397) + "...";
        }
        
        console.log(`   ✓ Summary: ${summary.substring(0, 60)}...`);
        
        // 3. EXTRACT MISSING KEYWORDS
        let missingKeywords = [];
        
        const keywordMatch = text.match(/Missing Keywords[:\s\n]+([\s\S]*?)(?=###|$)/i);
        
        if (keywordMatch && keywordMatch[1]) {
            const lines = keywordMatch[1].split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                
                // Match bullet points: "- keyword" or "• keyword" or "* keyword"
                if (trimmed.match(/^[-•*]\s+(.+)/)) {
                    const keyword = trimmed
                        .replace(/^[-•*]\s+/, '')
                        .replace(/[*_]/g, '') // Remove markdown
                        .trim();
                    
                    if (keyword.length > 2 && keyword.length < 100) {
                        missingKeywords.push(keyword);
                    }
                }
            }
        }
        
        // Fallback if no keywords found
        if (missingKeywords.length === 0) {
            missingKeywords = ["Technical alignment review needed"];
        }
        
        // Limit to top 8 keywords
        missingKeywords = missingKeywords.slice(0, 8);
        
        console.log(`   ✓ Missing Keywords: ${missingKeywords.length} found`);
        
        // ============================================
        // BUILD RESPONSE
        // ============================================
        const finalData = {
            matchScore: matchScore,
            missingKeywords: missingKeywords,
            summary: summary
        };
        
        const elapsed = Date.now() - startTime;
        
        console.log("\n" + "=".repeat(50));
        console.log("✅ ANALYSIS COMPLETE");
        console.log("=".repeat(50));
        console.log(`📊 Score: ${finalData.matchScore}%`);
        console.log(`🔍 Keywords: ${finalData.missingKeywords.join(', ')}`);
        console.log(`⏱️  Processing time: ${elapsed}ms`);
        console.log("=".repeat(50) + "\n");
        
        res.json(finalData);

    } catch (error) {
        console.error("\n" + "=".repeat(50));
        console.error("❌ ERROR OCCURRED");
        console.error("=".repeat(50));
        console.error("Error:", error.message);
        console.error("Stack:", error.stack);
        console.error("=".repeat(50) + "\n");
        
        res.status(500).json({
            matchScore: 0,
            missingKeywords: ["Analysis failed - " + error.message],
            summary: "Unable to complete analysis. Please check server logs."
        });
    }
});

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        geminiApiConfigured: !!process.env.GEMINI_API_KEY,
        pdfParserAvailable: !!pdfParseLib
    });
});

// ============================================
// START SERVER
// ============================================
app.listen(port, () => {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 JOBALIGN AI SERVER");
    console.log("=".repeat(60));
    console.log(`📍 Server running on: http://localhost:${port}`);
    console.log(`📍 Health check: http://localhost:${port}/health`);
    console.log(`🤖 Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`📄 PDF Parser: ${pdfParseLib ? '✅ Available' : '❌ Missing'}`);
    console.log("=".repeat(60));
    console.log("💡 Ready to analyze resumes!\n");
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', () => {
    console.log("\n\n🛑 Server shutting down gracefully...");
    process.exit(0);
});