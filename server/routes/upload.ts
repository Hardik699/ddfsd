import { RequestHandler } from "express";
import { getDatabase } from "../db";
import { UPLOAD_FORMATS, validateFileFormat } from "../../shared/formats";

// Temporary storage for chunks during chunked uploads - with better persistence
const chunkStorage: Map<string, { 
  chunks: Map<number, any>; 
  totalChunks: number; 
  metadata: any; 
  timestamp: number;
  receivedCount: number;
}> = new Map();

// Cache SAP code map with TTL (5 minutes)
let sapCodeMapCache: { map: Set<string>; timestamp: number } | null = null;
const SAP_CODE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup old chunk uploads every 30 minutes (older than 2 hours)
setInterval(() => {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;

  for (const [key, value] of chunkStorage.entries()) {
    if (now - value.timestamp > TWO_HOURS) {
      console.log(`🧹 Cleaning up expired chunk storage for ${key}`);
      chunkStorage.delete(key);
    }
  }

  // Also clear SAP code cache if older than TTL
  if (sapCodeMapCache && now - sapCodeMapCache.timestamp > SAP_CODE_CACHE_TTL) {
    console.log(`🧹 Clearing SAP code map cache`);
    sapCodeMapCache = null;
  }
}, 30 * 60 * 1000);

// Get cached SAP code map with TTL
async function getSAPCodeMap(): Promise<Set<string>> {
  const now = Date.now();

  // Return cached map if still valid
  if (sapCodeMapCache && now - sapCodeMapCache.timestamp < SAP_CODE_CACHE_TTL) {
    console.log(`✅ Using cached SAP code map (${sapCodeMapCache.map.size} codes, age: ${Math.round((now - sapCodeMapCache.timestamp) / 1000)}s)`);
    return sapCodeMapCache.map;
  }

  console.log(`🔄 Fetching fresh SAP code map from database...`);
  const db = await getDatabase();
  const itemsCollection = db.collection("items");

  try {
    const fetchStartTime = Date.now();
    const items = await itemsCollection.find({}, { projection: { "variations.sapCode": 1 } }).toArray();
    const fetchTimeMs = Date.now() - fetchStartTime;
    console.log(`  ✓ Fetched ${items.length} items in ${fetchTimeMs}ms`);

    const sapCodeSet = new Set<string>();
    let totalVariations = 0;

    for (const item of items) {
      if (item.variations && Array.isArray(item.variations)) {
        item.variations.forEach((v: any) => {
          if (v.sapCode) {
            sapCodeSet.add(v.sapCode.trim());
            totalVariations++;
          }
        });
      }
    }

    // Cache the result
    sapCodeMapCache = {
      map: sapCodeSet,
      timestamp: now
    };

    console.log(`✅ Built SAP code map with ${sapCodeSet.size} unique codes from ${totalVariations} total variations`);
    return sapCodeSet;
  } catch (error) {
    console.error("❌ Error fetching SAP codes:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch SAP codes from database: ${errorMsg}`);
  }
}

// Helper function to normalize area to lowercase
function normalizeArea(area: string, orderType?: string): "zomato" | "swiggy" | "dining" | "parcel" {
  const areaLower = area?.toLowerCase().trim() || "";
  const orderTypeLower = orderType?.toLowerCase().trim() || "";

  console.log(`  [AREA DEBUG] input area="${area}" | areaLower="${areaLower}" | orderType="${orderType}"`);

  // Check for Zomato variations
  if (areaLower.includes("zomato")) {
    console.log(`  [AREA DEBUG] ✓ Matched ZOMATO`);
    return "zomato";
  }

  // Check for Swiggy variations
  if (areaLower.includes("swiggy")) {
    console.log(`  [AREA DEBUG] ✓ Matched SWIGGY`);
    return "swiggy";
  }

  // Check for Parcel/Delivery variations
  if (areaLower.includes("parcel") || areaLower.includes("home delivery") || areaLower.includes("pickup")) {
    console.log(`  [AREA DEBUG] ✓ Matched PARCEL`);
    return "parcel";
  }

  // Check order type as fallback
  if (orderTypeLower.includes("pickup") || orderTypeLower.includes("home delivery")) {
    console.log(`  [AREA DEBUG] ✓ Matched PARCEL (via orderType)`);
    return "parcel";
  }
  if (orderTypeLower.includes("delivery")) {
    console.log(`  [AREA DEBUG] ✓ Matched PARCEL (via delivery orderType)`);
    return "parcel";
  }

  // Default to dining
  console.log(`  [AREA DEBUG] → DEFAULT to DINING`);
  return "dining";
}

// Helper function to parse Excel serial date
function parseExcelDate(serialDate: number): Date | null {
  if (!serialDate || isNaN(serialDate)) return null;

  // Excel serial dates start from January 1, 1900 = 1
  // There's a leap year bug in Excel (Feb 29, 1900 doesn't exist but Excel counts it)
  const excelEpoch = new Date(1900, 0, 1).getTime();
  const msPerDay = 24 * 60 * 60 * 1000;

  // Account for Excel's leap year bug (dates after Feb 28, 1900 are off by 1)
  let adjustedSerial = serialDate;
  if (serialDate > 60) {
    adjustedSerial = serialDate - 1; // Subtract 1 for the non-existent Feb 29, 1900
  }

  const timestamp = excelEpoch + (adjustedSerial - 1) * msPerDay;
  const date = new Date(timestamp);

  return isNaN(date.getTime()) ? null : date;
}

// Helper function to parse date string
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const str = String(dateStr).trim();

  // Try YYYY-MM-DD format FIRST (from HTML date input)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]);
    const day = parseInt(isoMatch[3]);
    return new Date(year, month - 1, day);
  }

  // Try other date formats (DD-MM-YYYY or DD/MM/YYYY)
  const formats = [
    { regex: /^(\d{2})-(\d{2})-(\d{4})$/, order: "DMY" }, // DD-MM-YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: "DMY" }, // DD/MM/YYYY
  ];

  for (const { regex, order } of formats) {
    const match = str.match(regex);
    if (match) {
      let year, month, day;
      if (order === "DMY") {
        day = parseInt(match[1]);
        month = parseInt(match[2]);
        year = parseInt(match[3]);
      }
      if (year >= 1900 && year <= 2099) {
        return new Date(year, month - 1, day);
      }
    }
  }

  // Only try to parse as Excel serial number if it contains NO "/" or "-" characters
  if (!str.includes("/") && !str.includes("-")) {
    const numVal = parseFloat(str);
    if (!isNaN(numVal) && numVal > 0 && numVal < 100000) {
      const excelDate = parseExcelDate(numVal);
      if (excelDate) {
        return excelDate;
      }
    }
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

export const handleUpload: RequestHandler = async (req, res) => {
  try {
    const { type, year, month, data, rows, columns, validRowIndices, chunkIndex, totalChunks, isChunked } = req.body;

    if (!type || !year || !month || !data || !rows || !columns) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (typeof type !== 'string' || typeof year !== 'number' || typeof month !== 'number') {
      return res.status(400).json({ error: "Invalid field types" });
    }

    // Validate upload type exists
    if (!Object.keys(UPLOAD_FORMATS).includes(type)) {
      return res.status(400).json({ error: `Invalid upload type: ${type}` });
    }

    // Validate file format
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    // Check if this is a chunk (PUT /api/upload is used for first chunk of chunked updates)
    if (chunkIndex !== undefined && totalChunks !== undefined) {
      console.log(`📦 Received chunk ${chunkIndex + 1}/${totalChunks} at /api/upload for ${type}/${year}/${month}`);

      const storageKey = `${type}_${year}_${month}`;

      // Initialize storage for this upload if it doesn't exist
      if (!chunkStorage.has(storageKey)) {
        chunkStorage.set(storageKey, {
          chunks: new Map(),
          totalChunks,
          metadata: {
            type,
            year,
            month,
            columns,
            validRowIndices: chunkIndex === 0 ? validRowIndices : undefined
          },
          timestamp: Date.now(),
          receivedCount: 0
        });
        console.log(`  🆕 Created new chunk storage for ${storageKey}`);
      }

      const storage = chunkStorage.get(storageKey)!;

      // Store the chunk (first chunk includes headers)
      const headers = chunkIndex === 0 ? data[0] : null;
      if (chunkIndex === 0) {
        storage.metadata.headers = headers;
      }

      // Store chunk data
      storage.chunks.set(chunkIndex, {
        index: chunkIndex,
        data: data.slice(1), // Remove headers
        rows
      });
      storage.receivedCount = storage.chunks.size;
      storage.timestamp = Date.now(); // Update timestamp

      console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} stored at /api/upload. Progress: ${storage.receivedCount}/${totalChunks}`);

      return res.json({
        success: true,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} received`,
        chunkIndex,
        allChunksReceived: storage.receivedCount === totalChunks,
        receivedChunks: storage.receivedCount,
        totalChunks
      });
    }

    // Non-chunked upload logic below
    const headers = data[0] as string[];
    const validation = validateFileFormat(headers, type as any);

    if (!validation.valid) {
      return res.status(400).json({
        error: `Invalid file format. Missing columns: ${validation.missing.join(", ")}`,
        missingColumns: validation.missing
      });
    }

    // Filter data if validRowIndices provided (remove invalid rows)
    let finalData = data;
    let finalRows = rows;
    if (Array.isArray(validRowIndices) && validRowIndices.length > 0) {
      // validRowIndices are 1-indexed from the UI (row 2, row 3, etc.)
      // data[0] is headers, so we need to map indices correctly
      finalData = [headers, ...validRowIndices.map(idx => data[idx])];
      finalRows = validRowIndices.length;
    }

    const db = await getDatabase();
    const collection = db.collection(type);

    // Check if data already exists for this month/year
    const existingData = await collection.findOne({ year, month });
    if (existingData) {
      return res.status(409).json({
        error: "Data already exists for this month",
        exists: true
      });
    }

    // Save the data
    const result = await collection.insertOne({
      year,
      month,
      rows: finalRows,
      columns,
      data: finalData,
      uploadedAt: new Date(),
      status: "uploaded"
    });

    // Process and create items from petpooja data
    if (type === "petpooja") {
      try {
        await processAndCreateItemsFromPetpooja(db, finalData);
      } catch (itemError) {
        console.error("⚠️ Warning: Failed to auto-create items from upload:", itemError);
        // Don't fail the upload if item creation fails
      }
    }

    res.json({
      success: true,
      id: result.insertedId,
      message: `Data uploaded successfully (${finalRows} rows)`,
      rowsUploaded: finalRows
    });
  } catch (error) {
    console.error("Upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload data";
    res.status(500).json({ error: errorMessage });
  }
};


export const handleGetUploads: RequestHandler = async (req, res) => {
  try {
    const { type, year } = req.query;

    if (!type) {
      return res.status(400).json({ error: "Type is required" });
    }

    console.log(`📋 Getting uploads for type: ${type}, year: ${year}`);

    const db = await getDatabase();
    const collection = db.collection(type as string);

    // Filter by year if provided, otherwise use current year
    const filterYear = year ? parseInt(year as string) : new Date().getFullYear();

    const data = await collection.find({ year: filterYear }).toArray();
    console.log(`✅ Found ${data.length} uploads for ${type} year ${filterYear}`);

    // Create a map of uploaded months
    const uploadedMonths: Record<number, boolean> = {};
    data.forEach((doc: any) => {
      if (typeof doc.month === 'number') {
        uploadedMonths[doc.month] = true;
      }
    });

    // Fill in months 1-12 with status
    const monthsStatus = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: uploadedMonths[i + 1] ? "uploaded" : "pending" as const
    }));

    res.json({ data: monthsStatus });
  } catch (error) {
    console.error("❌ Get uploads error:", error);
    // Return default empty status on error instead of throwing
    const monthsStatus = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: "pending" as const
    }));
    res.json({ data: monthsStatus });
  }
};

export const handleUpdateUpload: RequestHandler = async (req, res) => {
  try {
    const { type, year, month, data, rows, columns, validRowIndices, chunkIndex, totalChunks, isChunked } = req.body;

    if (!type || !year || !month || !data) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if this is a chunk (PUT /api/upload is used for first chunk of chunked updates)
    if (chunkIndex !== undefined && totalChunks !== undefined) {
      console.log(`📦 Received update chunk ${chunkIndex + 1}/${totalChunks} at PUT /api/upload for ${type}/${year}/${month}`);

      const storageKey = `${type}_${year}_${month}`;

      // Initialize storage for this upload if it doesn't exist
      if (!chunkStorage.has(storageKey)) {
        chunkStorage.set(storageKey, {
          chunks: new Map(),
          totalChunks,
          metadata: {
            type,
            year,
            month,
            columns,
            validRowIndices: chunkIndex === 0 ? validRowIndices : undefined,
            isUpdate: true
          },
          timestamp: Date.now(),
          receivedCount: 0
        });
        console.log(`  🆕 Created new chunk storage for update ${storageKey}`);
      }

      const storage = chunkStorage.get(storageKey)!;

      // Store the chunk (first chunk includes headers)
      const headers = chunkIndex === 0 ? data[0] : null;
      if (chunkIndex === 0) {
        storage.metadata.headers = headers;
      }

      storage.chunks.set(chunkIndex, {
        index: chunkIndex,
        data: data.slice(1), // Remove headers
        rows
      });
      storage.receivedCount = storage.chunks.size;
      storage.timestamp = Date.now();

      console.log(`✅ Update chunk ${chunkIndex + 1}/${totalChunks} stored. Progress: ${storage.receivedCount}/${totalChunks}`);

      return res.json({
        success: true,
        message: `Update chunk ${chunkIndex + 1}/${totalChunks} received`,
        chunkIndex,
        allChunksReceived: storage.receivedCount === totalChunks,
        receivedChunks: storage.receivedCount,
        totalChunks
      });
    }

    // Non-chunked update logic below
    // Filter data if validRowIndices provided
    let finalData = data;
    let finalRows = rows;
    if (Array.isArray(validRowIndices) && validRowIndices.length > 0) {
      const headers = data[0];
      finalData = [headers, ...validRowIndices.map((idx: number) => data[idx])];
      finalRows = validRowIndices.length;
    }

    const db = await getDatabase();
    const collection = db.collection(type);

    const result = await collection.updateOne(
      { year, month },
      {
        $set: {
          rows: finalRows,
          columns,
          data: finalData,
          updatedAt: new Date(),
          status: "updated"
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Data not found" });
    }

    res.json({ success: true, message: `Data updated successfully (${finalRows} rows)` });
  } catch (error) {
    console.error("Update error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update data";
    res.status(500).json({ error: errorMessage });
  }
};

export const handleGetData: RequestHandler = async (req, res) => {
  try {
    const { type, year, month } = req.query;

    if (!type || !year || !month) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const db = await getDatabase();
    const collection = db.collection(type as string);

    const yearNum = parseInt(year as string);
    const monthNum = parseInt(month as string);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: "Invalid year or month" });
    }

    const doc = await collection.findOne({
      year: yearNum,
      month: monthNum
    });

    if (!doc) {
      return res.status(404).json({ error: "Data not found" });
    }

    res.json(doc);
  } catch (error) {
    console.error("Get data error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
    res.status(500).json({ error: errorMessage });
  }
};

// Validate data against database before upload
export const handleValidateUpload: RequestHandler = async (req, res) => {
  try {
    const { type, data, isMinimal, originalIndices } = req.body;
    const rowCount = Array.isArray(data) ? data.length : 0;

    console.log("📋 Validation request received:", {
      type,
      rowCount,
      isMinimal: !!isMinimal
    });

    if (!type || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "Invalid request data" });
    }

    // Limit validation to prevent memory issues and timeouts
    const MAX_VALIDATION_ROWS = 500000; // 500k rows max for validation
    if (rowCount > MAX_VALIDATION_ROWS) {
      return res.status(413).json({
        error: `File too large for validation (${rowCount} rows). Maximum ${MAX_VALIDATION_ROWS} rows allowed.`,
        retryable: false
      });
    }

    if (type !== "petpooja") {
      return res.json({
        success: true,
        validCount: data.length - 1,
        invalidCount: 0,
        validRows: data.slice(1).map((row, i) => ({ rowIndex: i + 2, data: row })),
        invalidRows: []
      });
    }

    console.log("🔗 Fetching SAP code map for validation...");

    let sapCodeSet: Set<string>;
    try {
      sapCodeSet = await getSAPCodeMap();
    } catch (dbError) {
      console.error("❌ Database error while fetching SAP codes:", dbError);
      const errorMsg = dbError instanceof Error ? dbError.message : "Database connection failed";
      return res.status(503).json({
        error: `Database query failed: ${errorMsg}. Please try again.`,
        retryable: true
      });
    }

    const headers = data[0] as string[];
    const dataRows = data.slice(1);

    // Find column indices
    let restaurantIdx: number;
    let sapCodeIdx: number;

    if (isMinimal && originalIndices) {
      // In minimal mode, data rows only have 2 columns: [restaurant, sapCode]
      // headers still contains original headers to keep index discovery logic if needed,
      // but here we know the mapping is always [0, 1]
      restaurantIdx = 0;
      sapCodeIdx = 1;
    } else {
      const getColumnIndex = (name: string) =>
        headers.findIndex((h) => h?.toLowerCase().trim() === name.toLowerCase().trim());

      restaurantIdx = getColumnIndex("restaurant_name");
      sapCodeIdx = getColumnIndex("sap_code");
    }

    console.log(`📍 Using column indices - restaurant: ${restaurantIdx}, sapCode: ${sapCodeIdx}`);

    const validRows = [];
    const invalidRows = [];
    let validCount = 0;
    let invalidCount = 0;

    const startTime = Date.now();
    const MAX_VALID_ROWS_IN_RESPONSE = 100;
    const MAX_INVALID_ROWS_IN_RESPONSE = 500;

    // Process rows with periodic progress logging for very large datasets
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      const restaurant = row[restaurantIdx]?.toString().trim() || "";
      const sapCode = row[sapCodeIdx]?.toString().trim() || "";

      let isValid = true;
      let reason = "";

      if (!restaurant) {
        isValid = false;
        reason = "No restaurant name found in row";
      } else if (!sapCode) {
        isValid = false;
        reason = "No SAP code found in row";
      } else if (!sapCodeSet.has(sapCode)) {
        isValid = false;
        reason = `SAP code "${sapCode}" not found in database`;
      }

      if (isValid) {
        validCount++;
        // Only include first N valid rows in response to keep payload small
        if (validRows.length < MAX_VALID_ROWS_IN_RESPONSE) {
          validRows.push({ rowIndex: i + 2, data: isMinimal ? [restaurant, sapCode] : row });
        }
      } else {
        invalidCount++;
        // Only include first N invalid rows in response to keep payload small
        if (invalidRows.length < MAX_INVALID_ROWS_IN_RESPONSE) {
          invalidRows.push({
            rowIndex: i + 2,
            data: isMinimal ? [restaurant, sapCode] : row,
            reason
          });
        }
      }

      // Log progress for very large datasets every 10,000 rows
      if ((i + 1) % 10000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  ⏳ Validation progress: ${i + 1}/${dataRows.length} rows checked (${elapsed}s)`);
      }
    }

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Validation complete in ${elapsedTime}s: ${validCount} valid, ${invalidCount} invalid rows`);
    console.log(`📦 Response payload: ${validRows.length} valid rows, ${invalidRows.length} invalid rows in response`);

    const responsePayload = {
      success: true,
      validCount,
      invalidCount,
      validRows,
      invalidRows,
    };

    // Log response size
    const responseSize = JSON.stringify(responsePayload).length;
    console.log(`📊 Response payload size: ${(responseSize / 1024).toFixed(2)} KB`);

    // Set proper headers for large responses
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send JSON response
    res.json(responsePayload);
    console.log(`✅ Validation response sent successfully`);
  } catch (error) {
    console.error("❌ Validation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to validate data";
    const errorType = error instanceof Error ? error.name : "Unknown";

    // Log detailed error information for debugging
    console.error(`Error type: ${errorType}`);
    if (error instanceof Error) {
      console.error(`Stack: ${error.stack}`);
    }

    // Return 500 with retryable flag so client can retry
    res.status(500).json({
      error: `Validation error: ${errorMessage}. Please try again.`,
      retryable: true,
      errorType
    });
  }
};

// DELETE /api/upload/delete - Delete upload data for a specific month with password protection
export const handleDeleteUpload: RequestHandler = async (req, res) => {
  try {
    const { type, year, month, password } = req.body;

    // Validate required fields
    if (!type || !year || !month || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Simple password validation (in production, use bcrypt)
    const DELETION_PASSWORD = process.env.DELETION_PASSWORD || "admin123";

    if (password !== DELETION_PASSWORD) {
      console.warn(`⚠️ Invalid deletion password attempt for ${type}/${year}/${month}`);
      return res.status(401).json({ error: "Invalid password" });
    }

    console.log(`🗑️ Deleting ${type} data for month ${month}/${year}`);

    const db = await getDatabase();
    const collection = db.collection(type);

    // Find and delete the upload record
    const result = await collection.deleteOne({
      year,
      month
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "No data found for this month" });
    }

    console.log(`✅ Successfully deleted ${type} data for month ${month}/${year}`);

    res.json({
      success: true,
      message: `Data for ${month}/${year} has been deleted successfully`
    });
  } catch (error) {
    console.error("❌ Delete error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to delete data";
    res.status(500).json({ error: errorMessage });
  }
};

// POST /api/upload/chunk - Handle chunked uploads (sequential uploads)
export const handleChunkUpload: RequestHandler = async (req, res) => {
  try {
    const { type, year, month, data, rows, columns, chunkIndex, totalChunks, isChunked, validRowIndices } = req.body;

    // Validate required fields
    if (!type || !year || !month || !Array.isArray(data) || chunkIndex === undefined || totalChunks === undefined) {
      return res.status(400).json({ error: "Missing required chunk fields" });
    }

    const storageKey = `${type}_${year}_${month}`;

    console.log(`📦 Received chunk ${chunkIndex + 1}/${totalChunks} for ${storageKey} (${rows} rows)`);

    // Initialize storage for this upload if it doesn't exist
    if (!chunkStorage.has(storageKey)) {
      chunkStorage.set(storageKey, {
        chunks: new Map(),
        totalChunks,
        metadata: {
          type,
          year,
          month,
          columns,
          validRowIndices: chunkIndex === 0 ? validRowIndices : undefined
        },
        timestamp: Date.now(),
        receivedCount: 0
      });
      console.log(`  🆕 Created new chunk storage for ${storageKey}`);
    }

    const storage = chunkStorage.get(storageKey)!;

    // Validate chunk data
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: `Chunk ${chunkIndex + 1} contains no data` });
    }

    // Store the chunk (first chunk includes headers)
    const headers = chunkIndex === 0 ? data[0] : null;
    if (chunkIndex === 0) {
      storage.metadata.headers = headers;
      console.log(`  📋 Stored headers for ${storageKey}`);
    }

    // Store chunk data (without headers for non-first chunks)
    const chunkDataToStore = data.slice(1); // Always remove headers row
    storage.chunks.set(chunkIndex, {
      index: chunkIndex,
      data: chunkDataToStore,
      rows: chunkDataToStore.length
    });
    storage.receivedCount = storage.chunks.size;
    storage.timestamp = Date.now(); // Update timestamp

    console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} stored successfully. Progress: ${storage.receivedCount}/${totalChunks} chunks`);

    // Check if all chunks have been received
    const allChunksReceived = storage.receivedCount === totalChunks;

    res.json({
      success: true,
      message: `Chunk ${chunkIndex + 1}/${totalChunks} received and stored`,
      chunkIndex,
      allChunksReceived,
      receivedChunks: storage.receivedCount,
      totalChunks,
      storageKey
    });
  } catch (error) {
    console.error("❌ Chunk upload error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload chunk";
    res.status(500).json({ error: errorMessage });
  }
};

// Helper function to extract unique items from petpooja data and create items
async function processAndCreateItemsFromPetpooja(db: Db, data: any[]): Promise<number> {
  try {
    console.log(`🔍 Processing petpooja data to extract and create items...`);

    const headers = data[0] as string[];
    const dataRows = data.slice(1);

    // Find column indices
    const getColumnIndex = (name: string) =>
      headers.findIndex((h) => h?.toLowerCase().trim() === name.toLowerCase().trim());

    const sapCodeIdx = getColumnIndex("sap_code");
    const restaurantIdx = getColumnIndex("restaurant_name");

    if (sapCodeIdx === -1) {
      console.warn("⚠️ SAP code column not found, skipping item creation");
      return 0;
    }

    // Extract unique SAP codes from the data
    const sapCodeMap = new Map<string, Set<string>>(); // sapCode -> set of item names

    for (const row of dataRows) {
      if (!Array.isArray(row)) continue;

      const sapCode = row[sapCodeIdx]?.toString().trim();
      const itemName = restaurantIdx >= 0 ? row[restaurantIdx]?.toString().trim() : "Unknown";

      if (sapCode && itemName) {
        if (!sapCodeMap.has(sapCode)) {
          sapCodeMap.set(sapCode, new Set());
        }
        sapCodeMap.get(sapCode)!.add(itemName);
      }
    }

    console.log(`📊 Found ${sapCodeMap.size} unique SAP codes in upload data`);

    const itemsCollection = db.collection("items");
    let itemsCreated = 0;
    let itemsUpdated = 0;

    // Process each SAP code
    for (const [sapCode, itemNames] of sapCodeMap.entries()) {
      try {
        // Check if item with this SAP code already exists
        const existingVariation = await itemsCollection.findOne({
          "variations.sapCode": sapCode
        });

        if (existingVariation) {
          console.log(`  ✓ Item already has SAP code: ${sapCode}`);
          itemsUpdated++;
          continue;
        }

        // Create a new item for this SAP code if it doesn't exist
        const itemName = Array.from(itemNames)[0]; // Use first occurrence as name
        const shortCode = sapCode.substring(0, 3).toUpperCase();
        const newItemId = `AUTO-${sapCode}-${Date.now()}`;

        const newItem = {
          itemId: newItemId,
          name: itemName || "Imported Item",
          shortCode: shortCode,
          group: "Imported",
          category: "Other",
          itemType: "Goods",
          basePrice: 0,
          hsnCode: "",
          gst: 0,
          profitMargin: 0,
          unitType: "pcs",
          variations: [
            {
              id: `VAR-${Date.now()}`,
              name: "Default Variation",
              value: itemName || "Default",
              basePrice: 0,
              saleType: "QTY",
              sapCode: sapCode,
              prices: {
                Zomato: 0,
                Swiggy: 0,
                GS1: 0
              }
            }
          ],
          createdAt: new Date(),
          createdFrom: "upload"
        };

        await itemsCollection.insertOne(newItem);
        console.log(`  ✅ Created new item: ${newItemId} with SAP code: ${sapCode}`);
        itemsCreated++;
      } catch (error) {
        console.error(`  ❌ Error processing SAP code ${sapCode}:`, error);
        // Continue with next SAP code on error
      }
    }

    // Clear SAP code cache since we've added new items
    sapCodeMapCache = null;
    console.log(`✅ Item processing complete: ${itemsCreated} created, ${itemsUpdated} already exist`);

    return itemsCreated + itemsUpdated;
  } catch (error) {
    console.error("❌ Error processing items from petpooja data:", error);
    throw error;
  }
}

// POST /api/upload/finalize - Finalize chunked upload by combining all chunks and saving to database
export const handleFinalizeUpload: RequestHandler = async (req, res) => {
  try {
    const { type, year, month, isUpdate } = req.body;

    if (!type || !year || !month) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const storageKey = `${type}_${year}_${month}`;

    console.log(`🔄 Finalize request for ${storageKey}`);
    console.log(`  Available storage keys:`, Array.from(chunkStorage.keys()));
    console.log(`  Storage size:`, chunkStorage.size);

    // Check if we have stored chunks for this upload
    const uploadData = chunkStorage.get(storageKey);
    if (!uploadData) {
      console.error(`❌ No chunk storage found for ${storageKey}`);
      console.error(`  Requested: type=${type}, year=${year}, month=${month}`);
      return res.status(400).json({ 
        error: "No chunked upload in progress for this month",
        storageKey,
        availableKeys: Array.from(chunkStorage.keys()),
        requestedParams: { type, year, month }
      });
    }

    const { chunks, totalChunks, metadata, receivedCount } = uploadData;
    
    console.log(`  📊 Storage info:`);
    console.log(`    - Received chunks: ${receivedCount}/${totalChunks}`);
    console.log(`    - Chunk map size: ${chunks.size}`);
    console.log(`    - Chunk indices:`, Array.from(chunks.keys()));

    // Verify all chunks are present
    if (receivedCount !== totalChunks) {
      console.error(`  ❌ Missing chunks! Expected ${totalChunks}, received ${receivedCount}`);
      return res.status(400).json({
        error: `Missing chunks. Expected ${totalChunks}, received ${receivedCount}`
      });
    }

    // Combine all chunks efficiently
    console.log(`  🔗 Combining ${receivedCount} chunks...`);
    const combinedDataRows: any[] = [];

    try {
      // Sort chunks by index and combine
      const sortedIndices = Array.from(chunks.keys()).sort((a, b) => a - b);
      
      console.log(`  📋 Chunk indices to combine:`, sortedIndices);
      
      for (const chunkIndex of sortedIndices) {
        const chunk = chunks.get(chunkIndex);
        if (!chunk) {
          throw new Error(`Chunk ${chunkIndex} is missing from storage`);
        }

        console.log(`    Processing chunk ${chunkIndex + 1}: ${chunk.data.length} rows`);

        // Add chunk data to combined array
        combinedDataRows.push(...chunk.data);
      }
      
      console.log(`  ✅ Total rows after combining: ${combinedDataRows.length}`);
    } catch (combineError) {
      const errorMsg = combineError instanceof Error ? combineError.message : String(combineError);
      console.error(`  ❌ Error combining chunks:`, errorMsg);
      return res.status(500).json({
        error: `Failed to combine chunks: ${errorMsg}`
      });
    }

    console.log(`✅ Combined ${receivedCount} chunks into ${combinedDataRows.length} total data rows`);

    // Get headers from metadata (stored from first chunk)
    const headers = metadata.headers || [];
    const fullData = [headers, ...combinedDataRows];

    // Get database and determine if this is insert or update
    const db = await getDatabase();
    const collection = db.collection(type);

    let totalRows = combinedDataRows.length;
    let finalData = fullData;

    // Apply valid row indices if provided (filter invalid rows)
    if (metadata.validRowIndices && Array.isArray(metadata.validRowIndices) && metadata.validRowIndices.length > 0) {
      console.log(`  🔍 Applying validRowIndices filter...`);
      console.log(`    - Total combined rows: ${combinedDataRows.length}`);
      console.log(`    - Valid indices count: ${metadata.validRowIndices.length}`);
      console.log(`    - First few valid indices:`, metadata.validRowIndices.slice(0, 10));
      
      const validIndices = new Set(metadata.validRowIndices);
      
      // validRowIndices are 1-indexed row numbers from original file (row 2 = first data row)
      // combinedDataRows is 0-indexed (index 0 = first data row)
      // So we need to subtract 2 from each validRowIndex to get the correct array index
      const filteredRows = combinedDataRows.filter((_, idx) => {
        const rowNumber = idx + 2; // Convert 0-indexed array position to 1-indexed row number
        return validIndices.has(rowNumber);
      });
      
      finalData = [headers, ...filteredRows];
      totalRows = filteredRows.length;
      console.log(`  ✅ Filtered to ${totalRows} valid rows from ${combinedDataRows.length} total rows`);
    } else {
      console.log(`  ℹ️ No validation filter applied - uploading all ${combinedDataRows.length} rows`);
    }

    // Handle insert or update
    console.log(`  💾 Saving to database: ${totalRows} rows, ${metadata.columns} columns`);

    if (isUpdate) {
      console.log(`🔄 Updating existing data for ${storageKey}`);
      try {
        const result = await collection.updateOne(
          { year, month },
          {
            $set: {
              rows: totalRows,
              columns: metadata.columns,
              data: finalData,
              updatedAt: new Date(),
              status: "updated"
            }
          }
        );

        if (result.matchedCount === 0) {
          console.error(`  ❌ No document found to update for ${storageKey}`);
          return res.status(404).json({ error: "Data not found for update" });
        }

        console.log(`✅ Update finalized for ${storageKey}: ${totalRows} rows updated`);
      } catch (dbError) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error(`  ❌ Database update failed: ${errorMsg}`);
        throw dbError;
      }
    } else {
      // Check if data already exists
      try {
        const existingData = await collection.findOne({ year, month });
        if (existingData) {
          console.warn(`  ⚠️ Data already exists for ${storageKey}`);
          return res.status(409).json({
            error: "Data already exists for this month",
            exists: true
          });
        }

        console.log(`💾 Inserting new data for ${storageKey}: ${totalRows} rows`);
        
        // Check document size before inserting
        const documentSize = JSON.stringify(finalData).length;
        const documentSizeMB = (documentSize / (1024 * 1024)).toFixed(2);
        console.log(`  📏 Document size: ${documentSizeMB} MB`);
        
        // If data is too large, split into multiple documents
        if (documentSize > 5 * 1024 * 1024) { // Reduced to 5MB limit for safety
          console.log(`  ⚠️ Document too large (${documentSizeMB} MB), splitting into parts...`);
          
          const headers = finalData[0];
          const dataRows = finalData.slice(1);
          const ROWS_PER_PART = 8000; // Reduced from 15k to 8k rows per document
          const totalParts = Math.ceil(dataRows.length / ROWS_PER_PART);
          
          console.log(`  📦 Splitting into ${totalParts} parts (${ROWS_PER_PART} rows each)`);
          
          for (let partIndex = 0; partIndex < totalParts; partIndex++) {
            const startIdx = partIndex * ROWS_PER_PART;
            const endIdx = Math.min(startIdx + ROWS_PER_PART, dataRows.length);
            const partData = [headers, ...dataRows.slice(startIdx, endIdx)];
            const partRows = partData.length - 1;
            
            // Check part size before inserting
            const partSize = JSON.stringify(partData).length;
            const partSizeMB = (partSize / (1024 * 1024)).toFixed(2);
            console.log(`    📏 Part ${partIndex + 1} size: ${partSizeMB} MB`);
            
            // Ensure part is not too large for BSON
            if (partSize > 15 * 1024 * 1024) { // 15MB BSON limit
              throw new Error(`Part ${partIndex + 1} is still too large (${partSizeMB} MB). Try reducing data size.`);
            }
            
            await collection.insertOne({
              year,
              month,
              part: partIndex + 1,
              totalParts,
              rows: partRows,
              columns: metadata.columns,
              data: partData,
              uploadedAt: new Date(),
              status: "uploaded"
            });
            
            console.log(`    ✅ Part ${partIndex + 1}/${totalParts} saved (${partRows} rows)`);
          }
          
          console.log(`✅ Data split and saved in ${totalParts} parts`);
        } else {
          // Normal single document insert
          const insertResult = await collection.insertOne({
            year,
            month,
            rows: totalRows,
            columns: metadata.columns,
            data: finalData,
            uploadedAt: new Date(),
            status: "uploaded"
          });
          
          console.log(`✅ Data inserted successfully, document ID: ${insertResult.insertedId}`);
        }

        // Process and create items from petpooja data
        if (type === "petpooja") {
          try {
            console.log(`  🔍 Processing items from petpooja data...`);
            await processAndCreateItemsFromPetpooja(db, finalData);
          } catch (itemError) {
            console.error("⚠️ Warning: Failed to auto-create items from upload:", itemError);
            // Don't fail the upload if item creation fails
          }
        }
      } catch (dbError) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error(`  ❌ Database insert failed: ${errorMsg}`);
        throw dbError;
      }
    }

    // Clean up chunk storage
    chunkStorage.delete(storageKey);
    console.log(`🧹 Cleaned up chunk storage for ${storageKey}`);



    res.json({
      success: true,
      message: `Upload finalized successfully (${totalRows} rows)`,
      rowsUploaded: totalRows
    });
  } catch (error) {
    console.error("❌ Finalize error:", error);

    // Clean up on error
    const storageKey = `${req.body.type}_${req.body.year}_${req.body.month}`;
    if (chunkStorage.has(storageKey)) {
      chunkStorage.delete(storageKey);
      console.log(`🧹 Cleaned up chunk storage after error for ${storageKey}`);
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to finalize upload";
    res.status(500).json({ error: errorMessage });
  }
};
