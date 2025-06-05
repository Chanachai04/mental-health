const express = require("express");
const router = express.Router();
const { handleSearch } = require("../controllers/facebook.controller");

router.get("/search", handleSearch);

module.exports = router;
