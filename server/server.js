const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = 5001;

// 🔥 DEVELOPMENT MODE - Set to true to avoid API calls during testing
const MOCK_MODE = true; // Change to false when you have API quota

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rate limiting variables
let requestCount = 0;
let resetTime = Date.now() + 60000;

// Simple cache to avoid duplicate API calls
const resultCache = new Map();

function getCacheKey(jobDesc, resumeText) {
    return `${jobDesc.substring(0, 50)}_${resumeText.substring(0, 50)}`;
}

// Rate limiter middleware
const rateLimiter = (req, res, next) => {
    if (MOCK_MODE) return next(); // Skip rate limiting in mock mode
    
    const now = Date.now();
    
    if (now >= resetTime) {
        requestCount = 0;
        resetTime = now + 60000;
    }
    
    if (requestCount >= 15) {
        const waitTime = Math.ceil((resetTime - now) / 1000);
        return res.status(429).json({ 
            error: `Rate limit exceeded. Please wait ${waitTime} seconds.`,
            retryAfter: waitTime
        });
    }
    
    requestCount++;
    next();
};

app.post('/analyze', rateLimiter, upload.single('resume'), async (req, res) => {
    try {
        console.log(`\n--- Request ${MOCK_MODE ? 'MOCK' : requestCount + '/15'} ---`);

        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        console.log("--- Parsing PDF Resume ---");
        const pdfData = await pdfParse(req.file.buffer);
        const resumeText = pdfData.text;

        // Check cache first
        const cacheKey = getCacheKey(req.body.jobDesc, resumeText);
        if (resultCache.has(cacheKey)) {
            console.log("--- ✅ Returning Cached Result ---");
            return res.json(resultCache.get(cacheKey));
        }

        // 🎭 MOCK MODE - Return realistic fake data
        if (MOCK_MODE) {
            console.log("--- 🎭 MOCK MODE: Generating fake analysis ---");
            
            const mockResult = {
                matchScore: Math.floor(Math.random() * 30) + 70, // 70-100
                missingKeywords: ["Docker", "Kubernetes", "AWS", "CI/CD", "Microservices"],
                summary: `Strong candidate with relevant technical skills. The resume demonstrates experience with modern development practices and aligns well with the job requirements. Consider discussing cloud infrastructure experience and containerization knowledge during the interview.`
            };
            
            resultCache.set(cacheKey, mockResult);
            
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log("--- ✅ Mock Result Generated ---");
            return res.json(mockResult);
        }

        // 🌐 REAL API MODE
        console.log("--- 🌐 Calling Real Gemini API ---");

        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
        });

        const prompt = `
            You are a hiring manager. Analyze this candidate's resume against the job description.
            
            Job Description: "${req.body.jobDesc}"
            
            Resume Content: "${resumeText}"
            
            Provide your analysis in valid JSON format:
            {
                "matchScore": <number 0-100>,
                "missingKeywords": [<array of missing keywords>],
                "summary": "<brief summary of candidate fit>"
            }
            
            Only return the JSON object, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("--- ✅ API Response Received ---");
        
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedResult = JSON.parse(cleanText);
        
        resultCache.set(cacheKey, parsedResult);
        res.json(parsedResult);

    } catch (error) {
        console.error("❌ SERVER ERROR:", error.message);
        
        if (error.message.includes('quota') || error.message.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'API rate limit exceeded. Enable MOCK_MODE in server.js or wait and try again.',
                suggestion: 'Set MOCK_MODE = true in server.js line 11'
            });
        }
        
        res.status(500).json({ 
            error: error.message,
            details: "Failed to analyze resume."
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const now = Date.now();
    const timeUntilReset = resetTime > now ? Math.ceil((resetTime - now) / 1000) : 0;
    
    res.json({
        status: 'OK',
        mode: MOCK_MODE ? 'MOCK' : 'LIVE',
        requestsRemaining: MOCK_MODE ? 'unlimited' : Math.max(0, 15 - requestCount),
        resetIn: MOCK_MODE ? 'N/A' : timeUntilReset + ' seconds',
        cacheSize: resultCache.size
    });
});

// Clear cache endpoint
app.post('/clear-cache', (req, res) => {
    resultCache.clear();
    res.json({ message: 'Cache cleared successfully' });
});

app.listen(port, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🟢 SERVER RUNNING on http://localhost:${port}`);
    console.log(`Mode: ${MOCK_MODE ? '🎭 MOCK (No API calls)' : '🌐 LIVE (Real API)'}`);
    console.log(`${'='.repeat(50)}\n`);
});