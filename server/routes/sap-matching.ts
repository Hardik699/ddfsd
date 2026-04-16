import { RequestHandler } from "express";
import { getDatabase } from "../db";

// Get all SAP codes from uploaded data
export const handleGetAllSapCodes: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    const sapCodeMap = new Map<string, { count: number; categories: string[] }>();

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

      if (sapCodeIdx === -1) continue;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const sapCode = row[sapCodeIdx]?.toString().trim() || "";
        const category = row[categoryIdx]?.toString().trim() || "Unknown";

        if (sapCode) {
          if (!sapCodeMap.has(sapCode)) {
            sapCodeMap.set(sapCode, { count: 0, categories: [] });
          }
          const entry = sapCodeMap.get(sapCode)!;
          entry.count += 1;
          if (!entry.categories.includes(category)) {
            entry.categories.push(category);
          }
        }
      }
    }

    // Convert to array and sort by count
    const sapCodes = Array.from(sapCodeMap.entries())
      .map(([code, data]) => ({
        sapCode: code,
        rowCount: data.count,
        categories: data.categories,
      }))
      .sort((a, b) => b.rowCount - a.rowCount);

    res.json({
      success: true,
      totalUniqueSapCodes: sapCodes.length,
      sapCodes,
      message: "All SAP codes from uploaded petpooja data with their counts",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all items with their current SAP codes
export const handleGetItemsWithSapCodes: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();
    const itemsCollection = db.collection("items");
    const items = await itemsCollection.find({}).toArray();

    const itemsData = items.map((item: any) => ({
      itemId: item.itemId,
      itemName: item.itemName,
      shortCode: item.shortCode || "NOT SET",
      group: item.group,
      category: item.category,
      variations: item.variations?.map((v: any) => ({
        value: v.value,
        sapCode: v.sapCode || "NOT SET",
      })) || [],
    }));

    res.json({
      success: true,
      totalItems: itemsData.length,
      items: itemsData,
      message: "All items with their current SAP codes",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update item's shortCode to match SAP code from sales data
export const handleSetItemSapCode: RequestHandler = async (req, res) => {
  try {
    const { itemId, sapCode } = req.body;

    if (!itemId || !sapCode) {
      return res.status(400).json({
        error: "itemId and sapCode are required",
      });
    }

    const db = await getDatabase();
    const itemsCollection = db.collection("items");

    const result = await itemsCollection.updateOne(
      { itemId },
      { $set: { shortCode: sapCode, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: `Item ${itemId} not found`,
      });
    }

    console.log(`✅ Updated item ${itemId} SAP code to ${sapCode}`);

    res.json({
      success: true,
      message: `Item ${itemId} SAP code updated to ${sapCode}`,
      itemId,
      sapCode,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Batch update items SAP codes
export const handleBatchSetSapCodes: RequestHandler = async (req, res) => {
  try {
    const { mappings } = req.body; // Array of { itemId, sapCode }

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({
        error: "mappings array is required with itemId and sapCode pairs",
      });
    }

    const db = await getDatabase();
    const itemsCollection = db.collection("items");

    const results = [];

    for (const { itemId, sapCode } of mappings) {
      const result = await itemsCollection.updateOne(
        { itemId },
        { $set: { shortCode: sapCode, updatedAt: new Date() } }
      );

      results.push({
        itemId,
        sapCode,
        updated: result.matchedCount > 0,
      });

      if (result.matchedCount > 0) {
        console.log(`✅ Updated ${itemId} -> ${sapCode}`);
      }
    }

    const successful = results.filter((r) => r.updated).length;

    res.json({
      success: true,
      message: `Updated ${successful} out of ${mappings.length} items`,
      results,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Compare items vs SAP codes in uploaded data
export const handleMatchSapCodes: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();

    // Get SAP codes from petpooja
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    const sapCodesFromUpload = new Set<string>();

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code"
      );

      if (sapCodeIdx === -1) continue;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const sapCode = row[sapCodeIdx]?.toString().trim() || "";
        if (sapCode) {
          sapCodesFromUpload.add(sapCode);
        }
      }
    }

    // Get items
    const itemsCollection = db.collection("items");
    const items = await itemsCollection.find({}).toArray();

    const matchedItems = [];
    const unmatchedItems = [];

    for (const item of items) {
      const itemSapCode = (item as any).shortCode || (item as any).itemId;

      if (sapCodesFromUpload.has(itemSapCode)) {
        matchedItems.push({
          itemId: (item as any).itemId,
          itemName: (item as any).itemName,
          sapCode: itemSapCode,
          hasData: true,
        });
      } else {
        unmatchedItems.push({
          itemId: (item as any).itemId,
          itemName: (item as any).itemName,
          currentSapCode: itemSapCode,
          suggestedSapCodes: Array.from(sapCodesFromUpload).slice(0, 5), // Show first 5
        });
      }
    }

    res.json({
      success: true,
      summary: {
        totalItems: items.length,
        matchedItems: matchedItems.length,
        unmatchedItems: unmatchedItems.length,
        totalSapCodesInUpload: sapCodesFromUpload.size,
      },
      matchedItems,
      unmatchedItems,
      allAvailableSapCodes: Array.from(sapCodesFromUpload),
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Auto-match variations to SAP codes based on CSV data
export const handleAutoMatchVariationSapCodes: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    const db = await getDatabase();
    const itemsCollection = db.collection("items");
    const petpoojaCollection = db.collection("petpooja");

    // Get the item
    const item = await itemsCollection.findOne({ itemId });
    if (!item) {
      return res.status(404).json({ error: `Item ${itemId} not found` });
    }

    if (!item.variations || !Array.isArray(item.variations)) {
      return res.status(400).json({ error: "Item has no variations" });
    }

    // Build a map of SAP codes with their metadata from petpooja data
    const sapCodeMap = new Map<
      string,
      { itemName: string; categoryName: string; count: number }
    >();

    const petpoojaData = await petpoojaCollection.find({}).toArray();

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data) || doc.data.length < 2) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code"
      );
      const itemNameIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "item_name"
      );
      const categoryIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "category_name"
      );

      if (sapCodeIdx === -1) continue;

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        const sapCode = row[sapCodeIdx]?.toString().trim() || "";
        const itemName = itemNameIdx !== -1 ? row[itemNameIdx]?.toString().trim() || "" : "";
        const categoryName = categoryIdx !== -1 ? row[categoryIdx]?.toString().trim() || "" : "";

        if (sapCode) {
          if (!sapCodeMap.has(sapCode)) {
            sapCodeMap.set(sapCode, { itemName, categoryName, count: 0 });
          }
          const entry = sapCodeMap.get(sapCode)!;
          entry.count += 1;
        }
      }
    }

    console.log(
      `📊 Found ${sapCodeMap.size} unique SAP codes from petpooja data`
    );

    // Match variations to SAP codes based on similar names
    const updates: Array<{ variationIndex: number; oldSapCode?: string; newSapCode: string }> = [];

    for (let varIdx = 0; varIdx < item.variations.length; varIdx++) {
      const variation = item.variations[varIdx];
      const variationName = variation.value || variation.name || "";

      if (!variationName) continue;

      // Find best matching SAP code
      let bestMatch: { sapCode: string; score: number } | null = null;

      for (const [sapCode, metadata] of sapCodeMap) {
        // Check if SAP code metadata matches the variation name
        const combinedName = (
          metadata.itemName +
          " " +
          metadata.categoryName
        ).toLowerCase();
        const varNameLower = variationName.toLowerCase();

        // Calculate similarity score
        let score = 0;

        // Exact word matching
        if (combinedName.includes(varNameLower)) {
          score += 100;
        } else if (varNameLower.split(" ").every((word) => combinedName.includes(word))) {
          score += 50;
        }

        // Check for size indicators
        if (
          (varNameLower.includes("250") && combinedName.includes("250")) ||
          (varNameLower.includes("500") && combinedName.includes("500")) ||
          (varNameLower.includes("100") && combinedName.includes("100")) ||
          (varNameLower.includes("1kg") && combinedName.includes("1kg")) ||
          (varNameLower.includes("1 kg") && combinedName.includes("1 kg"))
        ) {
          score += 100;
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { sapCode, score };
        }
      }

      if (bestMatch) {
        updates.push({
          variationIndex: varIdx,
          oldSapCode: variation.sapCode,
          newSapCode: bestMatch.sapCode,
        });
      }
    }

    // Apply updates to the item
    const updatedVariations = item.variations.map((variation: any, idx: number) => {
      const update = updates.find((u) => u.variationIndex === idx);
      if (update) {
        return { ...variation, sapCode: update.newSapCode };
      }
      return variation;
    });

    // Save the updated item
    await itemsCollection.updateOne(
      { itemId },
      {
        $set: {
          variations: updatedVariations,
          updatedAt: new Date(),
        },
      }
    );

    console.log(`✅ Updated ${updates.length} variations with SAP codes for item ${itemId}`);

    res.json({
      success: true,
      itemId,
      itemName: item.itemName,
      variationsUpdated: updates.length,
      updates,
      totalVariations: item.variations.length,
      message: `Successfully matched ${updates.length} variations to SAP codes`,
    });
  } catch (error) {
    console.error("Error in handleAutoMatchVariationSapCodes:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
