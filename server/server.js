const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Rate limiting variables
let requestCount = 0;
let resetTime = Date.now() + 60000; // Reset after 1 minute

// Rate limiter middleware
const rateLimiter = (req, res, next) => {
    const now = Date.now();
    
    // Reset counter if time window has passed
    if (now >= resetTime) {
        requestCount = 0;
        resetTime = now + 60000;
    }
    
    // Check if limit exceeded
    if (requestCount >= 15) { // Set to 15 to be safe (limit is 20)
        const waitTime = Math.ceil((resetTime - now) / 1000);
        return res.status(429).json({ 
            error: `Rate limit exceeded. Please wait ${waitTime} seconds before trying again.`,
            retryAfter: waitTime
        });
    }
    
    requestCount++;
    next();
};

app.post('/analyze', rateLimiter, upload.single('resume'), async (req, res) => {
    try {
        console.log(`--- Request ${requestCount}/15 ---`);

        // Check if resume file is uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        // Parse the PDF resume
        console.log("--- Parsing PDF Resume ---");
        const pdfData = await pdfParse(req.file.buffer);
        const resumeText = pdfData.text;

        console.log("--- Calling Gemini API ---");

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Using the stable model
        });

        const prompt = `
            You are a hiring manager. Analyze this candidate's resume against the job description.
            
            Job Description: "${req.body.jobDesc}"
            
            Resume Content: "${resumeText}"
            
            Provide your analysis in valid JSON format with the following structure:
            {
                "matchScore": <number between 0-100>,
                "missingKeywords": [<array of missing important keywords>],
                "summary": "<brief summary of candidate fit>"
            }
            
            Only return the JSON object, no additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        console.log("--- Success! Response received. ---");
        
        // Clean the response
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanText));

    } catch (error) {
        console.error("SERVER ERROR:", error);
        
        // Handle specific Gemini API errors
        if (error.message.includes('quota') || error.message.includes('rate limit')) {
            return res.status(429).json({ 
                error: 'API rate limit exceeded. Please wait a minute and try again.',
                details: error.message
            });
        }
        
        res.status(500).json({ 
            error: error.message,
            details: "Failed to analyze resume. Check server logs for details."
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const now = Date.now();
    const timeUntilReset = resetTime > now ? Math.ceil((resetTime - now) / 1000) : 0;
    
    res.json({
        status: 'OK',
        requestsRemaining: Math.max(0, 15 - requestCount),
        resetIn: timeUntilReset + ' seconds'
    });
});

app.listen(port, () => console.log(`\n🟢 SERVER RUNNING on http://localhost:${port}\n`));