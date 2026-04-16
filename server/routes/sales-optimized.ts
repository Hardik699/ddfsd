import { RequestHandler } from "express";
import { getDatabase } from "../db";
  
  return cachedDb;
}

async function ensureIndexes(db: Db) {
  const petpooja = db.collection("petpooja");
  
  try {
    // Create compound index on commonly queried fields
    await petpooja.createIndex({ "data.sap_code": 1, "data.New Date": 1 });
    await petpooja.createIndex({ "data.restaurant_name": 1 });
    console.log("✅ Indexes created/verified");
  } catch (error) {
    console.warn("⚠️ Index creation skipped:", error);
  }
}

// Optimized item sales endpoint
export const handleGetItemSalesOptimized: RequestHandler = async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { itemId } = req.params;
    const { startDate, endDate, restaurant } = req.query;

    const db = await getDatabase();
    const itemsCollection = db.collection("items");
    
    // Get item with SAP codes
    const item = await itemsCollection.findOne(
      { itemId },
      { projection: { variations: 1, itemName: 1 } }
    );

    if (!item || !item.variations?.length) {
      return res.json({
        success: true,
        data: {
          itemId,
          zomatoData: { quantity: 0, value: 0, variations: [] },
          swiggyData: { quantity: 0, value: 0, variations: [] },
          diningData: { quantity: 0, value: 0, variations: [] },
          parcelData: { quantity: 0, value: 0, variations: [] },
          monthlyData: [],
          dateWiseData: [],
          restaurantSales: {},
        },
      });
    }

    // Build SAP code map
    const sapCodeMap: Record<string, { name: string; saleType: string }> = {};
    item.variations.forEach((v: any) => {
      if (v.sapCode) {
        sapCodeMap[v.sapCode] = {
          name: v.value || v.name || "Unknown",
          saleType: v.saleType || "QTY",
        };
      }
    });

    const sapCodes = Object.keys(sapCodeMap);
    if (!sapCodes.length) {
      return res.json({
        success: true,
        data: {
          itemId,
          zomatoData: { quantity: 0, value: 0, variations: [] },
          swiggyData: { quantity: 0, value: 0, variations: [] },
          diningData: { quantity: 0, value: 0, variations: [] },
          parcelData: { quantity: 0, value: 0, variations: [] },
          monthlyData: [],
          dateWiseData: [],
          restaurantSales: {},
        },
      });
    }

    console.log(`⚡ Fast query for ${itemId} with ${sapCodes.length} SAP codes`);

    // Use aggregation pipeline for speed
    const petpoojaCollection = db.collection("petpooja");
    
    const pipeline: any[] = [
      { $project: { data: 1 } },
      { $limit: 100000 }, // Safety limit
    ];

    const docs = await petpoojaCollection.aggregate(pipeline).toArray();
    
    // Process in memory (faster than cursor)
    const result = processDocsOptimized(docs, sapCodeMap, sapCodes, startDate as string, endDate as string, restaurant as string);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Query completed in ${elapsed}s`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "Failed to fetch sales data" });
  }
};

function processDocsOptimized(
  docs: any[],
  sapCodeMap: Record<string, { name: string; saleType: string }>,
  sapCodes: string[],
  startDate?: string,
  endDate?: string,
  restaurant?: string
) {
  const salesByArea: any = {
    zomato: {},
    swiggy: {},
    dining: {},
    parcel: {},
  };

  const monthlyByArea: any = {};
  const dailyByArea: any = {};
  const restaurantSales: any = {};

  for (const doc of docs) {
    if (!Array.isArray(doc.data) || doc.data.length < 2) continue;

    const headers = doc.data[0] as string[];
    const rows = doc.data.slice(1);

    const sapIdx = headers.findIndex(h => h.toLowerCase().includes("sap"));
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes("date") && !h.toLowerCase().includes("time"));
    const areaIdx = headers.findIndex(h => h.toLowerCase() === "area");
    const orderTypeIdx = headers.findIndex(h => h.toLowerCase().includes("order"));
    const qtyIdx = headers.findIndex(h => h.toLowerCase().includes("quantity"));
    const priceIdx = headers.findIndex(h => h.toLowerCase().includes("price"));
    const restIdx = headers.findIndex(h => h.toLowerCase().includes("restaurant"));

    if (sapIdx === -1 || qtyIdx === -1) continue;

    for (const row of rows) {
      const sapCode = row[sapIdx]?.toString().trim();
      if (!sapCode || !sapCodeMap[sapCode]) continue;

      const qty = parseFloat(row[qtyIdx]) || 0;
      const price = parseFloat(row[priceIdx]) || 0;
      const area = (row[areaIdx]?.toString() || "").toLowerCase();
      const orderType = (row[orderTypeIdx]?.toString() || "").toLowerCase();
      const dateStr = row[dateIdx]?.toString() || "";
      const restName = row[restIdx]?.toString() || "Unknown";

      // Map to channel
      let channel = "dining";
      if (area.includes("swiggy")) channel = "swiggy";
      else if (area.includes("zomato")) channel = "zomato";
      else if (orderType.includes("parcel") || area.includes("parcel")) channel = "parcel";

      const varName = sapCodeMap[sapCode].name;

      // Aggregate
      if (!salesByArea[channel][varName]) {
        salesByArea[channel][varName] = { quantity: 0, value: 0 };
      }
      salesByArea[channel][varName].quantity += qty;
      salesByArea[channel][varName].value += price * qty;

      // Monthly
      const month = dateStr.substring(3, 10); // Extract month
      if (!monthlyByArea[month]) monthlyByArea[month] = { zomato: 0, swiggy: 0, dining: 0, parcel: 0 };
      monthlyByArea[month][channel] += qty;

      // Daily
      if (!dailyByArea[dateStr]) dailyByArea[dateStr] = { zomato: 0, swiggy: 0, dining: 0, parcel: 0 };
      dailyByArea[dateStr][channel] += qty;

      // Restaurant
      restaurantSales[restName] = (restaurantSales[restName] || 0) + qty;
    }
  }

  // Format output
  const formatChannel = (data: any) => {
    const variations = Object.entries(data).map(([name, vals]: any) => ({
      name,
      quantity: vals.quantity,
      value: vals.value,
    }));
    const total = variations.reduce((sum, v) => sum + v.quantity, 0);
    const totalValue = variations.reduce((sum, v) => sum + v.value, 0);
    return { quantity: total, value: totalValue, variations };
  };

  return {
    zomatoData: formatChannel(salesByArea.zomato),
    swiggyData: formatChannel(salesByArea.swiggy),
    diningData: formatChannel(salesByArea.dining),
    parcelData: formatChannel(salesByArea.parcel),
    monthlyData: Object.entries(monthlyByArea).map(([month, data]: any) => ({
      month,
      zomatoQty: data.zomato,
      swiggyQty: data.swiggy,
      diningQty: data.dining,
      parcelQty: data.parcel,
      totalQty: data.zomato + data.swiggy + data.dining + data.parcel,
    })),
    dateWiseData: Object.entries(dailyByArea).map(([date, data]: any) => ({
      date,
      zomatoQty: data.zomato,
      swiggyQty: data.swiggy,
      diningQty: data.dining,
      parcelQty: data.parcel,
      totalQty: data.zomato + data.swiggy + data.dining + data.parcel,
    })),
    restaurantSales,
  };
}
