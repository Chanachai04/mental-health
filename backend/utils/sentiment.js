// ไม่จำเป็นต้องใช้ dotenv ใน Canvas environment เนื่องจาก API key จะถูกจัดการให้
// const OpenAI = require("openai"); // ไม่ได้ใช้แล้วสำหรับ Gemini
require("dotenv").config();
async function analyzeSentiment(text) {
    try {
        // กำหนด API Key เป็นสตริงว่างเปล่า ถ้าอยู่ใน Canvas environment API Key จะถูกจัดการให้โดยอัตโนมัติ
        const apiKey = process.env.OPENAI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        // กำหนดประวัติการสนทนาสำหรับโมเดล
        let chatHistory = [];
        chatHistory.push({
            role: "user",
            parts: [
                // คำสั่งระบบและการป้อนข้อความของผู้ใช้
                {
                    text: "คุณคือนักวิเคราะห์อารมณ์ข้อความ ให้ตอบเฉพาะว่าเป็น: positive, negative หรือ neutral เท่านั้น โดยไม่ต้องอธิบายเพิ่มเติม",
                    //   text: "คุณคือนักวิเคราะห์อารมณ์ข้อความ ให้ตอบเฉพาะว่าเป็น: ความคิดเชิงบวก, ความคิดเชิงลบ เท่านั้น โดยไม่ต้องอธิบายเพิ่มเติม",
                },
                {text: `วิเคราะห์อารมณ์ของข้อความนี้: "${text}"`},
            ],
        });

        // กำหนด payload สำหรับการเรียก API
        const payload = {
            contents: chatHistory,
            generationConfig: {
                // กำหนดอุณหภูมิของโมเดลสำหรับการสุ่มผลลัพธ์
                temperature: 0,
            },
        };

        // เรียกใช้ Gemini API
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });

        // ตรวจสอบว่าการเรียก API สำเร็จหรือไม่
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API call failed: ${response.status} - ${errorData.error.message || "Unknown error"}`);
        }

        const result = await response.json();

        // ดึงเนื้อหาจากผลลัพธ์ของโมเดล
        if (
            result.candidates &&
            result.candidates.length > 0 &&
            result.candidates[0].content &&
            result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0
        ) {
            const content = result.candidates[0].content.parts[0].text?.trim().toLowerCase();

            //   ตรวจสอบผลลัพธ์ว่าเป็น 'positive', 'negative' หรือ 'neutral'
            if (["positive", "negative", "neutral"].includes(content)) {
                return content;
            }
            //   if (["ความคิดเชิงบวก", "ความคิดเชิงลบ"].includes(content)) {
            //     return content;
            //   }

            console.warn("[WARN] Unexpected response:", content);
            return "unknown";
        } else {
            console.warn("[WARN] No content in Gemini response.");
            return "unknown";
        }
    } catch (err) {
        console.error("[ERROR] Sentiment analysis failed:", err.message);
        return "unknown";
    }
}

// ตัวอย่างการใช้งาน (คุณสามารถเรียกใช้ฟังก์ชันนี้ได้ตามต้องการ)
// (async () => {
//     const sentiment1 = await analyzeSentiment("ฉันมีความสุขมากวันนี้!");
//     console.log("Sentiment 1:", sentiment1); // ควรจะเป็น positive

//     const sentiment2 = await analyzeSentiment("นี่เป็นเรื่องที่น่าผิดหวังจริงๆ");
//     console.log("Sentiment 2:", sentiment2); // ควรจะเป็น negative

//     const sentiment3 = await analyzeSentiment("อากาศวันนี้เย็นสบาย");
//     console.log("Sentiment 3:", sentiment3); // ควรจะเป็น neutral
// })();

// หากคุณต้องการใช้ฟังก์ชันนี้ในโมดูล Node.js อื่นๆ
module.exports = {analyzeSentiment};
