const axios = require('axios');
require('dotenv').config();

async function listMyModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.log("❌ No API Key in .env"); return; }

    console.log("🔍 Asking Google for available models...");
    
    try {
        const response = await axios.get(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
        );

        console.log("\n✅ SUCCESS! Here are the models you can use:");
        const models = response.data.models;
        
        // Filter for models that support "generateContent"
        const available = models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
        
        if (available.length === 0) {
            console.log("⚠️ You have NO models available for text generation.");
        } else {
            available.forEach(m => console.log(`   👉 ${m.name.replace("models/", "")}`));
        }

    } catch (error) {
        console.error("❌ FAILED TO LIST MODELS:");
        if (error.response) {
            console.error(`   Error ${error.response.status}: ${error.response.data.error.message}`);
        } else {
            console.error(`   ${error.message}`);
        }
    }
}

listMyModels();