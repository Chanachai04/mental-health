import { useEffect, useState } from "react";

function DashboardPage() {
  return (
    <div className="px-4">
      <div className="flex flex-col items-center justify-center my-8 text-center">
        <img
          src="/images/Mahidol_U.png"
          alt="Mahidol University"
          className="w-[100px] sm:w-[150px] h-[100px] sm:h-[150px]"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mt-2">
          Mahidol University
        </h1>
        <p className="text-base sm:text-xl text-gray-600 mt-2 ">
          Application of Natural Language Processing to Study the Impact of
          Social Media on Mental Health in Children And Adolescents
        </p>
      </div>

      <div className="flex flex-col items-center justify-center my-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6">
          Dashboard of Social Media
        </h1>

        <div className="w-full overflow-x-auto">
          <div className="shadow-lg rounded-2xl overflow-hidden border border-gray-200 min-w-[640px]">
            <table className="min-w-full bg-white text-left text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">
                    Usernames
                  </th>
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">
                    Captions
                  </th>
                  <th className="px-4 sm:px-6 py-3 font-semibold border-r border-white whitespace-nowrap">
                    Platforms
                  </th>
                  <th className="px-4 sm:px-6 py-3 font-semibold whitespace-nowrap">
                    Posts
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="hover:bg-gray-50 transition duration-200">
                  <td className="px-4 sm:px-6 py-4 text-gray-800">
                    example_user
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800 break-words">
                    “Living the dream”
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800">Instagram</td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1 px-4 rounded-full shadow transition">
                      View
                    </button>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 transition duration-200">
                  <td className="px-4 sm:px-6 py-4 text-gray-800">
                    another_user
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800 break-words">
                    “Just vibing”
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800">TikTok</td>
                  <td className="px-4 sm:px-6 py-4 text-gray-800">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1 px-4 rounded-full shadow transition">
                      View
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
