// utils/sentiment.js
require("dotenv").config();

const LM_STUDIO_URL = process.env.LM_STUDIO_URL;

async function analyzeSentiment(message) {
  if (!message || message.trim() === "") return "ไม่สามารถระบุได้";

  const apiUrl = `${LM_STUDIO_URL}/v1/chat/completions`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "pathumma-llm-text-1.0.0",
        messages: [
          {
            role: "assistant",
            content:
              "คุณคือนักวิเคราะห์ข้อความ ให้ตอบเพียงคำเดียว: 'ความคิดเห็นเชิงบวก' หรือ 'ความคิดเห็นเชิงลบ' เท่านั้น ห้ามอธิบายเพิ่มเติม ห้ามใช้คำอื่น",
          },
          {
            role: "user",
            content: `วิเคราะห์ข้อความ: "${message}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
        stream: false,
      }),
    });

    if (!response.ok) throw new Error(`LM Studio error: ${response.status}`);
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim().toLowerCase() || "";

    if (raw.includes("บวก")) return "ความคิดเห็นเชิงบวก";
    if (raw.includes("ลบ")) return "ความคิดเห็นเชิงลบ";
    return "ไม่สามารถระบุได้";
  } catch (err) {
    console.error("Sentiment error:", err.message);
    return "ไม่สามารถระบุได้";
  }
}

module.exports = { analyzeSentiment };
