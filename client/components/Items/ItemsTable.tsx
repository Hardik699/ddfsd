import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

const r5 = (p: number) => Math.round(p / 5) * 5;

const autoPrice = (base: number, ch: string): number => {
  if (base <= 0) return 0;
  if (ch === "Zomato" || ch === "Swiggy") return r5(base * 1.15);
  return base;
};

// Only show size-based variations (contain digits or common size words)
const isSizeVariation = (val: string) =>
  /\d/.test(val) || /^(piece|half|full|small|medium|large|regular)$/i.test(val.trim());

// Custom sort: 1 KG → 500 Gms → 250 Gms → 1000 Gms → 1 PC → rest numerically
const variationPriority = (s: string): number => {
  const sl = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (sl === "1 kg" || sl === "1kg") return 0;
  if (sl === "500 gms" || sl === "500gms" || sl === "500 gm" || sl === "500gm") return 1;
  if (sl === "250 gms" || sl === "250gms" || sl === "250 gm" || sl === "250gm") return 2;
  if (sl === "1000 gms" || sl === "1000gms" || sl === "1000 gm" || sl === "1000gm") return 3;
  if (sl === "1 pc" || sl === "1pc" || sl === "1 piece") return 4;
  return 99;
};

const sortVariations = (a: string, b: string): number => {
  const pa = variationPriority(a);
  const pb = variationPriority(b);
  if (pa !== pb) return pa - pb;
  const n = (s: string) => {
    const num = parseFloat(s.match(/\d+/)?.[0] || "0");
    return s.toLowerCase().includes("kg") || s.toLowerCase().includes(" l") ? num * 1000 : num;
  };
  return n(a) - n(b);
};

interface ItemsTableProps {
  items: any[];
  onDelete?: (itemId: string) => void;
  onSelectedChange?: (selectedIds: Set<string>) => void;
}

export default function ItemsTable({ items, onDelete, onSelectedChange }: ItemsTableProps) {
  const navigate = useNavigate();
  const [perPage, setPerPage] = useState(15);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalPages = Math.ceil(items.length / perPage);
  const startIdx = page * perPage;
  const pageItems = items.slice(startIdx, startIdx + perPage);

  const variations: string[] = Array.from(
    new Set(items.flatMap((item) => (item.variations || []).map((v: any) => String(v.value))))
  )
    .filter(isSizeVariation)
    .sort(sortVariations);

  const getPrice = (item: any, varValue: string, channel: string): string => {
    const v = (item.variations || []).find((x: any) => x.value === varValue);
    if (!v) return "-";
    const stored = v.channels?.[channel];
    const price = stored && stored > 0 ? stored : autoPrice(v.price || 0, channel);
    return price > 0 ? `₹${price}` : "-";
  };

  const toggleRow = (itemId: string) => {
    const next = new Set(selected);
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    setSelected(next);
    onSelectedChange?.(next);
  };

  const toggleAll = () => {
    const next: Set<string> =
      selected.size === pageItems.length
        ? new Set()
        : new Set(pageItems.map((i: any) => i.itemId as string));
    setSelected(next);
    onSelectedChange?.(next);
  };

  if (items.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-12 text-center">
        <p className="text-gray-400 text-sm">No items added yet</p>
      </div>
    );
  }

  const CHANNELS = ["Dining", "Parcal", "Swiggy", "Zomato"];

  return (
    <div className="space-y-4">
      {/* Desktop sticky POS table */}
      <div
        className="hidden md:block rounded-xl border border-slate-700/40 shadow-md"
        style={{ overflow: "auto", maxHeight: "calc(100vh - 230px)" }}
      >
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content", minWidth: "100%" }}>
          <thead>
            {/* Row 1: frozen left cols (rowSpan=2) + variation group headers */}
            <tr style={{ background: "#0f172a" }} className="text-gray-100 text-xs font-bold">
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 0, zIndex: 40, background: "#0f172a", minWidth: 44, width: 44 }}
                className="px-3 py-3 text-center border-r border-b border-slate-700/50"
              >
                <input
                  type="checkbox"
                  checked={pageItems.length > 0 && selected.size === pageItems.length}
                  onChange={toggleAll}
                  className="w-4 h-4 cursor-pointer accent-blue-500 rounded"
                />
              </th>
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 44, zIndex: 40, background: "#0f172a", minWidth: 180 }}
                className="px-3 py-3 text-left border-r border-b border-slate-700/50"
              >
                Item Name
              </th>
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 224, zIndex: 40, background: "#0f172a", minWidth: 100 }}
                className="px-3 py-3 text-center border-r border-b border-slate-700/50"
              >
                Group
              </th>
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 324, zIndex: 40, background: "#0f172a", minWidth: 110 }}
                className="px-3 py-3 text-center border-r border-b border-slate-700/50"
              >
                Category
              </th>
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 434, zIndex: 40, background: "#0f172a", minWidth: 110 }}
                className="px-3 py-3 text-center border-r border-b border-slate-700/50"
              >
                SKU
              </th>
              <th
                rowSpan={2}
                style={{ position: "sticky", top: 0, left: 544, zIndex: 40, background: "#0f172a", minWidth: 52, boxShadow: "4px 0 16px rgba(0,0,0,0.6)" }}
                className="px-2 py-3 text-center border-r border-b border-slate-700/50"
              >
                Action
              </th>
              {variations.map((v) => (
                <th
                  key={v}
                  colSpan={4}
                  style={{ position: "sticky", top: 0, zIndex: 20, background: "#1e3a5f" }}
                  className="px-3 py-2.5 text-center border border-slate-600/40 text-[11px] text-blue-200"
                >
                  {v}
                </th>
              ))}
            </tr>
            {/* Row 2: channel sub-headers */}
            <tr style={{ background: "#1e293b" }} className="text-gray-300 text-[10px] font-bold">
              {variations.map((v) => (
                <React.Fragment key={`${v}-ch`}>
                  {CHANNELS.map((ch) => (
                    <th
                      key={ch}
                      style={{ position: "sticky", top: 40, zIndex: 20, background: "#1e293b" }}
                      className="px-2 py-2 text-center border border-slate-600/40"
                    >
                      {ch}
                    </th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item: any) => {
              const isSel = selected.has(item.itemId);
              const bg = isSel ? "#1e3a5f" : "#0f172a";
              return (
                <tr
                  key={item.itemId}
                  onClick={() => navigate(`/items/${item.itemId}`)}
                  className="border-b border-slate-700/30 cursor-pointer text-xs group hover:brightness-110"
                  style={{ background: bg }}
                >
                  <td
                    style={{ position: "sticky", left: 0, zIndex: 10, background: bg, minWidth: 44, width: 44 }}
                    className="px-3 py-3 text-center border-r border-slate-700/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleRow(item.itemId)}
                      className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                    />
                  </td>
                  <td
                    style={{ position: "sticky", left: 44, zIndex: 10, background: bg, minWidth: 180 }}
                    className="px-3 py-3 text-white font-semibold border-r border-slate-700/40"
                  >
                    <span className="truncate block max-w-[160px]">{item.itemName}</span>
                  </td>
                  <td
                    style={{ position: "sticky", left: 224, zIndex: 10, background: bg, minWidth: 100 }}
                    className="px-3 py-3 text-gray-300 text-center border-r border-slate-700/40"
                  >
                    {item.group}
                  </td>
                  <td
                    style={{ position: "sticky", left: 324, zIndex: 10, background: bg, minWidth: 110 }}
                    className="px-3 py-3 text-gray-300 text-center border-r border-slate-700/40"
                  >
                    {item.category}
                  </td>
                  <td
                    style={{ position: "sticky", left: 434, zIndex: 10, background: bg, minWidth: 110 }}
                    className="px-3 py-3 text-center border-r border-slate-700/40"
                  >
                    {item.supplyNoteSku ? (
                      <span className="text-purple-300 font-mono text-[11px] bg-purple-900/30 px-2 py-0.5 rounded border border-purple-700/40">
                        {item.supplyNoteSku}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[11px]">—</span>
                    )}
                  </td>
                  <td
                    style={{ position: "sticky", left: 544, zIndex: 10, background: bg, minWidth: 52, boxShadow: "4px 0 16px rgba(0,0,0,0.6)" }}
                    className="px-2 py-3 text-center border-r border-slate-700/40"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => onDelete?.(item.itemId)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                  {variations.map((v) => (
                    <React.Fragment key={`${item.itemId}-${v}`}>
                      {CHANNELS.map((ch) => (
                        <td key={ch} className="px-2 py-3 text-center font-bold text-gray-100 border border-slate-600/30 bg-slate-800/40 text-xs">
                          {getPrice(item, v, ch)}
                        </td>
                      ))}
                    </React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {pageItems.map((item: any) => (
          <div
            key={item.itemId}
            onClick={() => navigate(`/items/${item.itemId}`)}
            className="bg-slate-800/30 border border-slate-700/40 rounded-lg p-4 cursor-pointer hover:bg-slate-800/60 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-white font-semibold text-sm flex-1">{item.itemName}</h3>
              <input
                type="checkbox"
                checked={selected.has(item.itemId)}
                onChange={() => toggleRow(item.itemId)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div><p className="text-gray-400">Group</p><p className="text-gray-200">{item.group}</p></div>
              <div><p className="text-gray-400">Category</p><p className="text-gray-200">{item.category}</p></div>
              {item.supplyNoteSku && (
                <div className="col-span-2">
                  <p className="text-gray-400">Supply Note SKU</p>
                  <p className="text-purple-300 font-mono">{item.supplyNoteSku}</p>
                </div>
              )}
            </div>
            {variations.length > 0 && (
              <div className="pt-2 border-t border-slate-700/40">
                <p className="text-gray-400 text-xs mb-2">{variations[0]}</p>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  {CHANNELS.map((ch) => (
                    <div key={ch} className="text-center bg-slate-700/30 rounded p-1.5 border border-slate-600/40">
                      <p className="text-gray-400 text-[10px]">{ch}</p>
                      <p className="text-gray-100 font-bold">{getPrice(item, variations[0], ch)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="px-4 py-4 border border-slate-700/40 rounded-lg bg-slate-800/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-gray-400">
          Showing{" "}
          <span className="text-gray-100">{startIdx + 1}</span>–
          <span className="text-gray-100">{Math.min(startIdx + perPage, items.length)}</span>{" "}
          of <span className="text-gray-100">{items.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-1.5 hover:bg-slate-700/50 rounded disabled:opacity-30 text-gray-400 border border-slate-700/40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, idx) => {
            const p = totalPages <= 5 ? idx : Math.min(Math.max(page - 2, 0) + idx, totalPages - 1);
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded text-xs font-semibold ${page === p ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-slate-700/40"}`}
              >
                {p + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="p-1.5 hover:bg-slate-700/50 rounded disabled:opacity-30 text-gray-400 border border-slate-700/40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
            className="ml-2 text-xs bg-slate-700/40 text-gray-100 rounded px-2 py-1 border-l border-slate-600/40"
          >
            {[5, 10, 15, 20, 30, 50].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
