import { useState } from "react";
import {
  Search,
  Users,
  MessageCircle,
  Hash,
  ExternalLink,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { FaXTwitter, FaInstagram, FaTiktok } from "react-icons/fa6";
import { LuFacebook } from "react-icons/lu";

function App() {
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState("10");
  const [selectedPlatform, setSelectedPlatform] = useState("facebook");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const platforms = [
    {
      id: "facebook",
      name: "Facebook",
      icon: LuFacebook,
      color: "text-blue-600",
    },
    {
      id: "instagram",
      name: "Instagram",
      icon: FaInstagram,
      color: "text-pink-500",
    },
    {
      id: "twitter",
      name: "X",
      icon: FaXTwitter,
      color: "text-black",
    },
    {
      id: "tiktok",
      name: "TikTok",
      icon: FaTiktok,
      color: "text-pink-600",
    },
  ];

  const handlePlatformChange = (platformId) => {
    setSelectedPlatform(platformId);
    setDropdownOpen(false);
  };

  const handleSearch = async () => {
    if (!keyword.trim()) {
      alert("กรุณากรอก keyword");
      return;
    }

    if (selectedPlatform.length === 0) {
      alert("กรุณาเลือกแพลตฟอร์ม");
      return;
    }

    if (!limit.trim()) {
      alert("กรุณาระบุจำนวนผลลัพธ์");
      return;
    }

    setLoading(true);
    try {
      // ค้นหาจากแพลตฟอร์มที่เลือก
      const res = await fetch(
        `http://localhost:3000/api/${selectedPlatform}/search?q=${encodeURIComponent(
          keyword
        )}&limit=${Number(limit || 10)}`
      );
      const data = await res.json();
      const results = (data.results || []).map((result) => ({
        ...result,
        platform: selectedPlatform,
      }));

      // เรียงลำดับผลลัพธ์ตามความเกี่ยวข้อง (ถ้ามี) หรือตามวันที่
      const sortedResults = results.sort((a, b) => {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });

      setResults(sortedResults);
    } catch (err) {
      console.error("Error:", err);
      alert("ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const getPlatformIcon = (platform, className = "w-4 h-4") => {
    const platformData = platforms.find((p) => p.id === platform);
    if (!platformData) return null;

    const IconComponent = platformData.icon;
    return <IconComponent className={`${className} ${platformData.color}`} />;
  };

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return "bg-gray-100 text-gray-600";
    const s = sentiment.toLowerCase();
    if (s.includes("positive") || s.includes("ดี"))
      return "bg-green-100 text-green-700";
    if (s.includes("negative") || s.includes("แย่"))
      return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  const highlightKeyword = (text, searchKeyword) => {
    if (!text || !searchKeyword.trim()) {
      return text;
    }

    const keywords = searchKeyword.trim().split(/\s+/);
    let highlightedText = text;

    keywords.forEach((keyword) => {
      if (keyword.length > 0) {
        const regex = new RegExp(
          `(${keyword.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")})`,
          "gi"
        );
        highlightedText = highlightedText.replace(
          regex,
          '<mark class="bg-yellow-200 px-1 py-0.5 rounded font-medium text-yellow-900">$1</mark>'
        );
      }
    });

    return highlightedText;
  };

  const HighlightedText = ({ text, searchKeyword, className = "" }) => {
    const highlightedHTML = highlightKeyword(text, searchKeyword);

    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: highlightedHTML }}
      />
    );
  };

  const getSelectedPlatformName = () => {
    return (
      platforms.find((p) => p.id === selectedPlatform)?.name || "เลือกแพลตฟอร์ม"
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8 max-w-7xl">
        {/* Header Section */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-12">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-3 sm:mb-4">
            <Search className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Social Search
          </h1>
          <p className="text-gray-600 text-sm sm:text-base lg:text-lg px-4">
            ค้นหาโพสต์จาก Social Media ได้อย่างง่ายดาย
          </p>
        </div>

        {/* Search Form */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-100 p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8">
          <div className="space-y-4 sm:space-y-6">
            {/* Keyword Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                คำค้นหา (Keyword)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="เช่น car, ขายของ, รีวิวสินค้า, #trending..."
                  className="w-full px-4 py-3 pl-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700 placeholder-gray-400 text-sm sm:text-base"
                />
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* Limit Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" />
                จำนวนผลลัพธ์ (ต่อแพลตฟอร์ม)
              </label>
              <input
                type="number"
                max={100}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700 text-sm sm:text-base"
              />
            </div>

            {/* Platform Selection - Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                แพลตฟอร์ม
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700 text-sm sm:text-base bg-white flex items-center justify-between"
                >
                  <span className="truncate">{getSelectedPlatformName()}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      dropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {dropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg">
                    {platforms.map((platform) => {
                      const IconComponent = platform.icon;
                      const isSelected = selectedPlatform === platform.id;
                      return (
                        <div
                          key={platform.id}
                          onClick={() => handlePlatformChange(platform.id)}
                          className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors first:rounded-t-xl last:rounded-b-xl ${
                            isSelected ? "bg-blue-50" : ""
                          }`}
                        >
                          <IconComponent
                            className={`w-5 h-5 ${platform.color}`}
                          />
                          <span
                            className={`font-medium text-sm sm:text-base ${
                              isSelected ? "text-blue-700" : "text-gray-700"
                            }`}
                          >
                            {platform.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {selectedPlatform && (
                <div className="text-xs text-gray-500 mt-2">
                  เลือกแล้ว: {getSelectedPlatformName()}
                </div>
              )}
            </div>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={loading || !keyword.trim() || !selectedPlatform}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-3 sm:py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังค้นหา...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span className="hidden xs:inline">
                    เริ่มค้นหา ({getSelectedPlatformName()})
                  </span>
                  <span className="xs:hidden">ค้นหา</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {!loading && results.length > 0 && (
          <div className="space-y-4">
            {/* Results Header */}
            <div className="flex items-center gap-3 mb-4 sm:mb-6 flex-wrap">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold text-sm">
                  {results.length}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
                ผลการค้นหา
              </h2>

              {keyword && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200">
                  <span>คำค้นหา:</span>
                  <span className="font-semibold text-yellow-800 max-w-32 sm:max-w-none truncate">
                    {keyword}
                  </span>
                </div>
              )}
            </div>

            {/* Results Grid */}
            <div className="grid gap-3 sm:gap-4">
              {results.map((item, index) => (
                <div
                  key={`${item.platform}-${item.id || index}`}
                  className="bg-white rounded-xl shadow-md border border-gray-100 p-4 sm:p-6 hover:shadow-lg transition-all duration-200 hover:border-blue-200"
                >
                  {/* Result Header */}
                  <div className="flex items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm sm:text-base flex-shrink-0">
                        {(item.username || "U").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm sm:text-base truncate">
                          <span className="truncate">
                            {item.username || "Unknown User"}
                          </span>
                          {getPlatformIcon(item.platform)}
                        </h3>
                        <div className="text-xs text-gray-500 capitalize">
                          {item.platform}
                        </div>
                      </div>
                    </div>

                    {item.sentiment && (
                      <span
                        className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getSentimentColor(
                          item.sentiment
                        )}`}
                      >
                        <span className="hidden sm:inline">AI: </span>
                        {item.sentiment}
                      </span>
                    )}
                  </div>

                  {/* Result Content */}
                  <div className="mb-4">
                    <HighlightedText
                      text={item.caption || item.info || "ไม่มีข้อความ"}
                      searchKeyword={keyword}
                      className="text-gray-700 leading-relaxed text-sm sm:text-base break-words"
                    />
                  </div>
                  {/* Result Footer */}
                  {(item.postUrl || item.contact || item.videoUrl) && (
                    <div className="flex justify-end">
                      <a
                        href={item.postUrl || item.contact || item.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-50 hover:bg-blue-50 text-blue-600 rounded-lg transition-all duration-200 text-xs sm:text-sm font-medium hover:text-blue-700"
                      >
                        <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                        {item.platform === "tiktok"
                          ? "เปิดวิดีโอ"
                          : "เปิดโพสต์"}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Results State */}
        {!loading && results.length === 0 && keyword && (
          <div className="text-center py-8 sm:py-12">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-600 mb-2">
              ไม่พบผลลัพธ์
            </h3>
            <p className="text-gray-500 text-sm sm:text-base px-4">
              ลองเปลี่ยนคำค้นหาหรือเลือกแพลตฟอร์มอื่นดูครับ
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8 sm:py-12">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full mb-4">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">
              กำลังค้นหาจาก {getSelectedPlatformName()}...
            </h3>
            <p className="text-gray-500 text-sm sm:text-base">
              รอสักครู่นะครับ
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;