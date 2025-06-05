const express = require("express");
const router = express.Router();
const { handleSearch } = require("../controllers/instagram.controller");

router.get("/search", handleSearch);

module.exports = router;
