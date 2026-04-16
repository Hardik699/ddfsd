import { RequestHandler } from "express";
import { getDatabase } from "../db";

// Debug endpoint to check item-sales matching
export const handleDebugItemSales: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.query;

    if (!itemId) {
      return res.status(400).json({ error: "itemId query parameter required" });
    }

    const db = await getDatabase();

    // Get the item
    const itemsCollection = db.collection("items");
    const item = await itemsCollection.findOne({ itemId });

    if (!item) {
      return res.json({
        success: false,
        error: `Item ${itemId} not found`,
      });
    }

    console.log(`🔍 Debugging item ${itemId}:`, {
      itemId: (item as any).itemId,
      itemName: (item as any).itemName,
      shortCode: (item as any).shortCode,
    });

    // Get all sap_codes from petpooja data
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    const allSapCodes = new Set<string>();
    const matchingRows = [];

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code",
      );

      if (sapCodeIdx === -1) continue;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const sapCode = row[sapCodeIdx]?.toString().trim() || "";
        if (sapCode) {
          allSapCodes.add(sapCode);

          // Check if this sap_code matches the item's shortCode
          if (sapCode === ((item as any).shortCode || itemId)) {
            matchingRows.push(sapCode);
          }
        }
      }
    }

    res.json({
      success: true,
      item: {
        itemId: (item as any).itemId,
        itemName: (item as any).itemName,
        shortCode: (item as any).shortCode || "NOT SET",
      },
      matching: {
        usedAsFilter: (item as any).shortCode || itemId,
        totalRowsMatching: matchingRows.length,
      },
      database: {
        totalUniqueSapCodes: allSapCodes.size,
        allSapCodes: Array.from(allSapCodes).slice(0, 20), // Show first 20
        totalSapCodesInDb: Array.from(allSapCodes).length,
      },
      recommendation:
        matchingRows.length === 0
          ? `No matching sap_codes found. Your item's shortCode is "${
              (item as any).shortCode || "NOT SET"
            }". Available sap_codes in database: ${Array.from(allSapCodes).join(", ")}`
          : `Found ${matchingRows.length} matching rows in sales data`,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update item shortCode endpoint
export const handleUpdateItemShortCode: RequestHandler = async (req, res) => {
  try {
    const { itemId, shortCode } = req.body;

    if (!itemId || !shortCode) {
      return res.status(400).json({
        error: "itemId and shortCode are required",
      });
    }

    const db = await getDatabase();
    const itemsCollection = db.collection("items");

    const result = await itemsCollection.updateOne(
      { itemId },
      { $set: { shortCode, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: `Item ${itemId} not found` });
    }

    console.log(`✅ Updated item ${itemId} shortCode to ${shortCode}`);

    res.json({
      success: true,
      message: `Item ${itemId} shortCode updated to ${shortCode}`,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Debug endpoint to inspect salesHistory structure for an item
export const handleDebugSalesHistory: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.query;

    if (!itemId) {
      return res.status(400).json({ error: "itemId query parameter required" });
    }

    const db = await getDatabase();
    const itemsCollection = db.collection("items");
    const item = await itemsCollection.findOne({ itemId });

    if (!item) {
      return res.json({
        success: false,
        error: `Item ${itemId} not found`,
      });
    }

    // Analyze all variations and their salesHistory
    const variationSummary: any[] = [];
    const areaDistribution: { [key: string]: number } = {};

    if ((item as any).variations && Array.isArray((item as any).variations)) {
      (item as any).variations.forEach((variation: any, idx: number) => {
        const salesHistory = variation.salesHistory || [];
        const variationName = variation.name || `Variation ${idx + 1}`;

        // Collect area distribution for this variation
        const areas: { [key: string]: number } = {};
        salesHistory.forEach((record: any) => {
          const area = record.area || "NO_AREA_FIELD";
          areas[area] = (areas[area] || 0) + 1;
          areaDistribution[area] = (areaDistribution[area] || 0) + 1;
        });

        // Show sample records
        const sampleRecords = salesHistory.slice(0, 2).map((r: any) => ({
          date: r.date,
          area: r.area || "MISSING",
          restaurant: r.restaurant,
          quantity: r.quantity,
          value: r.value,
        }));

        variationSummary.push({
          index: idx,
          name: variationName,
          totalRecords: salesHistory.length,
          areaBreakdown: areas,
          sampleRecords,
        });
      });
    }

    res.json({
      success: true,
      itemId,
      itemName: (item as any).itemName,
      variationCount: ((item as any).variations || []).length,
      totalSalesRecords: ((item as any).variations || []).reduce(
        (sum: number, v: any) => sum + (v.salesHistory?.length || 0),
        0,
      ),
      areaDistribution,
      variationSummary,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
