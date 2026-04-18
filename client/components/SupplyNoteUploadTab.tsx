import { useState, useEffect } from "react";
import { Upload, FileUp, AlertCircle, CheckCircle2, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import { UPLOAD_FORMATS, validateFileFormat } from "@shared/formats";
import type { UploadType } from "@shared/formats";
import UploadLoader from "./UploadLoader";
import DeleteDataDialog from "./DeleteDataDialog";
import { useUploadContext } from "@/hooks/UploadContext";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface MonthStatus {
  month: number;
  status: "uploaded" | "pending";
}

interface SupplyNoteRow {
  skuCode: string;
  indentNo: string;
  deliveryLocation: string;
  invoiceDate: string;
  receivedQty: number;
}

export default function SupplyNoteUploadTab() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const [selectedYear, setSelectedYear]   = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [monthsStatus, setMonthsStatus]   = useState<MonthStatus[]>([]);

  const [message, setMessage]     = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [fileData, setFileData]   = useState<{ rows: number; columns: number; data: any[][] } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview]     = useState<SupplyNoteRow[]>([]);

  // Delete dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteMonth, setDeleteMonth] = useState<number | null>(null);
  const [deleteYear, setDeleteYear]   = useState<number | null>(null);
  const [isDeleting, setIsDeleting]   = useState(false);

  const { currentJob } = useUploadContext();

  // Fetch month status whenever year changes
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch(`/api/supply-note/status?year=${selectedYear}`, { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (mounted && d.data) setMonthsStatus(d.data);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (mounted && !(err instanceof Error && err.name === "AbortError")) {
          console.warn("Failed to fetch supply note status:", err);
          setMonthsStatus(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, status: "pending" as const })));
        }
      });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [selectedYear]);

  const refreshStatus = () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(`/api/supply-note/status?year=${selectedYear}`, { signal: controller.signal })
      .then((r) => {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json();
      })
      .then((d) => { if (d.data) setMonthsStatus(d.data); })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.warn("Failed to refresh supply note status:", err);
        }
      });
  };

  const getMonthStatus = (m: number) =>
    monthsStatus.find((s) => s.month === m)?.status || "pending";

  // ── File parsing ──────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setFileData(null);
    setPreview([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 2) {
          setMessage({ type: "error", text: "File must have at least a header row and 1 data row." });
          return;
        }

        const headers = jsonData[0] as string[];
        const validation = validateFileFormat(headers, "supply_note" as UploadType);
        if (!validation.valid) {
          setMessage({
            type: "error",
            text: `Invalid format. Missing: ${validation.missing.join(", ")}. Expected: ${UPLOAD_FORMATS.supply_note.requiredColumns.join(", ")}`,
          });
          return;
        }

        const getIdx = (name: string) =>
          headers.findIndex((h) => h?.trim().toLowerCase() === name.toLowerCase());

        const skuIdx  = getIdx("Sku Code");
        const indIdx  = getIdx("Indent No.");
        const locIdx  = getIdx("Delivery Location");
        const dateIdx = getIdx("Invoice Date");
        const qtyIdx  = getIdx("Received Qty");

        const rows: SupplyNoteRow[] = jsonData
          .slice(1)
          .map((row) => ({
            skuCode:          String(row[skuIdx]  ?? "").trim(),
            indentNo:         String(row[indIdx]  ?? "").trim(),
            deliveryLocation: String(row[locIdx]  ?? "").trim(),
            invoiceDate:      String(row[dateIdx] ?? "").trim(),
            receivedQty:      Number(row[qtyIdx]) || 0,
          }))
          .filter((r) => r.skuCode || r.indentNo);

        setFileData({ rows: rows.length, columns: headers.length, data: jsonData });
        setPreview(rows.slice(0, 5));
        setMessage({ type: "success", text: `File loaded: ${rows.length} rows ready to upload.` });
      } catch {
        setMessage({ type: "error", text: "Failed to parse file. Use a valid CSV or Excel file." });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Upload ────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!fileData) {
      setMessage({ type: "error", text: "Please select a file first." });
      return;
    }
    if (!selectedMonth) {
      setMessage({ type: "error", text: "Please select a month." });
      return;
    }

    try {
      setIsUploading(true);
      setMessage({ type: "warning", text: "Uploading supply note data..." });

      const response = await fetch("/api/supply-note/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year:    selectedYear,
          month:   selectedMonth,
          rows:    fileData.rows,
          columns: fileData.columns,
          data:    fileData.data,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");

      setMessage({ type: "success", text: `✅ ${result.message}` });
      setFileData(null);
      setPreview([]);
      setSelectedMonth(null);

      const input = document.getElementById("supply-note-file-input") as HTMLInputElement;
      if (input) input.value = "";

      setTimeout(refreshStatus, 800);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Upload failed" });
    } finally {
      setIsUploading(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const openDeleteDialog = (monthNum: number) => {
    setDeleteMonth(monthNum);
    setDeleteYear(selectedYear);
    setShowDeleteDialog(true);
  };

  const handleDeleteData = async (password: string) => {
    if (!deleteMonth || !deleteYear) return;
    try {
      setIsDeleting(true);
      const response = await fetch("/api/supply-note/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: deleteYear, month: deleteMonth, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Delete failed");

      setMessage({ type: "success", text: "Data deleted successfully!" });
      setShowDeleteDialog(false);
      setIsDeleting(false);
      refreshStatus();
    } catch (error) {
      setIsDeleting(false);
      throw error;
    }
  };

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 sm:space-y-8">
      <UploadLoader
        isVisible={currentJob !== null}
        progress={currentJob?.progress || 0}
        job={currentJob}
      />

      <DeleteDataDialog
        isVisible={showDeleteDialog}
        month={deleteMonth ? MONTHS[deleteMonth - 1] : ""}
        year={deleteYear || selectedYear}
        type="supply_note"
        onConfirm={handleDeleteData}
        onCancel={() => { setShowDeleteDialog(false); setDeleteMonth(null); setDeleteYear(null); }}
        isLoading={isDeleting}
      />

      {/* ── Upload Card ── */}
      <div className="overflow-hidden border border-gray-800 rounded-xl shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 hover:border-purple-600/50 transition-all duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 sm:px-8 py-5 sm:py-6 rounded-t-xl border-b border-slate-600">
          <div className="flex items-start gap-4">
            <div className="bg-slate-500/50 p-2.5 rounded-lg mt-0.5">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1">Upload Data</h2>
              <p className="text-slate-300 text-sm font-normal">Import your supply note data securely</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-6 bg-gray-950">
          {/* Year + Month selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-normal text-gray-300 mb-3">📅 Select Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="w-full px-3.5 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-700 text-white text-sm font-semibold transition-all duration-300 hover:border-slate-500 cursor-pointer shadow-sm"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-normal text-gray-300 mb-3">📆 Select Month</label>
              <select
                value={selectedMonth || ""}
                onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3.5 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-slate-700 text-white text-sm font-semibold transition-all duration-300 hover:border-slate-500 cursor-pointer shadow-sm"
              >
                <option value="">-- Choose Month --</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />

          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-normal text-gray-300 mb-3">📂 Upload CSV / Excel File</label>
            <div className="border-2 border-dashed border-purple-600 rounded-xl p-7 text-center hover:border-purple-500 hover:bg-slate-700 transition-all duration-300 cursor-pointer group relative overflow-hidden bg-slate-800">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="supply-note-file-input"
              />
              <label htmlFor="supply-note-file-input" className="cursor-pointer block relative z-10">
                <div className="bg-purple-900/40 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-sm">
                  <FileUp className="w-8 h-8 text-purple-400 group-hover:animate-bounce" />
                </div>
                <p className="text-white font-bold text-sm tracking-wide">Click to upload or drag & drop</p>
                <p className="text-slate-400 text-xs mt-1 font-medium">CSV or Excel files up to 50MB</p>
              </label>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />

          {/* File Info */}
          {fileData && (
            <div className="bg-purple-900/20 border border-purple-600 rounded-lg p-3">
              <p className="text-xs sm:text-sm text-slate-100 font-semibold">
                <span className="text-purple-400">✓</span> File loaded:{" "}
                <span className="font-extrabold text-purple-300">{fileData.rows}</span> rows,{" "}
                <span className="font-extrabold text-purple-300">{fileData.columns}</span> columns
              </p>
            </div>
          )}

          {/* Preview Table */}
          {preview.length > 0 && (
            <div className="border border-slate-700 rounded-lg overflow-hidden">
              <div className="bg-slate-900 px-3 py-2 border-b border-slate-700">
                <p className="text-xs font-bold text-white tracking-wider">Preview (first {preview.length} rows)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">SKU Code</th>
                      <th className="px-3 py-2 text-left font-semibold">Indent No.</th>
                      <th className="px-3 py-2 text-left font-semibold">Delivery Location</th>
                      <th className="px-3 py-2 text-left font-semibold">Invoice Date</th>
                      <th className="px-3 py-2 text-right font-semibold">Received Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-slate-700 hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-2 text-white font-mono">{row.skuCode}</td>
                        <td className="px-3 py-2 text-slate-300">{row.indentNo}</td>
                        <td className="px-3 py-2 text-slate-300">{row.deliveryLocation}</td>
                        <td className="px-3 py-2 text-slate-300">{row.invoiceDate}</td>
                        <td className="px-3 py-2 text-right text-purple-300 font-bold">{row.receivedQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`p-3 rounded-lg flex gap-2.5 border transition-colors duration-300 shadow-sm ${
              message.type === "success" ? "bg-green-900/20 border-green-600" :
              message.type === "error"   ? "bg-red-900/20 border-red-600" :
                                           "bg-amber-900/20 border-amber-600"
            }`}>
              {message.type === "success" && <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />}
              {message.type === "error"   && <AlertCircle  className="w-5 h-5 text-red-400 flex-shrink-0" />}
              {message.type === "warning" && <AlertCircle  className="w-5 h-5 text-amber-400 flex-shrink-0" />}
              <p className={`text-xs sm:text-sm font-semibold ${
                message.type === "success" ? "text-green-200" :
                message.type === "error"   ? "text-red-200"   : "text-amber-200"
              }`}>{message.text}</p>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={isUploading || !fileData || !selectedMonth}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 sm:py-3 rounded-lg font-semibold text-sm shadow-lg shadow-purple-600/50 hover:shadow-xl hover:shadow-purple-500/80 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 relative overflow-hidden group tracking-wide"
          >
            <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out" />
            <div className="relative flex items-center justify-center gap-1.5">
              {isUploading ? (
                <><span className="inline-block animate-spin">⏳</span><span>UPLOADING...</span></>
              ) : (
                <><Upload className="w-4 h-4" /><span>UPLOAD DATA</span></>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ── Month Status Grid ── */}
      <div className="overflow-hidden border border-gray-800 rounded-xl shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 hover:border-purple-600/50 transition-all duration-300">
        <div className="bg-gradient-to-r from-slate-600 to-slate-700 px-6 sm:px-8 py-5 sm:py-6 rounded-t-xl border-b border-slate-600">
          <div className="flex items-start gap-4">
            <div className="bg-slate-500/50 p-2.5 rounded-lg mt-0.5">
              <span className="text-xl">📊</span>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1">Upload Status</h2>
              <p className="text-slate-300 text-sm font-normal">Overview for {selectedYear}</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6 bg-gray-950">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {MONTHS.map((month, idx) => {
              const monthNum  = idx + 1;
              const status    = getMonthStatus(monthNum);
              const isUploaded = status === "uploaded";
              const isBlueCard = idx % 2 === 0;

              return (
                <div
                  key={month}
                  className={`relative group rounded-xl p-4 sm:p-5 border backdrop-blur-sm transition-all duration-300 cursor-default overflow-hidden shadow-lg ${
                    isUploaded
                      ? isBlueCard
                        ? "bg-gradient-to-br from-purple-900/50 to-purple-800/30 border-purple-500/50 hover:border-purple-400/70 hover:shadow-xl hover:shadow-purple-500/40"
                        : "bg-gradient-to-br from-violet-900/50 to-violet-800/30 border-violet-500/50 hover:border-violet-400/70 hover:shadow-xl hover:shadow-violet-500/40"
                      : "bg-gradient-to-br from-slate-800/40 to-slate-700/20 border-slate-600/40 hover:border-slate-500/60 hover:shadow-xl hover:shadow-slate-500/20"
                  }`}
                >
                  <div className="flex flex-col h-full relative z-10">
                    <p className={`text-xs sm:text-sm font-bold uppercase tracking-widest mb-3 transition-colors duration-300 ${
                      isUploaded
                        ? isBlueCard ? "text-purple-100" : "text-violet-100"
                        : "text-white"
                    }`}>{month}</p>

                    <div className="flex items-center gap-2.5 mb-4 flex-grow">
                      {isUploaded ? (
                        <>
                          <div className={`w-3 h-3 rounded-full animate-pulse shadow-lg ${
                            isBlueCard ? "bg-purple-400 shadow-purple-400/80" : "bg-violet-400 shadow-violet-400/80"
                          }`} />
                          <span className={`text-xs sm:text-sm font-semibold ${
                            isBlueCard ? "text-purple-300" : "text-violet-300"
                          }`}>Uploaded</span>
                        </>
                      ) : (
                        <>
                          <div className="w-3 h-3 rounded-full bg-slate-500 group-hover:animate-pulse transition-all duration-300" />
                          <span className="text-xs sm:text-sm font-semibold text-slate-400 group-hover:text-slate-300 transition-colors duration-300">Pending</span>
                        </>
                      )}
                    </div>

                    {isUploaded && (
                      <button
                        onClick={() => openDeleteDialog(monthNum)}
                        disabled={isDeleting}
                        className={`text-xs font-semibold px-3 py-2 rounded-lg transition-all duration-300 w-full disabled:opacity-50 active:scale-95 border ${
                          isBlueCard
                            ? "text-purple-300 hover:text-purple-100 hover:bg-purple-500/25 border-purple-500/40 hover:border-purple-400/70"
                            : "text-violet-300 hover:text-violet-100 hover:bg-violet-500/25 border-violet-500/40 hover:border-violet-400/70"
                        }`}
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
