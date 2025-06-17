require("dotenv").config();
const express = require("express");
const cors = require("cors");
const facebookRoutes = require("./routers/facebook.route");
const twitterRoutes = require("./routers/twitter.route");
const instagramRoutes = require("./routers/instagram.route");
const { handleSearch } = require("./controllers/tiktok.controller");
const tiktokRoutes = require("./routers/tiktok.route");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use("/api/facebook", facebookRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/tiktok", tiktokRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`LM Studio URL: ${process.env.LM_STUDIO_URL}`);
});
