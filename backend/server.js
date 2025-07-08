require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const facebookRoutes = require("./routers/facebook.route");
const twitterRoutes = require("./routers/twitter.route");
const instagramRoutes = require("./routers/instagram.route");
const tiktokRoutes = require("./routers/tiktok.route");

const app = express();
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
});

const PORT = process.env.PORT || 3001;
app.use(cors());
app.use("/api/facebook", facebookRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/tiktok", tiktokRoutes);

app.post("/api/save", async (req, res) => {
  const { username, caption, platform, baseurl } = req.body;

  try {
    // ตรวจสอบว่า caption หรือ baseurl ซ้ำหรือไม่
    const [rows] = await pool.query(
      `SELECT 1 FROM mental_health WHERE baseurl = ? LIMIT 1`,
      [caption, baseurl]
    );

    if (rows.length > 0) {
      return res.status(409).json({ error: "Duplicate baseurl entry" });
    }

    // ถ้าไม่ซ้ำ → insert ได้เลย
    await pool.query(
      `INSERT INTO mental_health (username, caption, platform, baseurl) VALUES (?, ?, ?, ?)`,
      [username, caption, platform, baseurl]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB insert failed" });
  }
});

// app.get("/api/info", async (req, res) => {
//   try {
//     const [rows] = await pool.query(`SELECT * FROM mental_health`);
//     res.json(rows);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to fetch data" });
//   }
// });

app.listen(PORT, () => {
  console.log(`Server running on http://119.59.118.120:${PORT}`);
});
