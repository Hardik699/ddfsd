import { RequestHandler } from "express";
import { getDatabase } from "../db";

// Simple check - show all data summary
export const handleCheckAllData: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();

    // Check petpooja
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaCount = await petpoojaCollection.countDocuments();
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    let totalRows = 0;
    const allSapCodes = new Set<string>();
    const allDates = new Set<string>();

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);
      totalRows += dataRows.length;

      const sapCodeIdx = headers.findIndex(h => h.toLowerCase().trim() === "sap_code");
      const dateIdx = headers.findIndex(h => h.toLowerCase().trim() === "new date");

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;
        if (sapCodeIdx !== -1) {
          const sapCode = row[sapCodeIdx]?.toString().trim();
          if (sapCode) allSapCodes.add(sapCode);
        }
        if (dateIdx !== -1) {
          const date = row[dateIdx]?.toString().trim();
          if (date) allDates.add(date);
        }
      }
    }

    res.json({
      success: true,
      database: {
        petpooja: {
          documentsUploaded: petpoojaCount,
          totalRows,
          uniqueSapCodes: Array.from(allSapCodes),
          sapCodeCount: allSapCodes.size,
          dateRange: {
            earliest: Array.from(allDates).sort()[0],
            latest: Array.from(allDates).sort().reverse()[0],
            totalDates: allDates.size,
          },
        },
      },
      message: petpoojaCount === 0 
        ? "❌ NO PETPOOJA DATA UPLOADED! Please upload CSV/Excel file first." 
        : `✅ Data found! ${totalRows} rows with ${allSapCodes.size} unique SAP codes`,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Show sample rows for a SAP code
export const handleShowSampleRows: RequestHandler = async (req, res) => {
  try {
    const { sapCode } = req.query;

    if (!sapCode) {
      return res.status(400).json({ error: "sapCode required" });
    }

    const db = await getDatabase();
    const petpoojaCollection = db.collection("petpooja");
    const petpoojaData = await petpoojaCollection.find({}).toArray();

    const sampleRows = [];

    for (const doc of petpoojaData) {
      if (!Array.isArray(doc.data)) continue;

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      // Find all column indices
      const indices: { [key: string]: number } = {};
      const columnNames = [
        "sap_code",
        "category_name",
        "item_quantity",
        "item_price",
        "order_type",
        "area",
        "restaurant_name",
        "new date",
      ];

      for (const col of columnNames) {
        indices[col] = headers.findIndex(h => h.toLowerCase().trim() === col.toLowerCase().trim());
      }

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;

        const rowSapCode = row[indices["sap_code"]]?.toString().trim();
        if (rowSapCode === sapCode) {
          sampleRows.push({
            sapCode: rowSapCode,
            category: row[indices["category_name"]]?.toString().trim(),
            quantity: parseFloat(row[indices["item_quantity"]]?.toString() || "0"),
            price: parseFloat(row[indices["item_price"]]?.toString() || "0"),
            orderType: row[indices["order_type"]]?.toString().trim(),
            area: row[indices["area"]]?.toString().trim(),
            restaurant: row[indices["restaurant_name"]]?.toString().trim(),
            date: row[indices["new date"]]?.toString().trim(),
          });

          if (sampleRows.length >= 10) break;
        }
      }

      if (sampleRows.length >= 10) break;
    }

    res.json({
      success: sampleRows.length > 0,
      searchingFor: sapCode,
      found: sampleRows.length > 0,
      totalSampleRows: sampleRows.length,
      data: sampleRows,
      message: sampleRows.length === 0 
        ? `❌ SAP Code "${sapCode}" NOT FOUND in database!` 
        : `✅ Found ${sampleRows.length} records for SAP Code "${sapCode}"`,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
