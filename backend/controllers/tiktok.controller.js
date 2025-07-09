const fs = require("fs");
const { chromium } = require("playwright");
const { analyzeSentiment } = require("../utils/sentiment");

async function searchTikTok(keyword, limitRaw) {
  const limit = parseInt(limitRaw);
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const searchUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(
    keyword
  )}`;
  await page.goto(searchUrl, {
    waitUntil: "networkidle",
    timeout: 50000,
  });

  try {
    await page.waitForSelector('div[data-e2e="search-card-video-caption"]', {
      timeout: 20000,
    });
    await page.waitForTimeout(3000);
  } catch (err) {
    console.warn(
      "No TikTok videos found or failed to load search results.",
      err
    );
    await context.close();
    await browser.close();
    return [];
  }

  const results = [];
  const seenUrls = new Set(); // กันซ้ำ
  let scrollAttempts = 0;

  while (results.length < limit) {
    const videoContainers = await page.$$(
      'div[class*="css-"] a[href*="/video/"]'
    );

    console.log(
      `รอบที่ ${scrollAttempts + 1} Tiktok: พบ ${videoContainers.length} วิดีโอ`
    );

    for (const container of videoContainers) {
      if (results.length >= limit) break;

      let username = "unknown";
      let caption = "";
      let postUrl = "";

      try {
        postUrl = await container.getAttribute("href");
        if (postUrl && !postUrl.startsWith("https://")) {
          postUrl = "https://www.tiktok.com" + postUrl;
        }
        if (!postUrl || seenUrls.has(postUrl)) continue;
        seenUrls.add(postUrl);

        const parentContainer = await container.evaluateHandle((el) => {
          let parent = el.parentElement;
          while (
            parent &&
            !parent.querySelector('[data-e2e="search-card-user-unique-id"]')
          ) {
            parent = parent.parentElement;
            if (parent === document.body) break;
          }
          return parent;
        });

        if (parentContainer) {
          const usernameElement = await parentContainer.$(
            'p[data-e2e="search-card-user-unique-id"]'
          );
          if (usernameElement) {
            username = await usernameElement.innerText();
          }

          const captionElement = await parentContainer.$(
            'div[data-e2e="search-card-video-caption"]'
          );
          if (captionElement) {
            let rawCaption = await captionElement.innerText();
            caption = rawCaption
              .replace(/\n/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }
        }

        if (!caption) {
          const imgElement = await container.$("img[alt]");
          if (imgElement) {
            const altText = await imgElement.getAttribute("alt");
            if (altText && altText.length > 10) {
              caption = altText;
            }
          }
        }
      } catch (e) {
        console.error("Error extracting data from a TikTok video:", e);
        continue;
      }

      if (caption && postUrl) {
        try {
          const sentiment = await analyzeSentiment(caption);
          if (sentiment === "ความคิดเห็นเชิงลบ") {
            results.push({
              username,
              caption,
              postUrl,
              analyzeSentiment: sentiment,
            });
            console.log(
              `เก็บโพสต์ Tiktok เชิงลบได้ ${results.length}/${limit}`
            );
          }
        } catch (sentimentError) {
          console.error("Error analyzing sentiment:", sentimentError);
        }
      }
    }

    const lastHeight = await page.evaluate("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await page.waitForTimeout(5000);

    const newHeight = await page.evaluate("document.body.scrollHeight");
    if (newHeight === lastHeight) {
      console.log("หมดเนื้อหาให้ scroll ของ Tiktok แล้ว");

      break;
    }

    scrollAttempts++;
  }

  await context.close();
  await browser.close();
  return results;
}

async function handleSearch(req, res) {
  const { q, limit } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing ?q=keyword" });
  }

  try {
    console.log(`Searching TikTok for: "${q}" with limit: ${limit}`);
    const results = await searchTikTok(q, limit);

    res.json({
      keyword: q,
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("TikTok search error:", err);
    res.status(500).json({ error: err.message || "TikTok search failed" });
  }
}

module.exports = {
  handleSearch,
};
