# วิธีแก้ปัญหา Twitter CAPTCHA

## สาเหตุ
Twitter/X ตรวจจับว่า IP หรือ Session ของคุณเป็น bot

## วิธีแก้ (แนะนำ)

### ขั้นตอนที่ 1: Export Cookies ด้วย Cookie-Editor
1. เปิด Chrome/Edge ปกติ (ไม่ใช่ของ Playwright)
2. ไปที่ https://x.com และ Login ให้เรียบร้อย (ต้องเห็นหน้า Home)
3. คลิกไอคอน **Cookie-Editor** extension (มุมบนขวา)
4. คลิกปุ่ม **Export** (ไอคอนลูกศรชี้ขึ้น ⬆️ ที่มุมล่างขวา)
5. จะได้ JSON มา - Copy ทั้งหมด
6. Paste ลงไฟล์ `backend/sessions/twitter-cookies-raw.json`

### ขั้นตอนที่ 2: แปลง Cookies
```bash
cd backend
node convert-cookies.js
```

### ขั้นตอนที่ 3: ทดสอบ
รัน API ใหม่ จะใช้ cookies จาก browser จริงของคุณ

---

## สรุปคำสั่งทั้งหมด

```bash
# 1. Export cookies จาก Cookie-Editor แล้ว save เป็น twitter-cookies-raw.json
# 2. แปลง cookies
cd backend
node convert-cookies.js

# 3. ทดสอบ (รัน server)
node server.js
```

### วิธีที่ 2: ใช้ Residential Proxy
เพิ่ม proxy ในโค้ด:
```javascript
const context = await browser.newContext({
  proxy: {
    server: 'http://proxy-server:port',
    username: 'user',
    password: 'pass'
  },
  // ... config อื่นๆ
});
```

### วิธีที่ 3: ใช้ Twitter API แทน (แนะนำที่สุด)
- สมัคร Twitter Developer Account
- ใช้ Twitter API v2 แทน web scraping
- ไม่มีปัญหา CAPTCHA

## หมายเหตุ
- โค้ดปัจจุบันเปิด `headless: false` แล้ว จะเห็น browser เปิดขึ้นมา
- ถ้าเจอ CAPTCHA ระบบจะแจ้งเตือนและหยุดทำงาน
- การ scrape Twitter ผิด Terms of Service อาจโดนแบน account
