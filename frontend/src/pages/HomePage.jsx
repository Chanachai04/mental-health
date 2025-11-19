import { useState, useRef, useEffect } from "react";
import { Search, Hash, Loader2, BarChart3 } from "lucide-react";

function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [intervalMin, setIntervalMin] = useState(2);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [allResults, setAllResults] = useState([]);
  const [message, setMessage] = useState({ text: "", type: "" });

  const baseSearchAmount = 40;
  const maxLimit = 60;
  const [searchLimit, setSearchLimit] = useState(baseSearchAmount);
  const searchLimitRef = useRef(baseSearchAmount); // track current limit
  const isSearchingRef = useRef(false); // track if doSearch is running
  const intervalIdRef = useRef(null);

  const allResultsRef = useRef([]);
  const messageTimeoutRef = useRef(null);

  const platforms = ["twitter", "tiktok"];

  const displayMessage = (text, type = "info") => {
    setMessage({ text, type });
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = setTimeout(() => {
      setMessage({ text: "", type: "" });
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
      if (intervalIdRef.current) {
        clearTimeout(intervalIdRef.current);
      }
    };
  }, []);

  // Recursive timeout to wait for doSearch to finish before next call
  const doSearchWithTimeout = async () => {
    await doSearch();
    if (isSearchingRef.current) {
      intervalIdRef.current = setTimeout(
        doSearchWithTimeout,
        intervalMin * 60 * 60 * 1000
      );
    }
  };

  const startSearch = () => {
    if (!keyword.trim()) {
      displayMessage("Please enter a search keyword.", "error");
      return;
    }

    setAllResults([]);
    allResultsRef.current = [];

    // Reset limit and refs
    setSearchLimit(baseSearchAmount);
    searchLimitRef.current = baseSearchAmount;
    setIsSearching(true);
    isSearchingRef.current = true;

    displayMessage("Starting search...", "info");

    doSearchWithTimeout();
  };

  const stopSearch = async () => {
    setIsSearching(false);
    isSearchingRef.current = false;
    displayMessage("Stopping search...", "info");

    if (intervalIdRef.current) {
      clearTimeout(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (allResultsRef.current.length > 0) {
      displayMessage(
        `Search stopped. ${allResultsRef.current.length} items were collected and saved.`,
        "success"
      );
    } else {
      displayMessage("Search stopped. No data was collected.", "info");
    }

    setAllResults([]);
    allResultsRef.current = [];

    // Reset limit
    setSearchLimit(baseSearchAmount);
    searchLimitRef.current = baseSearchAmount;
  };

  // ฟังก์ชั่นใหม่สำหรับบันทึกข้อมูลหลายรายการในครั้งเดียว
  const saveMultipleResults = async (results) => {
    try {
      const response = await fetch("http://119.59.118.120:3001/api/save/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      });

      if (response.ok) {
        const savedData = await response.json();
        return savedData.savedCount || results.length;
      } else {
        // ถ้า bulk save ไม่สำเร็จ ให้ลองบันทึกทีละรายการ
        console.warn("Bulk save failed, trying individual saves...");
        return await saveIndividualResults(results);
      }
    } catch (error) {
      console.error("Bulk save error:", error);
      // ถ้า bulk save error ให้ลองบันทึกทีละรายการ
      return await saveIndividualResults(results);
    }
  };

  // ฟังก์ชั่นสำรองสำหรับบันทึกทีละรายการ
  const saveIndividualResults = async (results) => {
    let savedCount = 0;
    for (const result of results) {
      try {
        const response = await fetch("http://119.59.118.120:3001/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        });

        if (response.ok) {
          savedCount++;
        }
      } catch (err) {
        console.error("Error saving individual result:", err);
      }
    }
    return savedCount;
  };

  const doSearch = async () => {
    if (!keyword.trim()) {
      displayMessage("Search keyword is empty. Stopping search.", "error");
      stopSearch();
      return;
    }

    if (isSearchingRef.current === false) {
      // Prevent running if stopped
      return;
    }
    if (loading) {
      // Prevent overlapping calls
      return;
    }

    isSearchingRef.current = true;
    setLoading(true);

    let newlyFoundResults = [];

    try {
      const fetchPromises = platforms.map(async (platform) => {
        try {
          const res = await fetch(
            `http://119.59.118.120:3001/api/${platform}/search?q=${encodeURIComponent(
              keyword
            )}&limit=${searchLimitRef.current}`
          );

          if (!res.ok) return [];

          const data = await res.json();

          console.log(
            "Platform:",
            platform,
            "Limit:",
            searchLimitRef.current,
            "Data received:",
            data
          );

          // รองรับทั้ง single และ multiple keywords
          const results =
            data.results?.map((r) => ({
              username: r.username || "anonymous",
              caption: r.caption || "",
              platform,
              baseurl: r.postUrl || r.videoUrl || "",
              searchKeyword: r.searchKeyword || keyword, // เพิ่มข้อมูล keyword ที่ใช้ค้นหา
              sentiment: r.analyzeSentiment || null, // เพิ่มข้อมูล sentiment
            })) || [];

          console.log(`${platform} processed results:`, results.length);
          return results;
        } catch (error) {
          console.error(`Error fetching from ${platform}:`, error);
          return [];
        }
      });

      const allPlatformResults = await Promise.all(fetchPromises);
      newlyFoundResults = allPlatformResults.flat();

      console.log("Total newly found results:", newlyFoundResults.length);

      if (newlyFoundResults.length > 0) {
        setAllResults((prev) => [...prev, ...newlyFoundResults]);
        allResultsRef.current = [
          ...allResultsRef.current,
          ...newlyFoundResults,
        ];

        // ใช้ฟังก์ชั่นใหม่สำหรับบันทึกหลายรายการในครั้งเดียว
        const savedCount = await saveMultipleResults(newlyFoundResults);

        displayMessage(
          `Found ${newlyFoundResults.length} posts and saved ${savedCount}. Total this session: ${allResultsRef.current.length}`,
          "success"
        );
      } else {
        displayMessage("No posts found in this interval.", "info");
      }
    } catch (err) {
      console.error("Search error:", err);
      displayMessage("Error during search: " + err.message, "error");
    } finally {
      setLoading(false);

      // Increase limit by 10, reset to base if exceed maxLimit
      setSearchLimit((prev) => {
        const next = prev + 10;
        const fixed = next > maxLimit ? baseSearchAmount : next;
        searchLimitRef.current = fixed;
        return fixed;
      });
    }
  };

  const handleSearchClick = () => {
    if (isSearching) {
      stopSearch();
    } else {
      startSearch();
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center justify-center my-8 text-center">
        <img
          src="/images/Mahidol_U.png"
          alt="Mahidol University"
          className="w-[100px] sm:w-[150px] h-[100px] sm:h-[150px]"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mt-2">
          Mahidol University
        </h1>
        <p className="text-base sm:text-xl text-gray-600 mt-2">
          Application of Natural Language Processing to Study the Impact of
          Social Media on Mental Health in Children And Adolescents
        </p>
      </div>

      <div className="w-full max-w-2xl mx-auto">
        <div className="space-y-6 bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-200">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-6">
            Social Media Searcher
          </h1>

          {message.text && (
            <div
              className={`mt-4 p-3 rounded-xl text-center font-medium ${
                message.type === "error"
                  ? "bg-red-100 text-red-700"
                  : message.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <label
              htmlFor="keyword-input"
              className="mb-1 font-semibold text-gray-700 flex items-center gap-2"
            >
              <Hash className="w-4 h-4" />
              Keyword
            </label>
            <input
              id="keyword-input"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full border px-4 py-3 rounded-xl border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., #AI, bitcoin,ethereum,dogecoin"
              disabled={isSearching}
            />
            <p className="text-sm text-gray-500 mt-1">
              Tip: Use comma (,) to search multiple keywords.
            </p>
          </div>

          <div>
            <label
              htmlFor="interval-input"
              className="block mb-1 font-semibold text-gray-700"
            >
              Search Frequency (hours)
            </label>
            <input
              id="interval-input"
              type="number"
              min={1}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value))}
              className="w-full border px-4 py-3 rounded-xl border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isSearching}
            />
          </div>

          <button
            onClick={handleSearchClick}
            className={`w-full py-3 font-semibold text-white rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 
            ${
              isSearching
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
            }
            ${loading ? "opacity-70 cursor-not-allowed" : ""}
          `}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : isSearching ? (
              "Stop Search"
            ) : (
              <>
                <Search className="w-5 h-5" />
                Start Search
              </>
            )}
          </button>

          <a
            href="http://119.59.118.120:5252/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 font-semibold text-white rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <BarChart3 /> Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
