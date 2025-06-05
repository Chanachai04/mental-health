require("dotenv").config();
const express = require("express");
const facebookRoutes = require("./routers/facebook.route");
const twitterRoutes = require("./routers/twitter.route");
const instagramRoutes = require("./routers/instagram.route");

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/api/facebook", facebookRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/instagram", instagramRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
