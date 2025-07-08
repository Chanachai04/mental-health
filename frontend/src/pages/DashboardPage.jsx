import { useEffect, useState } from "react";

function DashboardPage() {
  const [data, setData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // ดึงข้อมูลจาก API
  // useEffect(() => {
  //   fetch("http://119.59.118.120:3000/api/info")
  //     .then((res) => res.json())
  //     .then((data) => setData(data))
  //     .catch((err) => console.error("Failed to fetch data:", err));
  // }, []);

  // คำนวณ pagination
  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = data.slice(startIndex, startIndex + rowsPerPage);

  return (
    <div className="px-4">
      <div className="flex flex-col items-center justify-center my-8 text-center">
        <img
          src="/images/Mahidol_U.png"
          alt="Mahidol University"
          className="w-[100px] sm:w-[150px] h-[100px] sm:h-[150px]"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mt-2">Mahidol University</h1>
        <p className="text-base sm:text-xl text-gray-600 mt-2">
          Application of Natural Language Processing to Study the Impact of Social Media on Mental Health in Children
          And Adolescents
        </p>
      </div>

      <div className="flex flex-col items-center justify-center my-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">Dashboard of Social Media</h1>

        <div className="w-full overflow-x-auto">
          <div className="shadow-lg rounded-2xl overflow-hidden border border-gray-200 min-w-[640px]">
            <table className="min-w-full bg-white text-left text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">Usernames</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">Captions</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">Platforms</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">Posts</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 sm:px-6 py-4 text-gray-800">{item.username}</td>
                    <td className="px-4 sm:px-6 py-4 text-gray-800 break-words">{item.caption}</td>
                    <td className="px-4 sm:px-6 py-4 text-gray-800">{item.platform}</td>
                    <td className="px-4 sm:px-6 py-4 text-gray-800">
                      <a
                        href={item.baseurl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1 px-4 rounded-full shadow transition inline-block text-center"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}

                {currentRows.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                      ไม่มีข้อมูลที่จะแสดง
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-6 flex space-x-2">
          {[...Array(totalPages)].map((_, pageIndex) => (
            <button
              key={pageIndex}
              onClick={() => setCurrentPage(pageIndex + 1)}
              className={`px-4 py-2 rounded ${
                currentPage === pageIndex + 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {pageIndex + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
