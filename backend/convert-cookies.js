const fs = require("fs");
const path = require("path");

// ลองหาไฟล์ใน 2 ที่
let cookiesPath = "cookies.json";
if (!fs.existsSync(cookiesPath)) {
  cookiesPath = "./sessions/cookies.json";
}

if (!fs.existsSync(cookiesPath)) {
  console.error("❌ ไม่พบไฟล์ cookies.json");
  console.error("กรุณาสร้างไฟล์ cookies.json และวาง cookies ที่ export จาก Chrome");
  console.error("\nสามารถวางไฟล์ได้ 2 ที่:");
  console.error("1. ./cookies.json");
  console.error("2. ./sessions/cookies.json\n");
  process.exit(1);
}

console.log(`📂 อ่านไฟล์: ${cookiesPath}\n`);

// อ่านไฟล์ cookies.json ที่ paste มา
const cookiesRaw = fs.readFileSync(cookiesPath, "utf-8");
const cookies = JSON.parse(cookiesRaw);

// แปลงเป็น format ของ Playwright
const playwrightCookies = cookies.map((cookie) => {
  // แปลง sameSite ให้ถูกต้อง (Strict, Lax, None)
  let sameSite = "Lax";
  if (cookie.sameSite) {
    const sameSiteLower = cookie.sameSite.toLowerCase();
    if (sameSiteLower === "none" || sameSiteLower === "no_restriction")
      sameSite = "None";
    else if (sameSiteLower === "lax") sameSite = "Lax";
    else if (sameSiteLower === "strict") sameSite = "Strict";
  }

  // แปลง expires
  let expires = -1;
  if (cookie.expirationDate) {
    expires = Math.floor(cookie.expirationDate);
  } else if (cookie.expires) {
    expires = Math.floor(new Date(cookie.expires).getTime() / 1000);
  }

  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || ".x.com",
    path: cookie.path || "/",
    expires: expires,
    httpOnly: cookie.httpOnly || false,
    secure: cookie.secure || false,
    sameSite: sameSite,
  };
});

const storageState = {
  cookies: playwrightCookies,
  origins: [
    {
      origin: "https://x.com",
      localStorage: [],
    },
  ],
};

fs.mkdirSync("./sessions", { recursive: true });
fs.writeFileSync(
  "./sessions/storageStateTwitter.json",
  JSON.stringify(storageState, null, 2)
);

console.log("✅ สำเร็จ! Cookies ถูกบันทึกแล้ว");
console.log("📁 ไฟล์: ./sessions/storageStateTwitter.json\n");
