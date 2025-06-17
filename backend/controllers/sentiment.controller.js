require("dotenv").config();

const LM_STUDIO_URL = process.env.LM_STUDIO_URL;
async function analyzeSentiment(req, res) {
  try {
    const { message, temperature = 0.1, max_tokens = 100 } = req.body;

    if (!message || message.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "กรุณาใส่ข้อความที่ต้องการวิเคราะห์",
      });
    }

    const apiUrl = `${LM_STUDIO_URL}/v1/chat/completions`;

    const fetchResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
        temperature,
        max_tokens,
        stream: false,
      }),
    });

    if (!fetchResponse.ok) {
      throw new Error(`HTTP error! Status: ${fetchResponse.status}`);
    }

    const data = await fetchResponse.json();

    let rawResult = data.choices[0].message.content.trim().toLowerCase();
    console.log("Raw response from LM Studio:", rawResult);

    if (rawResult.includes("บวก")) {
      rawResult = "ความคิดเห็นเชิงบวก";
    } else if (rawResult.includes("ลบ")) {
      rawResult = "ความคิดเห็นเชิงลบ";
    } else {
      rawResult = "ไม่สามารถระบุได้";
    }

    res.json({
      success: true,
      message,
      sentiment: rawResult,
    });
  } catch (error) {
    console.error("Error calling LM Studio:", error.message);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถเชื่อมต่อกับ AI model ได้",
      details: error.message,
    });
  }
}

module.exports = {
  analyzeSentiment,
};
