# Social Media Mental Health Analyzer

แอปพลิเคชันสำหรับค้นหาและวิเคราะห์โพสต์จาก Social Media (Twitter, TikTok) เพื่อศึกษาผลกระทบต่อสุขภาพจิตของเด็กและวัยรุ่น

## 📋 สารบัญ

- [ความต้องการของระบบ](#ความต้องการของระบบ)
- [การติดตั้ง](#การติดตั้ง)
- [การใช้งาน](#การใช้งาน)
- [การจัดการด้วย PM2](#การจัดการด้วย-pm2)
- [โครงสร้างโปรเจค](#โครงสร้างโปรเจค)

## 🔧 ความต้องการของระบบ

- Node.js (v14 ขึ้นไป)
- MySQL Database
- PM2 (สำหรับรัน production)

## 📦 การติดตั้ง

### 1. Clone โปรเจค

```bash
git clone <repository-url>
cd mental-health
```

### 2. ติดตั้ง Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 4. ตั้งค่า Database

สร้างตาราง `mental_health` ใน MySQL:

```sql
CREATE TABLE mental_health (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255),
  caption TEXT,
  platform VARCHAR(50),
  baseurl VARCHAR(500) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 การใช้งาน

### Development Mode

**รัน Backend:**
```bash
cd backend
node server.js
```

**รัน Frontend:**
```bash
cd frontend
npm run dev
```

เปิดเบราว์เซอร์ที่: `http://localhost:5173`

### Production Mode (แนะนำ)

**ติดตั้ง PM2:**
```bash
npm install -g pm2
```

**รัน Backend ด้วย PM2:**
```bash
cd backend
pm2 start server.js --name "my-backend"
pm2 save
pm2 logs my-backend
```

**รัน Backend ด้วย PM2 ถ้า [PM2][ERROR] Script already launched, add -f option to force re-execution:**
```bash
cd backend
pm2 delete my-backend
pm2 start server.js --name "my-backend"
pm2 save
pm2 logs my-backend
```

**เคลียร์ log เก่าทิ้ง**
```bash
pm2 flush
```

**restart backend**
```bash
pm2 restart my-backend 
```

**Build และ Deploy Frontend:**
```bash
cd frontend
npm run build

# ใช้ serve หรือ nginx เพื่อ serve static files
npm install -g serve
pm2 start "serve -s dist -l 3000" --name social-media-frontend
pm2 save
```

## 🎯 วิธีใช้งานแอปพลิเคชัน

### 1. เปิดหน้าเว็บ

เข้าไปที่ `http://119.59.118.120:3000` (หรือ URL ที่คุณตั้งค่า)

### 2. ค้นหาโพสต์

1. **ใส่ Keyword:** พิมพ์คำค้นหา เช่น `#AI` หรือ `bitcoin,ethereum,dogecoin`
   - สามารถใส่หลาย keyword โดยคั่นด้วยเครื่องหมาย `,`

2. **ตั้งเวลาค้นหา:** ระบุจำนวนชั่วโมงที่ต้องการให้ค้นหาซ้ำอัตโนมัติ (เช่น 4 ชั่วโมง)

3. **กด Start Search:** ระบบจะเริ่มค้นหาและบันทึกข้อมูลอัตโนมัติ

4. **ดูผลลัพธ์:** ระบบจะแสดงจำนวนโพสต์ที่พบและบันทึกแล้ว

5. **กด Stop Search:** เมื่อต้องการหยุดการค้นหา

### 3. ดู Dashboard

คลิกปุ่ม **Dashboard** เพื่อดูสถิติและข้อมูลที่รวบรวมได้

## 🔄 การจัดการด้วย PM2

### คำสั่งพื้นฐาน

**ดูสถานะ:**
```bash
pm2 status
```

**ดู Logs:**
```bash
pm2 logs social-media-backend
pm2 logs social-media-backend --lines 50
```

**Restart:**
```bash
pm2 restart social-media-backend
```

**Stop:**
```bash
pm2 stop social-media-backend
```

**Start (หลังจาก stop):**
```bash
pm2 start social-media-backend
```

**ลบออกจาก PM2:**
```bash
pm2 delete social-media-backend
```

**Monitor แบบ Real-time:**
```bash
pm2 monit
```

**ดูข้อมูลโดยละเอียด:**
```bash
pm2 show social-media-backend
```

### Auto-start เมื่อ Server Reboot

**Windows:**
```bash
pm2 startup
pm2 save
```

**Linux/Mac:**
```bash
pm2 startup
# คัดลอกคำสั่งที่แสดงและรันด้วย sudo
pm2 save
```

## 📁 โครงสร้างโปรเจค

```
mental-health/
├── backend/
│   ├── controllers/         # Logic สำหรับแต่ละ platform
│   │   ├── facebook.controller.js
│   │   ├── instagram.controller.js
│   │   ├── tiktok.controller.js
│   │   └── twitter.controller.js
│   ├── routers/            # API routes
│   ├── sessions/           # Session และ cookies
│   ├── utils/              # Utilities (sentiment analysis)
│   ├── .env               # Environment variables
│   ├── server.js          # Main server file
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── HomePage.jsx    # หน้าหลัก
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   │   └── images/
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

## 🐛 การแก้ปัญหา

### Backend ไม่ทำงาน

```bash
# ตรวจสอบ logs
pm2 logs social-media-backend

# Restart
pm2 restart social-media-backend
```

### Database Connection Error

- ตรวจสอบ `.env` ว่าข้อมูลถูกต้อง
- ตรวจสอบว่า MySQL service ทำงานอยู่
- ตรวจสอบว่าตาราง `mental_health` ถูกสร้างแล้ว

### ค้นหาไม่ทำงานอัตโนมัติ

- ตรวจสอบว่า backend รันอยู่: `pm2 status`
- เปิด Console ใน browser (F12) เพื่อดู error
- ตรวจสอบว่าเวลาที่ตั้งถูกต้อง (หน่วยเป็นชั่วโมง)

### ออกจาก Remote แล้วโปรแกรมหยุดทำงาน

- ใช้ PM2 แทนการรัน `node server.js` โดยตรง
- ตรวจสอบว่าใช้คำสั่ง `pm2 save` แล้ว

## 📝 หมายเหตุ

- ระบบจะไม่บันทึกโพสต์ซ้ำ (ตรวจสอบจาก `baseurl`)
- การค้นหาจะเพิ่ม limit ทีละ 10 ในแต่ละรอบ (สูงสุด 60)
- Sentiment Analysis ต้องการ API endpoint ที่ตั้งค่าใน `.env`

## 👥 ทีมพัฒนา

Mahidol University - Application of Natural Language Processing to Study the Impact of Social Media on Mental Health in Children And Adolescents

---

**สร้างโดย:** Mahidol University Research Team
**อัพเดทล่าสุด:** December 2025
