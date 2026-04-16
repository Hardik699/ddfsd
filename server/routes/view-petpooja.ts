import { RequestHandler } from "express";
import { getDatabase } from "../db";

// View all petpooja data
export const handleViewPetpooja: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();
    const petpoojaCollection = db.collection("petpooja");
    const documents = await petpoojaCollection.find({}).toArray();

    const summary = {
      totalDocuments: documents.length,
      documents: [] as any[],
    };

    for (const doc of documents) {
      if (!Array.isArray(doc.data)) {
        summary.documents.push({
          _id: doc._id,
          uploadedAt: (doc as any).uploadedAt,
          rowCount: 0,
          error: "Data is not an array",
        });
        continue;
      }

      const headers = doc.data[0] as string[];
      const dataRows = doc.data.slice(1);

      // Extract unique sap codes from this document
      const sapCodeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "sap_code"
      );

      const uniqueSapCodes = new Set<string>();
      if (sapCodeIdx !== -1) {
        for (const row of dataRows) {
          if (Array.isArray(row)) {
            const sCode = row[sapCodeIdx]?.toString().trim();
            if (sCode) {
              uniqueSapCodes.add(sCode);
            }
          }
        }
      }

      summary.documents.push({
        _id: doc._id,
        uploadedAt: (doc as any).uploadedAt,
        status: (doc as any).status,
        totalRows: dataRows.length,
        columns: headers.length,
        headers: headers,
        uniqueSapCodes: Array.from(uniqueSapCodes),
        sampleSapCodes: Array.from(uniqueSapCodes).slice(0, 5),
      });
    }

    res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Search for specific SAP code in petpooja
export const handleSearchSapCode: RequestHandler = async (req, res) => {
  try {
    const { sapCode } = req.query;

    if (!sapCode) {
      return res.status(400).json({ error: "sapCode query parameter required" });
    }

    const db = await getDatabase();
    const petpoojaCollection = db.collection("petpooja");
    const documents = await petpoojaCollection.find({}).toArray();

    const results = {
      searchingFor: sapCode,
      found: false,
      totalMatches: 0,
      details: [] as any[],
    };

    for (const doc of documents) {
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
      const dateIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "new date"
      );
      const orderTypeIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "order_type"
      );
      const quantityIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "item_quantity"
      );
      const priceIdx = headers.findIndex(
        (h) => h.toLowerCase().trim() === "item_price"
      );

      let matchCount = 0;
      const sampleRows = [];

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue;

        const sCode = row[sapCodeIdx]?.toString().trim();
        if (sCode === sapCode) {
          matchCount += 1;
          results.found = true;

          if (sampleRows.length < 5) {
            sampleRows.push({
              category:
                categoryIdx !== -1 ? row[categoryIdx] : "N/A",
              restaurant:
                restaurantIdx !== -1 ? row[restaurantIdx] : "N/A",
              date: dateIdx !== -1 ? row[dateIdx] : "N/A",
              orderType: orderTypeIdx !== -1 ? row[orderTypeIdx] : "N/A",
              quantity:
                quantityIdx !== -1
                  ? parseFloat(row[quantityIdx]?.toString() || "0")
                  : 0,
              price:
                priceIdx !== -1
                  ? parseFloat(row[priceIdx]?.toString() || "0")
                  : 0,
            });
          }
        }
      }

      if (matchCount > 0) {
        results.totalMatches += matchCount;
        results.details.push({
          documentId: doc._id,
          uploadedAt: (doc as any).uploadedAt,
          matchCount,
          sampleRows,
        });
      }
    }

    res.json({
      success: results.found,
      ...results,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
