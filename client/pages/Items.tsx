import { useState, useEffect, useMemo } from "react";
import { Plus, Download, Search, FileUp, Trash2 } from "lucide-react";
import ItemForm from "@/components/Items/ItemForm";
import ItemsTable from "@/components/Items/ItemsTable";
import ExcelImportDialog from "@/components/Items/ExcelImportDialog";

export default function Items() {
  const [showForm, setShowForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Filter items based on search term and remove empty items
  const filteredItems = useMemo(() => {
    // First filter out items with no meaningful data
    const validItems = items.filter((item) => {
      // Check if item has meaningful data
      const hasItemName = item.itemName && item.itemName.trim() !== '' && item.itemName !== 'imported';
      const hasValidGroup = item.group && item.group.trim() !== '' && item.group !== 'Other';
      const hasValidCategory = item.category && item.category.trim() !== '' && item.category !== 'Other';
      const hasVariations = item.variations && Array.isArray(item.variations) && item.variations.length > 0;
      const hasDescription = item.description && item.description.trim() !== '';
      const hasHsnCode = item.hsnCode && item.hsnCode.trim() !== '';
      
      // Item must have at least a proper name (not just "imported") AND either variations or other data
      const hasProperName = hasItemName && item.itemName !== 'imported';
      const hasOtherData = hasValidGroup || hasValidCategory || hasVariations || hasDescription || hasHsnCode;
      
      return hasProperName && hasOtherData;
    });
    
    console.log(`📊 Filtered ${items.length} items to ${validItems.length} valid items`);
    
    // Then apply search filter
    if (!searchTerm.trim()) return validItems;
    const lowerSearch = searchTerm.toLowerCase();
    return validItems.filter(
      (item) =>
        item.itemName?.toLowerCase().includes(lowerSearch) ||
        item.itemId?.toLowerCase().includes(lowerSearch) ||
        item.group?.toLowerCase().includes(lowerSearch) ||
        item.category?.toLowerCase().includes(lowerSearch)
    );
  }, [items, searchTerm]);

  // Ultra-fast items fetching with aggressive caching
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    const fetchItems = async () => {
      try {
        if (isMounted) setLoading(true);
        console.log("⚡ ULTRA-FAST: Fetching items...");

        // Ultra-fast timeout for immediate feedback
        timeoutId = setTimeout(() => {
          console.log("⏱️ Ultra-fast timeout after 5 seconds");
          controller.abort(new Error("Request timeout after 5 seconds"));
        }, 5000);

        const response = await fetch("/api/items", {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'max-age=300', // 5 minute browser cache
          }
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`API returned ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`⚡ ULTRA-FAST: Loaded ${data.length} items in milliseconds`);

        if (isMounted) {
          setItems(Array.isArray(data) ? data : []);
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.warn("⚠️ Fetch was aborted:", error.message);
        } else {
          console.error("❌ Ultra-fast fetch failed:", error);
        }
        if (isMounted) {
          setItems([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchItems();

    // Cleanup function
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort(new Error("Component unmounted"));
    };
  }, []);

  const handleAddItem = (newItem: any) => {
    // Item is already saved in MongoDB via API
    // Just add it to the local state for immediate UI update
    setItems([...items, newItem]);
    setShowForm(false);
  };

  const handleImportItems = (newItems: any[]) => {
    // Add imported items to the local state
    setItems([...items, ...newItems]);
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(`Are you sure you want to delete this item?`)) return;

    try {
      console.log(`🗑️ Deleting item: ${itemId}`);
      const response = await fetch(`/api/items/${itemId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setItems(items.filter((item) => item.itemId !== itemId));
        console.log(`✅ Item ${itemId} deleted successfully`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Failed to delete item ${itemId}:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error || "Unknown error",
          details: errorData.details || "",
        });
        alert(`Failed to delete item: ${errorData.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error(`❌ Error deleting item ${itemId}:`, {
        name: error.name,
        message: error.message,
      });
      alert(`Error deleting item: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;

    const count = selectedItems.size;
    if (!confirm(`Delete ${count} item${count !== 1 ? "s" : ""}? This action cannot be undone.`)) return;

    setDeleting(true);
    try {
      let successCount = 0;
      let failCount = 0;
      const failedItems: string[] = [];

      for (const itemId of selectedItems) {
        try {
          console.log(`🗑️ Deleting item: ${itemId}`);
          const response = await fetch(`/api/items/${itemId}`, {
            method: "DELETE",
          });

          if (response.ok) {
            successCount++;
            console.log(`✅ Successfully deleted item: ${itemId}`);
          } else {
            failCount++;
            failedItems.push(itemId);
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ Failed to delete item ${itemId}:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorData.error || "Unknown error",
            });
          }
        } catch (error) {
          failCount++;
          failedItems.push(itemId);
          console.error(`❌ Network error deleting item ${itemId}:`, error);
        }
      }

      // Remove deleted items from local state
      const newItems = items.filter((item) => !selectedItems.has(item.itemId));
      setItems(newItems);
      setSelectedItems(new Set());

      if (successCount > 0) {
        console.log(`✅ Deleted ${successCount} item${successCount !== 1 ? "s" : ""}`);
      }
      if (failCount > 0) {
        console.error(`❌ Failed to delete ${failCount} item${failCount !== 1 ? "s" : ""}:`, {
          failedItems,
          details: "Check console for individual error messages",
        });
        alert(`Deleted ${successCount} items. Failed to delete ${failCount} items: ${failedItems.join(", ")}`);
      }
    } finally {
      setDeleting(false);
    }
  };

  // Migrate existing items to add GS1 channel (runs once on mount)
  useEffect(() => {
    const migrateGS1 = async () => {
      try {
        console.log("🔄 Starting GS1 migration...");
        console.log(`📍 POST to: ${window.location.origin}/api/items/migrate/add-gs1`);

        const response = await fetch("/api/items/migrate/add-gs1", {
          method: "POST",
        });

        if (response.ok) {
          const result = await response.json();
          console.log("✅ GS1 migration completed:", result);
        } else {
          console.warn(`⚠️ Migration returned status ${response.status}: ${response.statusText}`);
        }
      } catch (error: any) {
        console.error("GS1 migration failed (non-critical):", error);
        console.error("Migration error details:", {
          name: error.name,
          message: error.message,
        });
      }
    };

    migrateGS1();
  }, []);

  const calcZomatoPrice = (basePrice: number): number => {
    if (!basePrice || basePrice <= 0) return 0;
    return Math.round((basePrice * 1.15) / 5) * 5;
  };

  const handleDownloadItemList = async () => {
      try {
        const XLSX = await import("xlsx");

        const isSizeVar = (val: string) =>
          /\d/.test(val) || /^(piece|half|full|small|medium|large|regular)$/i.test(val.trim());

        const varPriority = (s: string) => {
          const sl = s.toLowerCase().replace(/\s+/g, " ").trim();
          if (sl === "1 kg" || sl === "1kg") return 0;
          if (sl === "500 gms" || sl === "500gms" || sl === "500 gm" || sl === "500gm") return 1;
          if (sl === "250 gms" || sl === "250gms" || sl === "250 gm" || sl === "250gm") return 2;
          if (sl === "1000 gms" || sl === "1000gms" || sl === "1000 gm" || sl === "1000gm") return 3;
          if (sl === "1 pc" || sl === "1pc" || sl === "1 piece") return 4;
          if (/\d/.test(sl) && (sl.includes("gm") || sl.includes("kg"))) return 5;
          return 6;
        };

        const allVariations = Array.from(
          new Set(items.flatMap((item) => (item.variations || []).map((v: any) => String(v.value))))
        )
          .filter(isSizeVar)
          .sort((a, b) => {
            const pa = varPriority(a), pb = varPriority(b);
            if (pa !== pb) return pa - pb;
            const n = (s: string) => {
              const num = parseFloat(s.match(/[\d.]+/)?.[0] || "0");
              return s.toLowerCase().includes("kg") ? num * 1000 : num;
            };
            return n(a) - n(b);
          });

        const CHANNELS = ["Dining", "Parcal", "Swiggy", "Zomato"];

        const getPrice = (item: any, varValue: string, channel: string): number | string => {
          const v = (item.variations || []).find((x: any) => x.value === varValue);
          if (!v) return "";
          const stored = v.channels?.[channel];
          let price = stored && stored > 0 ? stored : 0;
          if (!price) {
            if (channel === "Zomato" || channel === "Swiggy") price = Math.round((v.price * 1.15) / 5) * 5;
            else price = v.price || 0;
          }
          return price > 0 ? price : "";
        };

        // Build styled HTML table → convert to xlsx (preserves colors/borders)
        const bs = "border:1px solid #374151;";
        let html = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;">`;

        // Row 1: Item Name, Group, Category (rowspan=2) + variation headers
        html += `<tr>`;
        html += `<th rowspan="2" style="${bs}background:#1e293b;color:#f1f5f9;font-weight:bold;padding:8px 10px;text-align:left;min-width:200px;">Item Name</th>`;
        html += `<th rowspan="2" style="${bs}background:#1e293b;color:#f1f5f9;font-weight:bold;padding:8px 10px;text-align:center;">Group</th>`;
        html += `<th rowspan="2" style="${bs}background:#1e293b;color:#f1f5f9;font-weight:bold;padding:8px 10px;text-align:center;">Category</th>`;
        allVariations.forEach((v) => {
          html += `<th colspan="4" style="${bs}background:#1e3a5f;color:#93c5fd;font-weight:bold;padding:8px 10px;text-align:center;">${v}</th>`;
        });
        html += `</tr>`;

        // Row 2: channel sub-headers
        html += `<tr>`;
        allVariations.forEach(() => {
          CHANNELS.forEach((ch) => {
            html += `<th style="${bs}background:#0f172a;color:#94a3b8;font-weight:bold;padding:6px 8px;text-align:center;">${ch}</th>`;
          });
        });
        html += `</tr>`;

        // Data rows with alternating background
        items.forEach((item, ri) => {
          const bg = ri % 2 === 0 ? "#0f172a" : "#111827";
          html += `<tr>`;
          html += `<td style="${bs}background:${bg};color:#f1f5f9;font-weight:bold;padding:6px 10px;">${item.itemName || ""}</td>`;
          html += `<td style="${bs}background:${bg};color:#cbd5e1;padding:6px 8px;text-align:center;">${item.group || ""}</td>`;
          html += `<td style="${bs}background:${bg};color:#cbd5e1;padding:6px 8px;text-align:center;">${item.category || ""}</td>`;
          allVariations.forEach((v) => {
            CHANNELS.forEach((ch) => {
              const val = getPrice(item, v, ch);
              const color = val === "" ? "#4b5563" : "#e2e8f0";
              html += `<td style="${bs}background:${bg};color:${color};padding:6px 8px;text-align:center;">${val === "" ? "-" : val}</td>`;
            });
          });
          html += `</tr>`;
        });

        html += `</table>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const table = doc.querySelector("table")!;
        const ws = XLSX.utils.table_to_sheet(table);

        ws["!cols"] = [
          { wch: 28 }, { wch: 14 }, { wch: 20 },
          ...allVariations.flatMap(() => CHANNELS.map(() => ({ wch: 11 }))),
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Item List");
        XLSX.writeFile(wb, `item-list-${new Date().toISOString().split("T")[0]}.xlsx`);
        console.log("✅ Item list downloaded with styling");
      } catch (error: any) {
        console.error("Error downloading item list:", error);
        alert(`Failed to download: ${error.message}`);
      }
    };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      console.log("🔄 Starting optimized Excel export...");
      
      // Import XLSX dynamically
      const XLSX = await import("xlsx");

      // Process items in chunks for better memory management
      const chunkSize = 500;
      const exportData: any[] = [];
      
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        console.log(`📊 Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(items.length/chunkSize)}`);
        
        const chunkData = chunk.flatMap((item) => {
          if (!item.variations || item.variations.length === 0) {
            return [{
              "Item ID": item.itemId,
              "Item Name": item.itemName,
              "Group": item.group,
              "Category": item.category,
              "Short Code": item.shortCode || "",
              "Description": item.description || "",
              "HSN Code": item.hsnCode || "",
              "Unit Type": item.unitType,
              "Sale Type": item.saleType || "QTY",
              "Profit Margin": item.profitMargin || 0,
              "GST": item.gst || 0,
              "Item Type": item.itemType,
              "Variation Name": "",
              "Variation Value": "",
              "Base Price": "",
              "Zomato Price": "",
              "SAP Code": "",
            }];
          }

          return item.variations.map((v: any) => {
            const basePrice = v.price || 0;
            return {
              "Item ID": item.itemId,
              "Item Name": item.itemName,
              "Group": item.group,
              "Category": item.category,
              "Short Code": item.shortCode || "",
              "Description": item.description || "",
              "HSN Code": item.hsnCode || "",
              "Unit Type": item.unitType,
              "Sale Type": v.saleType || item.saleType || "QTY",
              "Profit Margin": v.profitMargin || item.profitMargin || 0,
              "GST": item.gst || 0,
              "Item Type": item.itemType,
              "Variation Name": v.name,
              "Variation Value": v.value,
              "Base Price": basePrice || "",
              "Zomato Price": basePrice ? calcZomatoPrice(basePrice) : "",
              "SAP Code": v.sapCode || "",
            };
          });
        });
        
        exportData.push(...chunkData);
      }

      console.log(`📋 Processed ${exportData.length} rows for export`);

      // Create worksheet with optimized settings
      const ws = XLSX.utils.json_to_sheet(exportData);
      const colWidths = [18, 20, 12, 15, 12, 20, 10, 14, 10, 12, 8, 10, 14, 14, 11, 13, 10];
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Items");

      XLSX.writeFile(wb, `items-export-${new Date().toISOString().split("T")[0]}.xlsx`);
      console.log("✅ Items exported to Excel successfully");
    } catch (error: any) {
      console.error("Error exporting to Excel:", error);
      alert(`Failed to export items: ${error.message || "Unknown error occurred"}`);
    } finally {
      setDownloading(false);
    }
  };

  const downloadTemplateWithDropdowns = async () => {
    try {
      // Import XLSX dynamically
      const XLSX = await import("xlsx");

      // Get all unique variations from existing items
      const allVariationNames = Array.from(
        new Set(items.flatMap((item) => item.variations?.map((v: any) => v.name) || []))
      ).sort();

      const allVariationValues = Array.from(
        new Set(items.flatMap((item) => item.variations?.map((v: any) => v.value) || []))
      ).sort((a, b) => {
        const parseNum = (s: string) => {
          const n = parseFloat(s.match(/\d+/)?.[0] || "0");
          if (s.toLowerCase().includes("kg") || s.toLowerCase().includes("l")) return n * 1000;
          return n;
        };
        return parseNum(a) - parseNum(b);
      });

      // Create template data
      const templateData = [
        {
          "Item Name": "Example Item",
          "Group": "Group A",
          "Category": "Category 1",
          "Description": "Item description",
          "HSN Code": "1234",
          "Unit Type": "Single Count",
          "Sale Type": "QTY",
          "Profit Margin": "20",
          "GST": "5",
          "Item Type": "Goods",
          "Variation Name": allVariationNames[0] || "Size",
          "Variation Value": allVariationValues[0] || "250 Gms",
          "Base Price": "100",
          "SAP Code": "SAP001",
        },
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);

      // Add data validation (dropdowns) for Variation Name (Column K)
      if (!ws["!dataValidation"]) ws["!dataValidation"] = [];

      const variationNameValidation = {
        type: "list",
        formula1: `"${allVariationNames.join(",")}"`,
        showInputMessage: true,
        prompt: "Select a variation name from the list",
        sqref: "K2:K1000",
      };

      const variationValueValidation = {
        type: "list",
        formula1: `"${allVariationValues.join(",")}"`,
        showInputMessage: true,
        prompt: "Select a variation value from the list",
        sqref: "L2:L1000",
      };

      ws["!dataValidation"].push(variationNameValidation);
      ws["!dataValidation"].push(variationValueValidation);

      // Set column widths
      const colWidths = [20, 15, 20, 25, 12, 15, 12, 15, 8, 12, 20, 15, 12, 15];
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));

      // Style header row (optional - basic styling)
      const headerStyle = {
        font: { bold: true, color: "FFFFFF" },
        fill: { fgColor: { rgb: "366092" } },
        alignment: { horizontal: "center" },
      };

      // Create workbook and add sheet
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Items");

      // Create info sheet with instructions
      const infoData = [
        ["Instructions for using this Excel template:"],
        [],
        ["1. Item Name (Required)", "Enter the name of the new item"],
        ["2. Group (Required)", "Select from existing groups"],
        ["3. Category (Required)", "Select from existing categories"],
        ["4. Variation Name (Required)", "Click dropdown to select existing variation"],
        ["5. Variation Value (Required)", "Click dropdown to select existing variation value"],
        ["6. Base Price (Required)", "Enter the base price"],
        ["7. SAP Code (Required)", "Enter SAP code for the variation"],
        [],
        ["Available Variations:"],
      ];

      // Add list of variations
      allVariationNames.forEach((name) => {
        const values = items
          .filter((item) => item.variations?.some((v: any) => v.name === name))
          .flatMap((item) => item.variations.filter((v: any) => v.name === name).map((v: any) => v.value));
        const uniqueValues = Array.from(new Set(values));
        infoData.push([`${name}:`, uniqueValues.join(", ")]);
      });

      const infoWs = XLSX.utils.aoa_to_sheet(infoData);
      infoWs["!cols"] = [{ wch: 30 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, infoWs, "Instructions");

      XLSX.writeFile(wb, "item-import-template-with-dropdowns.xlsx");
      console.log("✅ Template with dropdowns downloaded successfully");
    } catch (error: any) {
      console.error("Error downloading template:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.split("\n").slice(0, 3).join("\n"),
      });
      alert(`Failed to download template: ${error.message || "Unknown error occurred"}`);
    }
  };

  const handleDownloadSaleTypeManager = async () => {
    try {
      const XLSX = await import("xlsx");

      // Create data specifically for managing sale types
      const saleTypeData = items.flatMap((item) => {
        if (!item.variations || item.variations.length === 0) {
          // If no variations, create a single row for the item
          return [{
            "Item ID": item.itemId,
            "Item Name": item.itemName,
            "Group": item.group,
            "Category": item.category,
            "Variation Name": "",
            "Variation Value": "",
            "SAP Code": "",
            "Current Sale Type": item.saleType || "QTY",
            "New Sale Type": item.saleType || "QTY", // User can modify this
            "Notes": "No variations - item level sale type"
          }];
        }

        // Create a row for each variation
        return item.variations.map((v: any) => ({
          "Item ID": item.itemId,
          "Item Name": item.itemName,
          "Group": item.group,
          "Category": item.category,
          "Variation Name": v.name || "",
          "Variation Value": v.value || "",
          "SAP Code": v.sapCode || "",
          "Current Sale Type": v.saleType || item.saleType || "QTY",
          "New Sale Type": v.saleType || item.saleType || "QTY", // User can modify this
          "Notes": `Variation: ${v.value || 'N/A'}`
        }));
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(saleTypeData);

      // Add data validation for "New Sale Type" column (Column I)
      if (!ws["!dataValidation"]) ws["!dataValidation"] = [];

      const saleTypeValidation = {
        type: "list",
        formula1: '"QTY,KG"',
        showInputMessage: true,
        prompt: "Select QTY for quantity-based items or KG for weight-based items",
        sqref: "I2:I10000", // Column I (New Sale Type)
      };

      ws["!dataValidation"].push(saleTypeValidation);

      // Set column widths
      const colWidths = [15, 25, 15, 18, 15, 15, 12, 15, 15, 30];
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));

      // Style the header row
      const headerRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[cellAddress]) continue;
        
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "366092" } },
          alignment: { horizontal: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sale Type Manager");

      // Create instructions sheet
      const instructionsData = [
        ["Sale Type Manager - Instructions"],
        [],
        ["How to use this file:"],
        ["1. Review the 'Current Sale Type' column to see existing settings"],
        ["2. Modify the 'New Sale Type' column using the dropdown (QTY or KG)"],
        ["3. QTY = Quantity-based (pieces, counts, etc.)"],
        ["4. KG = Weight-based (will convert grams to KG automatically)"],
        ["5. Save the file and use the Import Excel feature to update"],
        [],
        ["Important Notes:"],
        ["• Do NOT modify Item ID, Item Name, or SAP Code columns"],
        ["• Only change the 'New Sale Type' column"],
        ["• KG conversion works for variations like '250 GM', '500 GM', '1 KG'"],
        ["• QTY is for items sold by piece/count"],
        [],
        ["Examples:"],
        ["• Sweets sold by weight: Use KG"],
        ["• Boxes, pieces, counts: Use QTY"],
        ["• Milk packets (500ml, 1L): Use KG for weight-based"],
      ];

      const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
      instructionsWs["!cols"] = [{ wch: 50 }];
      
      // Style the instructions header
      if (instructionsWs["A1"]) {
        instructionsWs["A1"].s = {
          font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4472C4" } },
          alignment: { horizontal: "center" },
        };
      }

      XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");

      // Write file
      XLSX.writeFile(wb, `sale-type-manager-${new Date().toISOString().split("T")[0]}.xlsx`);
      console.log("✅ Sale Type Manager file downloaded successfully");
    } catch (error: any) {
      console.error("Error downloading sale type manager:", error);
      alert(`Failed to download sale type manager: ${error.message || "Unknown error occurred"}`);
    }
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return "";

    // Define the columns to export
    const headers = [
      "Item ID",
      "Item Name",
      "Short Code",
      "Description",
      "HSN Code",
      "Group",
      "Category",
      "Profit Margin (%)",
      "GST (%)",
      "Item Type",
      "Unit Type",
      "Variations",
      "Images Count",
    ];

    const rows = data.map((item) => [
      item.itemId,
      item.itemName,
      item.shortCode,
      item.description || "",
      item.hsnCode || "",
      item.group,
      item.category,
      item.profitMargin || 0,
      item.gst || 0,
      item.itemType,
      item.unitType,
      item.variations?.map((v: any) => `${v.name}: ${v.value}`).join("; ") ||
        "",
      item.images?.length || 0,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const value = String(cell || "");
            return value.includes(",") ||
              value.includes('"') ||
              value.includes("\n")
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(","),
      ),
    ].join("\n");

    return csv;
  };

  return (
    <div className="flex-1 p-4 xs:p-5 sm:p-6 lg:p-8 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 min-h-screen transition-colors duration-300">
      {/* Header */}
      <div className="mb-8 sm:mb-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 sm:gap-6">
          {/* Title Section */}
          <div className="w-full sm:w-auto group cursor-default">
            <div className="flex items-start sm:items-center gap-4">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3.5 rounded-xl group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-blue-600/40 flex-shrink-0">
                <span className="text-white text-2xl font-bold">📦</span>
              </div>
              <div className="flex-1">
                <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                  Items
                </h1>
                <p className="text-gray-400 text-sm sm:text-base font-medium mt-2">
                  Manage your product items and variations
                </p>
                {loading && (
                  <p className="text-gray-500 text-xs sm:text-sm mt-3 inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    Loading items from MongoDB...
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col xs:flex-row gap-3 w-full sm:w-auto">
            {selectedItems.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-red-600/20 to-red-600/10 border border-red-600/50 text-red-300 hover:text-red-200 rounded-xl hover:from-red-600/30 hover:to-red-600/20 hover:border-red-500/60 font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-red-600/20 hover:shadow-xl hover:shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                <Trash2 className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
                <span className="hidden xs:inline relative z-10">Delete ({selectedItems.size})</span>
                <span className="xs:hidden relative z-10">Delete</span>
              </button>
            )}
            {items.length > 0 && !loading && (
              <button
                onClick={handleDownloadSaleTypeManager}
                className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-orange-600/20 to-orange-600/10 border border-orange-600/50 text-orange-300 hover:text-orange-200 rounded-xl hover:from-orange-600/30 hover:to-orange-600/20 hover:border-orange-500/60 font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-orange-600/20 hover:shadow-xl hover:shadow-orange-500/30 group relative overflow-hidden"
                title="Download items to manage KG/QTY sale types"
              >
                <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                <Download className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
                <span className="hidden xs:inline relative z-10">Sale Types</span>
                <span className="xs:hidden relative z-10">Types</span>
              </button>
            )}
            {items.length > 0 && !loading && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-emerald-600/20 to-emerald-600/10 border border-emerald-600/50 text-emerald-300 hover:text-emerald-200 rounded-xl hover:from-emerald-600/30 hover:to-emerald-600/20 hover:border-emerald-500/60 font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-500/30 group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                <Download className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
                <span className="hidden xs:inline relative z-10">
                  {downloading ? "Exporting..." : "Download"}
                </span>
              </button>
            )}
            {items.length > 0 && !loading && (
              <button
                onClick={handleDownloadItemList}
                className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-cyan-600/20 to-cyan-600/10 border border-cyan-600/50 text-cyan-300 hover:text-cyan-200 rounded-xl hover:from-cyan-600/30 hover:to-cyan-600/20 hover:border-cyan-500/60 font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-cyan-600/20 hover:shadow-xl hover:shadow-cyan-500/30 group relative overflow-hidden"
                title="Download item list in POS format"
              >
                <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                <Download className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
                <span className="hidden xs:inline relative z-10">Item List</span>
                <span className="xs:hidden relative z-10">Item List</span>
              </button>
            )}
            <button
              onClick={() => setShowImportDialog(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-purple-600/20 to-purple-600/10 border border-purple-600/50 text-purple-300 hover:text-purple-200 rounded-xl hover:from-purple-600/30 hover:to-purple-600/20 hover:border-purple-500/60 font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-purple-600/20 hover:shadow-xl hover:shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
              <FileUp className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
              <span className="hidden xs:inline relative z-10">Import Excel</span>
              <span className="xs:hidden relative z-10">Import</span>
            </button>
            <button
              onClick={() => setShowForm(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 xs:px-5 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all duration-300 text-xs xs:text-sm sm:text-base whitespace-nowrap shadow-lg shadow-blue-600/40 hover:shadow-xl hover:shadow-blue-500/60 hover:scale-[1.02] group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/15 translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
              <Plus className="w-4 h-4 xs:w-4.5 xs:h-4.5 relative z-10" />
              <span className="hidden xs:inline relative z-10">Add Item</span>
              <span className="xs:hidden relative z-10">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search bar - Desktop */}
      {!loading && (
        <div className="mb-6 relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search items by name, ID, group, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-800/50 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-600/10 hover:border-slate-600/80 hover:bg-slate-800/70 placeholder:text-gray-500"
          />
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/60 border border-gray-800 backdrop-blur-xl">
            <ItemForm
              onSuccess={handleAddItem}
              onClose={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {showImportDialog && (
        <ExcelImportDialog
          onClose={() => setShowImportDialog(false)}
          onSuccess={handleImportItems}
        />
      )}

      {/* Search bar - Mobile only */}
      {!loading && (
        <div className="mb-5 sm:hidden relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border border-slate-700/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-slate-800/50 text-white text-sm font-medium transition-all duration-300 shadow-lg shadow-blue-600/10 hover:border-slate-600/80 hover:bg-slate-800/70 placeholder:text-gray-500"
          />
        </div>
      )}

      {/* Items Table */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px] sm:min-h-[500px]">
          <div className="flex flex-col items-center gap-6 sm:gap-8">
            {/* Animated Spinner */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24">
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500 animate-spin"></div>
              {/* Middle ring */}
              <div className="absolute inset-3 sm:inset-4 rounded-full border-3 border-transparent border-b-blue-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
              {/* Inner dot */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-blue-500 animate-pulse"></div>
              </div>
            </div>

            {/* Loading Text */}
            <div className="text-center space-y-2">
              <h3 className="text-lg sm:text-xl font-bold text-white">
                Loading Items
              </h3>
              <p className="text-gray-400 text-sm sm:text-base font-medium">
                Fetching your data from MongoDB...
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ItemsTable
          items={filteredItems}
          onDelete={handleDeleteItem}
          onSelectedChange={setSelectedItems}
        />
      )}
    </div>
  );
}
