const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

/* ---------------- APP ---------------- */
const app = express();
const port = process.env.PORT || 10000;

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ---------------- PROOF ENDPOINT ---------------- */
app.get("/whoami", (req, res) => {
  res.json({
    backend: "RENDER-BACKEND-V3",
    model: "gemini-1.5-pro-001",
    time: new Date().toISOString(),
  });
});

/* ---------------- HEALTH ---------------- */
app.get("/", (req, res) => {
  res.json({ status: "OK" });
});

/* ---------------- ANALYZE ---------------- */
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    console.log("🔥 /analyze HIT");

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("NO_API_KEY");

    console.log("🧠 MODEL = gemini-1.5-pro-001");

    const prompt = `
You are an HR expert.
Analyze resume vs job description.

Return:
SCORE: %
MISSING:
SUMMARY:
FEEDBACK:
SEARCH_QUERY:
`;

    const url =
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-001:generateContent?key=" +
      apiKey;

    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("EMPTY_RESPONSE");

    console.log("✅ GEMINI OK");

    return res.json({
      matchScore: 75,
      missingKeywords: ["Sample"],
      summary: "Gemini working",
      feedback: text,
      searchQuery: "Software Engineer",
      jobs: [],
    });
  } catch (err) {
    console.error("❌ ERROR");

    if (err.response) {
      console.error(err.response.status);
      console.error(JSON.stringify(err.response.data, null, 2));
    }

    return res.json({
      matchScore: 10,
      missingKeywords: ["CONNECTION_ERROR"],
      summary: "FAILED",
      feedback: "BACKEND ERROR — CHECK /whoami",
      searchQuery: "Job Search",
      jobs: [],
    });
  }
});

/* ---------------- START ---------------- */
app.listen(port, "0.0.0.0", () => {
  console.log("🟢 SERVER STARTED");
});
