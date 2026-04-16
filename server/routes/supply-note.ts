import { RequestHandler } from "express";
import { getDatabase } from "../db";
import { validateFileFormat } from "../../shared/formats";

// Helper: parse date strings like "06/05/2025" (DD/MM/YYYY) or "2025-05-06"
// Always returns UTC midnight to avoid timezone shift issues
function parseSupplyDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    // Use Date.UTC to avoid local timezone shifting the date
    return new Date(Date.UTC(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1])));
  }

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Date.UTC(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3])));
  }

  // Excel serial number
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0 && num < 100000 && !s.includes("/") && !s.includes("-")) {
    const msPerDay = 24 * 60 * 60 * 1000;
    // Excel epoch: Jan 1 1900 = serial 1, with leap year bug (serial 60 = Feb 29 1900 doesn't exist)
    const adjusted = num > 60 ? num - 1 : num;
    // Use UTC: Jan 1 1900 in UTC
    return new Date(Date.UTC(1900, 0, 1) + (adjusted - 1) * msPerDay);
  }

  // Try ISO parse — if it has no time component, force UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + "T00:00:00.000Z");
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// POST /api/supply-note/upload
export const handleSupplyNoteUpload: RequestHandler = async (req, res) => {
  try {
    const { data, rows, columns, year, month } = req.body;

    if (!Array.isArray(data) || data.length < 2) {
      return res.status(400).json({ error: "Missing or invalid data" });
    }
    if (!year || !month) {
      return res.status(400).json({ error: "Year and month are required" });
    }

    const headers = data[0] as string[];

    // Validate required columns
    const validation = validateFileFormat(headers, "supply_note");
    if (!validation.valid) {
      return res.status(400).json({
        error: `Invalid file format. Missing columns: ${validation.missing.join(", ")}`,
        missingColumns: validation.missing,
      });
    }

    // Map column indices (case-insensitive)
    const getIdx = (name: string) =>
      headers.findIndex((h) => h?.trim().toLowerCase() === name.toLowerCase());

    const skuIdx    = getIdx("Sku Code");
    const indentIdx = getIdx("Indent No.");
    const locIdx    = getIdx("Delivery Location");
    const dateIdx   = getIdx("Invoice Date");
    const qtyIdx    = getIdx("Received Qty");

    const dataRows = data.slice(1);
    const db = await getDatabase();
    const collection = db.collection("supply_notes");

    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;

    for (const row of dataRows) {
      if (!Array.isArray(row)) { skipped++; continue; }

      const skuCode          = String(row[skuIdx]    ?? "").trim();
      const indentNo         = String(row[indentIdx] ?? "").trim();
      const deliveryLocation = String(row[locIdx]    ?? "").trim();
      const invoiceDateRaw   = String(row[dateIdx]   ?? "").trim();
      const receivedQty      = Number(row[qtyIdx])   || 0;

      if (!skuCode || !indentNo) { skipped++; continue; }

      const invoiceDate = parseSupplyDate(invoiceDateRaw);

      // Upsert by year + month + skuCode + indentNo
      const result = await collection.updateOne(
        { year: Number(year), month: Number(month), skuCode, indentNo },
        {
          $set: {
            year: Number(year),
            month: Number(month),
            skuCode,
            indentNo,
            deliveryLocation,
            invoiceDateRaw,
            invoiceDate: invoiceDate ?? undefined,
            receivedQty,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    console.log(`✅ Supply note upload [${month}/${year}]: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);

    res.json({
      success: true,
      message: `Supply note saved: ${inserted} new, ${updated} updated, ${skipped} skipped`,
      inserted,
      updated,
      skipped,
    });
  } catch (error) {
    console.error("❌ Supply note upload error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
};

// GET /api/supply-note/status?year=2025
// Returns month upload status (same shape as /api/uploads)
export const handleSupplyNoteStatus: RequestHandler = async (req, res) => {
  try {
    const { year } = req.query;
    const filterYear = year ? parseInt(String(year)) : new Date().getFullYear();

    const db = await getDatabase();
    const collection = db.collection("supply_notes");

    // Get distinct months that have data for this year
    const uploadedMonths = await collection.distinct("month", { year: filterYear });
    const uploadedSet = new Set(uploadedMonths);

    const monthsStatus = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: uploadedSet.has(i + 1) ? "uploaded" : "pending",
    }));

    res.json({ data: monthsStatus });
  } catch (error) {
    console.error("❌ Supply note status error:", error);
    // Return default on error
    res.json({
      data: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, status: "pending" })),
    });
  }
};

// DELETE /api/supply-note/delete
export const handleSupplyNoteDelete: RequestHandler = async (req, res) => {
  try {
    const { year, month, password } = req.body;

    if (!year || !month || !password) {
      return res.status(400).json({ error: "year, month and password are required" });
    }

    const DELETION_PASSWORD = process.env.DELETION_PASSWORD || "admin123";
    if (password !== DELETION_PASSWORD) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const db = await getDatabase();
    const result = await db.collection("supply_notes").deleteMany({
      year: Number(year),
      month: Number(month),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "No data found for this month" });
    }

    res.json({ success: true, message: `Deleted ${result.deletedCount} supply note records for ${month}/${year}` });
  } catch (error) {
    console.error("❌ Supply note delete error:", error);
    res.status(500).json({ error: "Failed to delete supply note data" });
  }
};

// GET /api/supply-note/list
export const handleSupplyNoteList: RequestHandler = async (req, res) => {
  try {
    const { skuCode, location, from, to, page = "1", limit = "50" } = req.query;

    const db = await getDatabase();
    const collection = db.collection("supply_notes");

    const filter: any = {};
    if (skuCode) filter.skuCode = { $regex: String(skuCode), $options: "i" };
    if (location) filter.deliveryLocation = { $regex: String(location), $options: "i" };
    if (from || to) {
      filter.invoiceDate = {};
      if (from) filter.invoiceDate.$gte = new Date(String(from));
      if (to)   filter.invoiceDate.$lte = new Date(String(to));
    }

    const pageNum  = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(200, Math.max(1, parseInt(String(limit))));
    const skip     = (pageNum - 1) * limitNum;

    const [docs, total] = await Promise.all([
      collection.find(filter).sort({ invoiceDate: -1 }).skip(skip).limit(limitNum).toArray(),
      collection.countDocuments(filter),
    ]);

    res.json({ success: true, data: docs, total, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error("❌ Supply note list error:", error);
    res.status(500).json({ error: "Failed to fetch supply notes" });
  }
};

// POST /api/supply-note/qty-by-items
// Given a list of { itemId, supplyNoteSku } and a date range,
// returns supply note received qty grouped by itemId + date
export const handleSupplyNoteQtyByItems: RequestHandler = async (req, res) => {
  try {
    const { items, startDate, endDate } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array required" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate required" });
    }

    // Parse range as plain YYYY-MM-DD strings for comparison
    const startStr = String(startDate).substring(0, 10); // "2026-04-01"
    const endStr   = String(endDate).substring(0, 10);   // "2026-04-30"

    const db = await getDatabase();
    const collection = db.collection("supply_notes");

    // Build sku → itemId map
    const skuToItemId = new Map<string, string>();
    for (const item of items) {
      if (item.supplyNoteSku) {
        skuToItemId.set(item.supplyNoteSku.trim(), item.itemId);
      }
    }

    const skuCodes = Array.from(skuToItemId.keys());
    if (skuCodes.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch all supply note records for these SKUs (no date filter in DB — filter by raw string below)
    const docs = await collection.find({ skuCode: { $in: skuCodes } }).toArray();

    // Helper: convert invoiceDateRaw to "YYYY-MM-DD"
    const rawToYMD = (raw: string): string | null => {
      if (!raw) return null;
      const s = String(raw).trim();

      // DD/MM/YYYY
      const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmy) {
        const dd = dmy[1].padStart(2, "0");
        const mm = dmy[2].padStart(2, "0");
        return `${dmy[3]}-${mm}-${dd}`;
      }

      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

      // Excel serial number (e.g. "46040") — no slashes or dashes
      if (/^\d+$/.test(s)) {
        const num = parseInt(s);
        if (num > 0 && num < 100000) {
          // Excel epoch: Jan 1 1900 = serial 1, with leap year bug
          const msPerDay = 24 * 60 * 60 * 1000;
          const adjusted = num > 60 ? num - 1 : num;
          // Use UTC to avoid timezone shift
          const date = new Date(Date.UTC(1900, 0, 1) + (adjusted - 1) * msPerDay);
          const y = date.getUTCFullYear();
          const m = String(date.getUTCMonth() + 1).padStart(2, "0");
          const d = String(date.getUTCDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
      }

      return null;
    };

    // Aggregate: itemId + date → total receivedQty
    const resultMap = new Map<string, { itemId: string; date: string; supplyNoteQty: number }>();

    for (const doc of docs) {
      const itemId = skuToItemId.get(doc.skuCode);
      if (!itemId) continue;

      // Use invoiceDateRaw directly — no timezone issues
      const dateKey = rawToYMD(doc.invoiceDateRaw);
      if (!dateKey) continue;

      // Filter by date range
      if (dateKey < startStr || dateKey > endStr) continue;

      const key = `${itemId}_${dateKey}`;
      if (!resultMap.has(key)) {
        resultMap.set(key, { itemId, date: dateKey, supplyNoteQty: 0 });
      }
      resultMap.get(key)!.supplyNoteQty += doc.receivedQty || 0;
    }

    console.log(`✅ Supply note qty: ${resultMap.size} records for SKUs [${skuCodes.join(",")}] range ${startStr}→${endStr}`);
    res.json({ success: true, data: Array.from(resultMap.values()) });
  } catch (error) {
    console.error("❌ Supply note qty error:", error);
    res.status(500).json({ error: "Failed to fetch supply note quantities" });
  }
};

// POST /api/supply-note/fix-dates  — one-time migration to fix timezone-shifted dates and Excel serial numbers
export const handleFixSupplyNoteDates: RequestHandler = async (req, res) => {
  try {
    const db = await getDatabase();
    const collection = db.collection("supply_notes");

    const docs = await collection.find({ invoiceDateRaw: { $exists: true } }).toArray();
    let fixed = 0;

    for (const doc of docs) {
      const raw = String(doc.invoiceDateRaw ?? "").trim();

      // Check if invoiceDateRaw is an Excel serial number (only digits)
      let correctDateStr: string | null = null;
      let correctDate: Date | null = null;

      if (/^\d+$/.test(raw)) {
        // Excel serial → convert to DD/MM/YYYY and Date (UTC)
        const num = parseInt(raw);
        if (num > 0 && num < 100000) {
          const msPerDay = 24 * 60 * 60 * 1000;
          const adjusted = num > 60 ? num - 1 : num;
          correctDate = new Date(Date.UTC(1900, 0, 1) + (adjusted - 1) * msPerDay);
          const d = String(correctDate.getUTCDate()).padStart(2, "0");
          const m = String(correctDate.getUTCMonth() + 1).padStart(2, "0");
          const y = correctDate.getUTCFullYear();
          correctDateStr = `${d}/${m}/${y}`; // DD/MM/YYYY
        }
      } else {
        // Already DD/MM/YYYY — just fix the invoiceDate timezone issue
        correctDate = parseSupplyDate(raw);
        correctDateStr = raw; // keep as-is
      }

      if (!correctDate || !correctDateStr) continue;

      // Check if update needed
      const storedRaw = doc.invoiceDateRaw;
      const storedUTC = doc.invoiceDate
        ? `${(doc.invoiceDate as Date).getUTCFullYear()}-${String((doc.invoiceDate as Date).getUTCMonth()+1).padStart(2,"0")}-${String((doc.invoiceDate as Date).getUTCDate()).padStart(2,"0")}`
        : null;
      const correctUTC = `${correctDate.getUTCFullYear()}-${String(correctDate.getUTCMonth()+1).padStart(2,"0")}-${String(correctDate.getUTCDate()).padStart(2,"0")}`;

      if (storedRaw !== correctDateStr || storedUTC !== correctUTC) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { invoiceDateRaw: correctDateStr, invoiceDate: correctDate } }
        );
        fixed++;
      }
    }

    console.log(`✅ Fixed ${fixed} supply note dates`);
    res.json({ success: true, message: `Fixed ${fixed} dates out of ${docs.length} records` });
  } catch (error) {
    console.error("❌ Fix dates error:", error);
    res.status(500).json({ error: "Failed to fix dates" });
  }
};
