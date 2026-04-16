import { RequestHandler } from "express";
import { getDatabase } from "../db";

// Comprehensive debug endpoint
export const handleSapDebugInfo: RequestHandler = async (req, res) => {
  try {
    const { itemId, sapCode } = req.query;

    const db = await getDatabase();

    // 1. Get the item
    const itemsCollection = db.collection("items");
    let item = null;
    
    if (itemId) {
      item = await itemsCollection.findOne({ itemId });
    } else if (sapCode) {
      item = await itemsCollection.findOne({ shortCode: sapCode });
    }

    // 2. Get all petpooja data
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    // Extract all unique sap codes
    const allSapCodes = new Set<string>();
    const sapCodeDetails = new Map<
      string,
      {
        count: number;
        categories: Set<string>;
        restaurants: Set<string>;
        orderTypes: Set<string>;
        sampleRows: Array<any>;
      }
    >();

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code"
      );
      const categoryIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "category_name"
      );
      const restaurantIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "restaurant_name"
      );
      const orderTypeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "order_type"
      );
      const dateIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "new date"
      );

      if (sapCodeIdx === -1) continue;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const sCode = row[sapCodeIdx]?.toString().trim() || "";
        if (!sCode) continue;

        allSapCodes.add(sCode);

        if (!sapCodeDetails.has(sCode)) {
          sapCodeDetails.set(sCode, {
            count: 0,
            categories: new Set(),
            restaurants: new Set(),
            orderTypes: new Set(),
            sampleRows: [],
          });
        }

        const details = sapCodeDetails.get(sCode)!;
        details.count += 1;

        if (categoryIdx !== -1) {
          details.categories.add(row[categoryIdx]?.toString().trim() || "");
        }
        if (restaurantIdx !== -1) {
          details.restaurants.add(
            row[restaurantIdx]?.toString().trim() || ""
          );
        }
        if (orderTypeIdx !== -1) {
          details.orderTypes.add(row[orderTypeIdx]?.toString().trim() || "");
        }

        // Store sample row
        if (details.sampleRows.length < 3) {
          details.sampleRows.push({
            date: dateIdx !== -1 ? row[dateIdx] : "N/A",
            category: categoryIdx !== -1 ? row[categoryIdx] : "N/A",
            restaurant: restaurantIdx !== -1 ? row[restaurantIdx] : "N/A",
            orderType: orderTypeIdx !== -1 ? row[orderTypeIdx] : "N/A",
          });
        }
      }
    }

    // Convert Sets to Arrays
    const sapCodesArray = Array.from(sapCodeDetails.entries()).map(
      ([code, details]) => ({
        sapCode: code,
        rowCount: details.count,
        categories: Array.from(details.categories),
        restaurants: Array.from(details.restaurants),
        orderTypes: Array.from(details.orderTypes),
        sampleRows: details.sampleRows,
      })
    );

    // 3. Check if there's a match
    const itemSapCode = item ? (item as any).shortCode : null;
    const hasMatch = itemSapCode
      ? sapCodesArray.find((s) => s.sapCode === itemSapCode)
      : null;

    res.json({
      success: true,
      item: item
        ? {
            itemId: (item as any).itemId,
            itemName: (item as any).itemName,
            shortCode: (item as any).shortCode || "NOT SET",
            group: (item as any).group,
            category: (item as any).category,
          }
        : null,
      matching: {
        itemSapCode,
        hasMatchInData: !!hasMatch,
        matchDetails: hasMatch,
      },
      database: {
        totalUniqueSapCodes: allSapCodes.size,
        sapCodes: sapCodesArray.sort((a, b) => b.rowCount - a.rowCount),
      },
      debug: {
        petpoojaDocuments: petpoojaData.length,
        totalRowsProcessed: sapCodesArray.reduce((s, c) => s + c.rowCount, 0),
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get sales data for debugging
export const handleDebugSalesForItem: RequestHandler = async (req, res) => {
  try {
    const { itemId, startDate, endDate } = req.query;

    if (!itemId) {
      return res.status(400).json({ error: "itemId required" });
    }

    const db = await getDatabase();

    // Get item
    const itemsCollection = db.collection("items");
    const item = await itemsCollection.findOne({ itemId });

    if (!item) {
      return res.json({
        success: false,
        error: `Item ${itemId} not found`,
      });
    }

    const itemSapCode = (item as any).shortCode || itemId;

    // Get petpooja data
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    // Debug the filtering process
    const debugInfo = {
      item: {
        itemId: (item as any).itemId,
        itemName: (item as any).itemName,
        shortCode: (item as any).shortCode,
      },
      searchingFor: itemSapCode,
      dateRange: { startDate, endDate },
      petpoojaDocuments: petpoojaData.length,
      analysis: [] as any[],
    };

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code"
      );

      if (sapCodeIdx === -1) continue;

      let matchingRows = 0;
      let totalRows = 0;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        totalRows += 1;

        const sCode = row[sapCodeIdx]?.toString().trim() || "";
        if (sCode === itemSapCode) {
          matchingRows += 1;
        }
      }

      if (totalRows > 0) {
        debugInfo.analysis.push({
          documentIndex: debugInfo.analysis.length,
          totalRows,
          matchingRows,
          matchPercentage: ((matchingRows / totalRows) * 100).toFixed(2) + "%",
        });
      }
    }

    res.json({
      success: true,
      ...debugInfo,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
