const express = require("express");
const router = express.Router();
const { analyzeSentiment } = require("../controllers/sentiment.controller");

router.post("/sentiment", analyzeSentiment);

module.exports = router;
