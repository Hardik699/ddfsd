import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Upload, CloudUpload, Loader2 } from "lucide-react";
import UploadTab from "@/components/UploadTab";
import SupplyNoteUploadTab from "@/components/SupplyNoteUploadTab";
import { useUploadContext } from "@/hooks/UploadContext";

const UPLOAD_TYPES = [
  { id: "petpooja", label: "Petpooja Upload", color: "bg-blue-600" },
  { id: "pain_lebs", label: "Pain Labs Upload", color: "bg-orange-600" },
  { id: "website", label: "Website Upload", color: "bg-emerald-500" },
  { id: "supply_note", label: "Supply Note Upload", color: "bg-purple-600" }
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const { currentJob } = useUploadContext();

  const currentTab = UPLOAD_TYPES[activeTab];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header Section */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="px-6 sm:px-8 py-6 sm:py-7 flex justify-between items-center gap-4">
          <div className="group cursor-default flex-1">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500 p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-emerald-500/50">
                <CloudUpload className="w-6 h-6 text-black group-hover:rotate-12 transition-transform" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white">
                  Data Upload
                </h1>
                <p className="text-gray-400 text-xs sm:text-sm font-medium mt-1">
                  {currentJob ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      📤 Uploading {currentJob.type} • {MONTHS[currentJob.month - 1]} {currentJob.year} • {currentJob.progress}%
                    </span>
                  ) : (
                    "Upload and manage your data files"
                  )}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate("/items")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-300 text-xs sm:text-sm hover:shadow-lg hover:shadow-blue-600/50 group relative overflow-hidden whitespace-nowrap"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
            <Package className="w-4 h-4" />
            <span className="relative">Items</span>
          </button>
        </div>

        {/* Upload Progress Bar */}
        {currentJob && (
          <div className="px-6 sm:px-8 pb-4 sm:pb-6">
            <div className="w-full bg-gray-800/50 rounded-full h-2 overflow-hidden border border-gray-700/50">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  currentJob.progress === 100
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                }`}
                style={{
                  width: `${currentJob.progress}%`
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 sm:px-8 py-8 max-w-7xl mx-auto w-full">
        {/* Tabs Navigation */}
        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-4 scroll-smooth">
            {UPLOAD_TYPES.map((tab, idx) => {
              const isActive = activeTab === idx;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(idx)}
                  className={`px-5 sm:px-6 py-3 rounded-lg font-semibold text-xs sm:text-sm whitespace-nowrap transition-all duration-300 flex items-center gap-2 group relative overflow-hidden ${
                    isActive
                      ? `${tab.color} text-white shadow-lg hover:shadow-xl transform hover:scale-105`
                      : `bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700`
                  }`}
                >
                  <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500"></div>
                  {tab.label}
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse"></div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 mb-8"></div>

        {/* Tab Content */}
        {currentTab.id === "supply_note" ? (
          <SupplyNoteUploadTab />
        ) : (
          <UploadTab type={currentTab.id} />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 bg-gray-900 mt-auto">
        <div className="px-6 sm:px-8 py-4 text-center">
          <p className="text-gray-500 text-xs font-medium tracking-wide">
            Data Portal • All Rights Reserved © 2024
          </p>
        </div>
      </div>
    </div>
  );
}
