import { useState, useEffect } from "react";
import { ArrowLeft, Download, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DailySalesReport() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 6 months ago
    end: new Date().toISOString().split("T")[0],
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedFormat, setSelectedFormat] = useState<string>("monthly"); // Default to monthly for 6 months data
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showItemSelection, setShowItemSelection] = useState(false);

  // Fetch categories from items
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch("/api/items");
        if (response.ok) {
          const items = await response.json();
          const uniqueCategories = Array.from(new Set(items.map((item: any) => item.category).filter(Boolean))) as string[];
          setCategories(uniqueCategories.sort());
        }
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };

    fetchCategories();
  }, []);

  // Fetch items when category changes
  useEffect(() => {
    const fetchItems = async () => {
      if (selectedCategory === "all") {
        setAvailableItems([]);
        setSelectedItems([]);
        setShowItemSelection(false);
        return;
      }

      try {
        const response = await fetch("/api/items");
        if (response.ok) {
          const items = await response.json();
          const categoryItems = items.filter((item: any) => item.category === selectedCategory);
          setAvailableItems(categoryItems);
          setSelectedItems([]); // Reset selection when category changes
          setShowItemSelection(categoryItems.length > 0);
        }
      } catch (error) {
        console.error("Failed to fetch items:", error);
        setAvailableItems([]);
        setSelectedItems([]);
        setShowItemSelection(false);
      }
    };

    fetchItems();
  }, [selectedCategory]);

  // â”€â”€â”€ Shared helper: fetch all sales data via ONE bulk API call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchBulkSalesData = async (itemsToProcess: any[]): Promise<any[]> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("Bulk sales fetch timeout after 180 seconds"));
    }, 180000); // 180 second timeout for very large datasets (19k+ rows)

    try {
      const itemIds = itemsToProcess.map((i: any) => i.itemId);
      const response = await fetch("/api/sales/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds, startDate: dateRange.start, endDate: dateRange.end }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error("Failed to fetch bulk sales data");
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Bulk API error");
      console.log(`✅ Bulk API: ${data.count} records for ${itemsToProcess.length} items`);
      return data.data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  };

  // â”€â”€â”€ Shared helper: fetch supply note qty by item + date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchSupplyNoteQty = async (itemsToProcess: any[]): Promise<Map<string, number>> => {
    // Build list of items that have supplyNoteSku
    const itemsWithSku = itemsToProcess
      .filter((i: any) => i.supplyNoteSku)
      .map((i: any) => ({ itemId: i.itemId, supplyNoteSku: i.supplyNoteSku }));

    if (itemsWithSku.length === 0) return new Map();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("Supply note fetch timeout after 120 seconds"));
    }, 120000); // 120 second timeout for supply note processing

    try {
      const response = await fetch("/api/supply-note/qty-by-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemsWithSku, startDate: dateRange.start, endDate: dateRange.end }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) return new Map();
      const data = await response.json();
      if (!data.success) return new Map();

      // Map: "itemId_date" â†’ supplyNoteQty
      const map = new Map<string, number>();
      for (const rec of data.data) {
        map.set(`${rec.itemId}_${rec.date}`, rec.supplyNoteQty);
      }
      console.log(`✅ Supply note qty: ${map.size} date-item records`);
      return map;
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.warn("Supply note fetch failed:", error.message);
      return new Map();
    }
  };

  // â”€â”€â”€ Shared helper: get items to process â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const getItemsToProcess = async (): Promise<any[]> => {
    // List API now includes supplyNoteSku — no individual calls needed
    if (selectedCategory === "all") {
      const r = await fetch("/api/items");
      if (!r.ok) throw new Error("Failed to fetch items");
      return r.json();
    }
    const baseItems = selectedItems.length > 0
      ? availableItems.filter((item: any) => selectedItems.includes(item.itemId))
      : availableItems;
    // availableItems come from list API which now includes supplyNoteSku
    return baseItems;
  };

  // â”€â”€â”€ Shared helper: apply Excel styling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const applyExcelStyling = (ws: any, XLSX: any) => {
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
          ...(R === 0
            ? { fill: { fgColor: { rgb: "4472C4" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 } }
            : R === 1
            ? { fill: { fgColor: { rgb: "8FAADC" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 } }
            : { fill: { fgColor: { rgb: "FFFFFF" } }, font: { sz: 11 } }),
        };
      }
    }
  };

  const downloadWeeklySalesReport = async () => {
    try {
      setLoading(true);
      const XLSX = await import("xlsx");

      const itemsToProcess = await getItemsToProcess();
      if (itemsToProcess.length === 0) { alert("No items selected"); setLoading(false); return; }

      const [allSalesData, supplyNoteMap] = await Promise.all([
        fetchBulkSalesData(itemsToProcess),
        fetchSupplyNoteQty(itemsToProcess),
      ]);

      if (allSalesData.length === 0) {
        alert("No sales data found for selected items and date range");
        setLoading(false);
        return;
      }

      // Group data by item
      const itemMap: any = {};
      allSalesData.forEach((sale: any) => {
        const key = `${sale.itemName}_${sale.category}`;
        if (!itemMap[key]) itemMap[key] = { itemName: sale.itemName, category: sale.category, group: sale.group || "N/A", itemId: sale.itemId, dates: {} };
        if (!itemMap[key].dates[sale.date]) itemMap[key].dates[sale.date] = { online: 0, offline: 0 };
        itemMap[key].dates[sale.date].online += (sale.zomatoQty || 0) + (sale.swiggyQty || 0);
        itemMap[key].dates[sale.date].offline += (sale.diningQty || 0) + (sale.parcelQty || 0);
      });

      // Generate weekly ranges
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const weeklyRanges: Array<{ start: Date; end: Date; label: string }> = [];
      let currentWeekStart = new Date(startDate);
      while (currentWeekStart <= endDate) {
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
        if (currentWeekEnd > endDate) currentWeekEnd.setTime(endDate.getTime());
        const startLabel = `${String(currentWeekStart.getUTCDate()).padStart(2,"0")}/${String(currentWeekStart.getUTCMonth()+1).padStart(2,"0")}/${currentWeekStart.getUTCFullYear()}`;
        const endLabel = `${String(currentWeekEnd.getUTCDate()).padStart(2,"0")}/${String(currentWeekEnd.getUTCMonth()+1).padStart(2,"0")}/${currentWeekEnd.getUTCFullYear()}`;
        weeklyRanges.push({ start: new Date(currentWeekStart), end: new Date(currentWeekEnd), label: `${startLabel} To ${endLabel}` });
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      }

      const headerRow1: any[] = ["restaurant_name", "brand_grouping", "item_name", "category_name"];
      const headerRow2: any[] = ["", "", "", ""];
      weeklyRanges.forEach((week) => {
        headerRow1.push(week.label, "", "");
        headerRow2.push("Online", "Offline", "Supply Note Qty");
      });
      headerRow1.push("Total", "", "", "Unit");
      headerRow2.push("Online", "Offline", "Supply Note Qty", "");

      const dataRows: any[] = [];
      Object.values(itemMap).forEach((item: any) => {
        const row: any[] = ["HanuRam CCO", item.group, item.itemName, item.category];
        let totalOnline = 0, totalOffline = 0, totalSupply = 0;

        weeklyRanges.forEach((week) => {
          let weekOnline = 0, weekOffline = 0, weekSupply = 0;
          Object.entries(item.dates).forEach(([dateStr, data]: [string, any]) => {
            const date = new Date(dateStr + "T00:00:00Z"); // Use UTC to avoid timezone shifts
            if (date >= week.start && date <= week.end) {
              weekOnline  += data.online;
              weekOffline += data.offline;
              weekSupply  += supplyNoteMap.get(`${item.itemId}_${dateStr}`) || 0;
            }
          });
          row.push(
            weekOnline  > 0 ? parseFloat(weekOnline.toFixed(2))  : 0,
            weekOffline > 0 ? parseFloat(weekOffline.toFixed(2)) : 0,
            weekSupply  > 0 ? parseFloat(weekSupply.toFixed(2))  : 0,
          );
          totalOnline  += weekOnline;
          totalOffline += weekOffline;
          totalSupply  += weekSupply;
        });

        row.push(
          totalOnline  > 0 ? parseFloat(totalOnline.toFixed(2))  : 0,
          totalOffline > 0 ? parseFloat(totalOffline.toFixed(2)) : 0,
          totalSupply  > 0 ? parseFloat(totalSupply.toFixed(2))  : 0,
          "KG",
        );
        dataRows.push(row);
      });

      dataRows.sort((a, b) => { if (a[3] !== b[3]) return a[3].localeCompare(b[3]); return a[2].localeCompare(b[2]); });

      const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);

      const merges: any[] = [];
      let colIndex = 4;
      weeklyRanges.forEach(() => { merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } }); colIndex += 3; });
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } });
      ws["!merges"] = merges;

      const colWidths = [{ wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 18 }];
      weeklyRanges.forEach(() => { colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 16 }); });
      colWidths.push({ wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 8 });
      ws["!cols"] = colWidths;

      // Apply styling
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;
          ws[cellAddress].s = {
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
          };
          if (R === 0) { ws[cellAddress].s.fill = { fgColor: { rgb: "4472C4" } }; ws[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, sz: 12 }; }
          else if (R === 1) { ws[cellAddress].s.fill = { fgColor: { rgb: "8FAADC" } }; ws[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }; }
          else { ws[cellAddress].s.fill = { fgColor: { rgb: "FFFFFF" } }; ws[cellAddress].s.font = { sz: 11 }; }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Weekly Sales");
      const categoryLabel = selectedCategory === "all" ? "All_Categories" : selectedCategory.replace(/\s+/g, "_");
      XLSX.writeFile(wb, `Weekly_Sales_Report_${categoryLabel}_${dateRange.start}_to_${dateRange.end}.xlsx`, { bookType: "xlsx", cellStyles: true });

      setLoading(false);
    } catch (error: any) {
      console.error("Weekly download failed:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("timeout")) {
        alert("Download is taking too long. Please try again with a shorter date range or fewer items.");
      } else {
        alert(`Failed to download weekly report: ${errorMsg}`);
      }
      setLoading(false);
    }
  };



  // Helper: convert YYYY-MM-DD to month key without timezone issues
  const getMonthKeyFromDateString = (dateStr: string): string => {
    // dateStr format: "YYYY-MM-DD"
    const [year, month] = dateStr.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthIndex = parseInt(month) - 1;
    const shortYear = year.substring(2);
    return `${monthNames[monthIndex]}-${shortYear}`;
  };

  const downloadMonthlySalesReport = async () => {
    try {
      setLoading(true);
      const XLSX = await import("xlsx");

      const itemsToProcess = await getItemsToProcess();
      if (itemsToProcess.length === 0) { alert("No items selected"); setLoading(false); return; }

      const [allSalesData, supplyNoteMap] = await Promise.all([
        fetchBulkSalesData(itemsToProcess),
        fetchSupplyNoteQty(itemsToProcess),
      ]);

      if (allSalesData.length === 0) {
        alert("No sales data found for selected items and date range");
        setLoading(false);
        return;
      }

      // Group data by item and month
      const itemMap: any = {};
      allSalesData.forEach((sale: any) => {
        const itemKey = `${sale.itemName}_${sale.category}`;
        if (!itemMap[itemKey]) {
          itemMap[itemKey] = { itemName: sale.itemName, category: sale.category, group: sale.group || "N/A", itemId: sale.itemId, months: {} };
        }
        const monthKey = getMonthKeyFromDateString(sale.date);
        if (!itemMap[itemKey].months[monthKey]) itemMap[itemKey].months[monthKey] = { online: 0, offline: 0, supply: 0 };
        itemMap[itemKey].months[monthKey].online  += (sale.zomatoQty || 0) + (sale.swiggyQty || 0);
        itemMap[itemKey].months[monthKey].offline += (sale.diningQty  || 0) + (sale.parcelQty || 0);
      });

      // Add supply note qty separately — once per itemId+date, not once per sale row
      supplyNoteMap.forEach((qty, key) => {
        // key = "itemId_YYYY-MM-DD"
        const lastUnderscore = key.lastIndexOf("_");
        const itemId = key.substring(0, lastUnderscore);
        const dateStr = key.substring(lastUnderscore + 1);
        const monthKey = getMonthKeyFromDateString(dateStr);

        // Find the item in itemMap by itemId
        const itemEntry = Object.values(itemMap).find((item: any) => item.itemId === itemId) as any;
        if (!itemEntry) return;
        if (!itemEntry.months[monthKey]) itemEntry.months[monthKey] = { online: 0, offline: 0, supply: 0 };
        itemEntry.months[monthKey].supply += qty;
      });

      // Get all unique months in chronological order
      const allMonths = Array.from(new Set(
        allSalesData.map((sale: any) => {
          const date = new Date(sale.date);
          return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", "-");
        })
      )).sort((a, b) => {
        const [monthA, yearA] = a.split("-");
        const [monthB, yearB] = b.split("-");
        if (yearA !== yearB) return parseInt(yearA) - parseInt(yearB);
        const monthOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return monthOrder.indexOf(monthA) - monthOrder.indexOf(monthB);
      });

      const headerRow1: any[] = ["restaurant_name", "brand_grouping", "item_name", "category_name"];
      const headerRow2: any[] = ["", "", "", ""];
      allMonths.forEach((month) => {
        headerRow1.push(month, "", "");
        headerRow2.push("Online", "Offline", "Supply Note Qty");
      });
      headerRow1.push("Total", "", "", "Unit");
      headerRow2.push("Online", "Offline", "Supply Note Qty", "");

      const dataRows: any[] = [];
      Object.values(itemMap).forEach((item: any) => {
        const row: any[] = ["HanuRam CCO", item.group, item.itemName, item.category];
        let totalOnline = 0, totalOffline = 0, totalSupply = 0;
        allMonths.forEach((month) => {
          const online  = item.months[month]?.online  || 0;
          const offline = item.months[month]?.offline || 0;
          const supply  = item.months[month]?.supply  || 0;
          row.push(
            online  > 0 ? parseFloat(online.toFixed(2))  : 0,
            offline > 0 ? parseFloat(offline.toFixed(2)) : 0,
            supply  > 0 ? parseFloat(supply.toFixed(2))  : 0,
          );
          totalOnline  += online;
          totalOffline += offline;
          totalSupply  += supply;
        });
        row.push(
          totalOnline  > 0 ? parseFloat(totalOnline.toFixed(2))  : 0,
          totalOffline > 0 ? parseFloat(totalOffline.toFixed(2)) : 0,
          totalSupply  > 0 ? parseFloat(totalSupply.toFixed(2))  : 0,
          "KG",
        );
        dataRows.push(row);
      });

      dataRows.sort((a, b) => { if (a[3] !== b[3]) return a[3].localeCompare(b[3]); return a[2].localeCompare(b[2]); });

      const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);

      const merges: any[] = [];
      let colIndex = 4;
      allMonths.forEach(() => { merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } }); colIndex += 3; });
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } });
      ws["!merges"] = merges;

      const colWidths = [{ wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 18 }];
      allMonths.forEach(() => { colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 16 }); });
      colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 8 });
      ws["!cols"] = colWidths;

      // Apply styling
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;
          ws[cellAddress].s = {
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } },
          };
          if (R === 0) { ws[cellAddress].s.fill = { fgColor: { rgb: "4472C4" } }; ws[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, sz: 12 }; }
          else if (R === 1) { ws[cellAddress].s.fill = { fgColor: { rgb: "8FAADC" } }; ws[cellAddress].s.font = { bold: true, color: { rgb: "FFFFFF" }, sz: 11 }; }
          else { ws[cellAddress].s.fill = { fgColor: { rgb: "FFFFFF" } }; ws[cellAddress].s.font = { sz: 11 }; }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Monthly Sales");
      const categoryLabel = selectedCategory === "all" ? "All_Categories" : selectedCategory.replace(/\s+/g, "_");
      XLSX.writeFile(wb, `Monthly_Sales_Report_${categoryLabel}_${dateRange.start}_to_${dateRange.end}.xlsx`, { bookType: "xlsx", cellStyles: true });

      setLoading(false);
    } catch (error: any) {
      console.error("Monthly download failed:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("timeout")) {
        alert("Download is taking too long. Please try again with a shorter date range or fewer items.");
      } else {
        alert(`Failed to download monthly report: ${errorMsg}`);
      }
      setLoading(false);
    }
  };


  const downloadDailySalesReport = async () => {
    try {
      setLoading(true);
      const XLSX = await import("xlsx");

      const itemsToProcess = await getItemsToProcess();
      if (itemsToProcess.length === 0) { alert("No items selected"); setLoading(false); return; }

      // Fetch sales + supply note qty in parallel
      const [allSalesData, supplyNoteMap] = await Promise.all([
        fetchBulkSalesData(itemsToProcess),
        fetchSupplyNoteQty(itemsToProcess),
      ]);

      if (allSalesData.length === 0) {
        alert("No sales data found for selected items and date range");
        setLoading(false);
        return;
      }

      // Build itemId lookup: itemName_category â†’ itemId
      const itemIdMap: Record<string, string> = {};
      itemsToProcess.forEach((i: any) => {
        itemIdMap[`${i.itemName}_${i.category}`] = i.itemId;
      });

      // Group data by item
      const itemMap: any = {};
      allSalesData.forEach((sale: any) => {
        const key = `${sale.itemName}_${sale.category}`;
        if (!itemMap[key]) itemMap[key] = { itemName: sale.itemName, category: sale.category, group: sale.group || "N/A", itemId: sale.itemId, dates: {} };
        if (!itemMap[key].dates[sale.date]) itemMap[key].dates[sale.date] = { online: 0, offline: 0 };
        itemMap[key].dates[sale.date].online += (sale.zomatoQty || 0) + (sale.swiggyQty || 0);
        itemMap[key].dates[sale.date].offline += (sale.diningQty || 0) + (sale.parcelQty || 0);
      });

      const allDates = Array.from(new Set(allSalesData.map((s: any) => s.date))).sort();

      // Header row 1: date spans (3 cols each: Online, Offline, Supply Note Qty)
      const headerRow1: any[] = ["restaurant_name", "brand_grouping", "item_name", "category_name"];
      const headerRow2: any[] = ["", "", "", ""];
      allDates.forEach((date: string) => {
        headerRow1.push(date.split("-").reverse().join("/"), "", "");
        headerRow2.push("Online", "Offline", "Supply Note Qty");
      });
      headerRow1.push("Total", "", "", "Unit");
      headerRow2.push("Online", "Offline", "Supply Note Qty", "");

      const dataRows: any[] = [];
      Object.values(itemMap).forEach((item: any) => {
        const row: any[] = ["HanuRam CCO", item.group, item.itemName, item.category];
        let totalOnline = 0, totalOffline = 0, totalSupply = 0;
        allDates.forEach((date: string) => {
          const online  = item.dates[date]?.online  || 0;
          const offline = item.dates[date]?.offline || 0;
          const supplyQty = supplyNoteMap.get(`${item.itemId}_${date}`) || 0;
          row.push(
            online  > 0 ? parseFloat(online.toFixed(2))  : 0,
            offline > 0 ? parseFloat(offline.toFixed(2)) : 0,
            supplyQty > 0 ? parseFloat(supplyQty.toFixed(2)) : 0,
          );
          totalOnline  += online;
          totalOffline += offline;
          totalSupply  += supplyQty;
        });
        row.push(
          parseFloat(totalOnline.toFixed(2)),
          parseFloat(totalOffline.toFixed(2)),
          parseFloat(totalSupply.toFixed(2)),
          "KG",
        );
        dataRows.push(row);
      });

      dataRows.sort((a, b) => a[3] !== b[3] ? a[3].localeCompare(b[3]) : a[2].localeCompare(b[2]));

      const ws = XLSX.utils.aoa_to_sheet([headerRow1, headerRow2, ...dataRows]);

      // Merge date header cells (3 cols each)
      const merges: any[] = [];
      let colIndex = 4;
      allDates.forEach(() => { merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } }); colIndex += 3; });
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + 2 } });
      ws["!merges"] = merges;

      const colWidths = [{ wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 18 }];
      allDates.forEach(() => { colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 16 }); });
      colWidths.push({ wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 8 });
      ws["!cols"] = colWidths;

      applyExcelStyling(ws, XLSX);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Daily Sales");
      const categoryLabel = selectedCategory === "all" ? "All_Categories" : selectedCategory.replace(/\s+/g, "_");
      XLSX.writeFile(wb, `Daily_Sales_Report_${categoryLabel}_${dateRange.start}_to_${dateRange.end}.xlsx`, { bookType: "xlsx", cellStyles: true });

      setLoading(false);
    } catch (error: any) {
      console.error("Download failed:", error);
      const errorMsg = error.message || "Unknown error";
      if (errorMsg.includes("timeout")) {
        alert("Download is taking too long. Please try again with a shorter date range or fewer items.");
      } else {
        alert(`Failed to download report: ${errorMsg}`);
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Back Button */}
        <button
          onClick={() => navigate("/reports")}
          className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </button>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-3 rounded-xl">
            <TrendingUp className="w-7 h-7 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white">Daily Sales Breakdown</h1>
            <p className="text-gray-400 text-sm mt-1">
              Download day-wise sales report with online/offline split
            </p>
          </div>
        </div>

        {/* Report Configuration Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6">
          {/* Date Range */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              ðŸ“… Select Date Range
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2 font-medium">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2 font-medium">End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Category Selection */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              ðŸ·ï¸ Select Category
            </h2>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Item Selection */}
          {showItemSelection && (
            <div>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                ðŸ“¦ Select Items ({selectedItems.length}/{availableItems.length} selected)
              </h2>
              
              {/* Select All/None Controls */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => setSelectedItems(availableItems.map((item: any) => item.itemId))}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedItems([])}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium transition-colors text-sm"
                >
                  Select None
                </button>
              </div>

              {/* Items List */}
              <div className="max-h-60 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
                {availableItems.map((item: any) => (
                  <label
                    key={item.itemId}
                    className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.itemId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems([...selectedItems, item.itemId]);
                        } else {
                          setSelectedItems(selectedItems.filter(id => id !== item.itemId));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <span className="text-white font-medium">{item.itemName}</span>
                    <span className="text-gray-400 text-sm ml-auto">{item.category}</span>
                  </label>
                ))}
              </div>

              {selectedItems.length === 0 && (
                <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-yellow-300 text-sm">
                    âš ï¸ Please select at least one item to download the report.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Format Selection */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              ðŸ“Š Select Format
            </h2>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer"
            >
              <option value="daily">Daily Breakdown</option>
              <option value="weekly">Weekly Breakdown</option>
              <option value="monthly">Monthly Breakdown</option>
            </select>
          </div>

          {/* Download Button */}
          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={() => {
                if (selectedFormat === "daily") {
                  downloadDailySalesReport();
                } else if (selectedFormat === "weekly") {
                  downloadWeeklySalesReport();
                } else if (selectedFormat === "monthly") {
                  downloadMonthlySalesReport();
                }
              }}
              disabled={loading || (showItemSelection && selectedItems.length === 0)}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-green-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download {selectedFormat.charAt(0).toUpperCase() + selectedFormat.slice(1)} Report
                </>
              )}
            </button>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              <span className="font-bold">â„¹ï¸ Report Format:</span> The report will include {
                selectedCategory === "all" 
                  ? "ALL items from ALL categories" 
                  : showItemSelection && selectedItems.length > 0
                    ? `${selectedItems.length} selected items from ${selectedCategory} category`
                    : `all items in ${selectedCategory} category`
              } with {selectedFormat} sales breakdown showing Online (Zomato + Swiggy) and Offline (Dining + Parcel) quantities, along with totals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
