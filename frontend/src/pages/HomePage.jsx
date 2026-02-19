import { useState, useEffect } from "react";
import { Search, Hash, Loader2, BarChart3, Clock } from "lucide-react";

function HomePage() {
  const [keyword, setKeyword] = useState("");
  const [intervalHours, setIntervalHours] = useState(2);
  const [loading, setLoading] = useState(false);
  const [schedulerStatus, setSchedulerStatus] = useState({
    isRunning: false,
    totalCollected: 0,
    lastSearchTime: null,
    nextSearchTime: null,
  });
  const [message, setMessage] = useState({ text: "", type: "" });

  const displayMessage = (text, type = "info") => {
    setMessage({ text, type });
    setTimeout(() => {
      setMessage({ text: "", type: "" });
    }, 5000);
  };

  // ดึงสถานะ scheduler ทุก 10 วินาที
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(
          "http://119.59.118.120:3001/api/scheduler/status"
        );
        if (res.ok) {
          const status = await res.json();
          setSchedulerStatus(status);
        }
      } catch (error) {
        console.error("Error fetching scheduler status:", error);
      }
    };

    fetchStatus(); // เรียกทันทีตอนเริ่ม
    const interval = setInterval(fetchStatus, 10000); // เรียกทุก 10 วินาที

    return () => clearInterval(interval);
  }, []);

  const startSearch = async () => {
    if (!keyword.trim()) {
      displayMessage("Please enter a search keyword.", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        "http://119.59.118.120:3001/api/scheduler/start",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: keyword,
            intervalHours: intervalHours,
          }),
        }
      );

      if (res.ok) {
        displayMessage("Scheduler started successfully!", "success");
      } else {
        displayMessage("Failed to start scheduler", "error");
      }
    } catch (error) {
      displayMessage("Error: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const stopSearch = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "http://119.59.118.120:3001/api/scheduler/stop",
        {
          method: "POST",
        }
      );

      if (res.ok) {
        displayMessage("Scheduler stopped successfully!", "success");
      } else {
        displayMessage("Failed to stop scheduler", "error");
      }
    } catch (error) {
      displayMessage("Error: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearchClick = () => {
    if (schedulerStatus.isRunning) {
      stopSearch();
    } else {
      startSearch();
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("th-TH");
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
              className={`mt-4 p-3 rounded-xl text-center font-medium ${message.type === "error"
                  ? "bg-red-100 text-red-700"
                  : message.type === "success"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
            >
              {message.text}
            </div>
          )}

          {/* แสดงสถานะ Scheduler */}
          {schedulerStatus.isRunning && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-800">
                  Scheduler Running
                </span>
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <p>
                  <span className="font-medium">Keyword:</span>{" "}
                  {schedulerStatus.keyword}
                </p>
                <p>
                  <span className="font-medium">Interval:</span>{" "}
                  {schedulerStatus.intervalHours} hours
                </p>
                <p>
                  <span className="font-medium">Total Collected:</span>{" "}
                  {schedulerStatus.totalCollected} posts
                </p>
                <p>
                  <span className="font-medium">Last Search:</span>{" "}
                  {formatDateTime(schedulerStatus.lastSearchTime)}
                </p>
                <p>
                  <span className="font-medium">Next Search:</span>{" "}
                  {formatDateTime(schedulerStatus.nextSearchTime)}
                </p>
              </div>
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
              disabled={schedulerStatus.isRunning}
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
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              className="w-full border px-4 py-3 rounded-xl border-gray-200 text-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={schedulerStatus.isRunning}
            />
          </div>

          <button
            onClick={handleSearchClick}
            className={`w-full py-3 font-semibold text-white rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 
            ${schedulerStatus.isRunning
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
                {schedulerStatus.isRunning ? "Stopping..." : "Starting..."}
              </>
            ) : schedulerStatus.isRunning ? (
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
