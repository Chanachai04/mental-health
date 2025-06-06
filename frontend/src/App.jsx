import { useState } from "react";
import {
  Search,
  Users,
  MessageCircle,
  Hash,
  ExternalLink,
  Loader2,
  Facebook,
  Instagram,
  Twitter,
} from "lucide-react";

function App() {
  const [keyword, setKeyword] = useState("");
  const [limit, setLimit] = useState(10);
  const [platform, setPlatform] = useState("facebook");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) {
      alert("กรุณากรอก keyword");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:3000/api/${platform}/search?q=${encodeURIComponent(
          keyword
        )}&limit=${limit}`
      );
      const data = await res.json();
      setResults(data.results || []);
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
    switch (platform) {
      case "facebook":
        return <Facebook className={className + " text-blue-600"} />;
      case "instagram":
        return <Instagram className={className + " text-pink-500"} />;
      case "twitter":
        return <Twitter className={className + " text-sky-500"} />;
      default:
        return null;
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
            <Search className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Social Search
          </h1>
          <p className="text-gray-600 text-lg">
            ค้นหาโพสต์จาก Social Media ได้อย่างง่ายดาย
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 mb-8">
          <div className="grid gap-6">
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
                  placeholder="เช่น car, ขายของ, รีวิวสินค้า..."
                  className="w-full px-4 py-3 pl-12 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700 placeholder-gray-400"
                />
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  จำนวนผลลัพธ์
                </label>
                <input
                  type="text"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  แพลตฟอร์ม
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-gray-700 bg-white"
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="twitter">Twitter</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading || !keyword.trim()}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังค้นหา...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  เริ่มค้นหา
                </>
              )}
            </button>
          </div>
        </div>

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-green-600 font-semibold">
                  {results.length}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">ผลการค้นหา</h2>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                {getPlatformIcon(platform, "w-4 h-4")}
                <span className="capitalize">{platform}</span>
              </div>
              {keyword && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200">
                  <span>คำค้นหา:</span>
                  <span className="font-semibold text-yellow-800">
                    {keyword}
                  </span>
                </div>
              )}
            </div>

            <div className="grid gap-4">
              {results.map((item, index) => (
                <div
                  key={item.id || index}
                  className="bg-white rounded-xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-200 hover:border-blue-200"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {(item.username || "U").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                          {item.username || "Unknown User"}
                          {getPlatformIcon(platform)}
                        </h3>
                      </div>
                    </div>

                    {item.sentiment && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getSentimentColor(
                          item.sentiment
                        )}`}
                      >
                        AI: {item.sentiment}
                      </span>
                    )}
                  </div>

                  <div className="mb-4">
                    <HighlightedText
                      text={item.caption || item.info || "ไม่มีข้อความ"}
                      searchKeyword={keyword}
                      className="text-gray-700 leading-relaxed"
                    />
                  </div>

                  {(item.postUrl || item.contact) && (
                    <div className="flex justify-end">
                      <a
                        href={item.postUrl || item.contact}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-blue-50 text-blue-600 rounded-lg transition-all duration-200 text-sm font-medium hover:text-blue-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                        เปิดโพสต์
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && results.length === 0 && keyword && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              ไม่พบผลลัพธ์
            </h3>
            <p className="text-gray-500">
              ลองเปลี่ยนคำค้นหาหรือแพลตฟอร์มดูครับ
            </p>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              กำลังค้นหา...
            </h3>
            <p className="text-gray-500">รอสักครู่นะครับ</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
