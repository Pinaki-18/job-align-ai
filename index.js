const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdf = require("pdf-extraction");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 10000;

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ================== MULTER ==================
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files allowed"));
    }
    cb(null, true);
  }
});

// ================== GEMINI INIT ==================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ================== ROUTE 1: EXTRACT PDF ==================
app.post("/extract-text", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({
        success: false,
        error: "No file received. Field name must be 'file'."
      });
    }

    const data = await pdf(req.file.buffer);
    const text = data.text?.trim();

    if (!text || text.length < 50) {
      return res.json({
        success: false,
        error: "PDF has no readable text (scanned PDF)."
      });
    }

    res.json({
      success: true,
      text
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ================== ROUTE 2: ANALYZE ==================
app.post("/analyze", async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;

    if (!resumeText || !jobDescription) {
      return res.json({
        analysis: "Resume and Job Description required."
      });
    }

    console.log("Gemini key exists:", !!process.env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash" // ✅ CORRECT MODEL
    });

    const prompt = `
Act as a strict hiring manager.

RESUME:
${resumeText.substring(0, 2500)}

JOB DESCRIPTION:
${jobDescription.substring(0, 2500)}

Provide:
1. Match score (0–100)
2. 3 missing keywords
3. 2 resume improvement suggestions
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    res.json({
      analysis: response.text()
    });

  } catch (err) {
    console.error("Gemini Error:", err.message);
    res.json({
      analysis: `Gemini error: ${err.message}`
    });
  }
});

// ================== HEALTH CHECK ==================
app.get("/", (req, res) => {
  res.send("JobAlign AI is running ✅");
});

// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
