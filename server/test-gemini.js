const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function testConnection() {
    console.log("--- 🔍 DIAGNOSTIC START ---");

    // 1. Check API Key
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ ERROR: No API Key found.");
        console.error("   Make sure you have a .env file with GEMINI_API_KEY=...");
        return;
    }
    console.log("✅ API Key detected: " + key.substring(0, 5) + "..." + key.slice(-4));

    // 2. Test Available Models
    const genAI = new GoogleGenerativeAI(key);
    const modelsToTest = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro", "gemini-pro"];
    
    let success = false;

    for (const modelName of modelsToTest) {
        try {
            console.log(`\n👉 Testing Model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Say hello");
            const response = await result.response;
            console.log(`   🎉 SUCCESS! Google replied: "${response.text().trim()}"`);
            success = true;
            break; // Stop after first success
        } catch (error) {
            console.error(`   ❌ FAILED (${modelName}):`);
            // Print the exact error code (404, 400, etc.)
            if (error.message.includes("404")) console.error("      Reason: Model Name Not Found (404)");
            else if (error.message.includes("400")) console.error("      Reason: Bad Request / Invalid Key (400)");
            else console.error("      Reason: " + error.message.split('\n')[0]);
        }
    }

    if (!success) {
        console.log("\n🛑 CONCLUSION: All models failed. Your API Key might be invalid or has no quota.");
    } else {
        console.log("\n✅ CONCLUSION: Your system works! Use the model that succeeded above.");
    }
    console.log("--- 🔍 DIAGNOSTIC END ---");
}

testConnection();