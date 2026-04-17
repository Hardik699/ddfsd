import "dotenv/config";
import express from "express";
import cors from "cors";
import compression from "compression";
import { handleDemo } from "./routes/demo";
import {
  handleUpload,
  handleGetUploads,
  handleUpdateUpload,
  handleGetData,
  handleValidateUpload,
  handleDeleteUpload,
  handleChunkUpload,
  handleFinalizeUpload,
} from "./routes/upload";
import {
  handleDebugItemSales,
  handleUpdateItemShortCode,
  handleDebugSalesHistory,
} from "./routes/debug";
import {
  handleGetAllSapCodes,
  handleGetItemsWithSapCodes,
  handleSetItemSapCode,
  handleBatchSetSapCodes,
  handleMatchSapCodes,
  handleAutoMatchVariationSapCodes,
} from "./routes/sap-matching";
import {
  handleSapDebugInfo,
  handleDebugSalesForItem,
} from "./routes/sap-debug";
import {
  handleViewPetpooja,
  handleSearchSapCode,
} from "./routes/view-petpooja";
import { handleCheckAllData, handleShowSampleRows } from "./routes/check-data";
import {
  handleGetItems,
  handleGetItemById,
  handleCreateItem,
  handleUpdateItem,
  handleBulkUpdateSaleTypes,
  handleDeleteItem,
  handleGetDropdowns,
  handleAddGroup,
  handleAddCategory,
  handleAddHsnCode,
  handleAddVariationValue,
  handleAddGS1Channel,
  handleGetGroupCategories,
  handleUpdateGroup,
  handleUpdateCategory,
  handleUpdateHsnCode,
  handleUpdateVariationValue,
  handleGetItemLogs,
} from "./routes/items";
import {
  handleGetSales,
  handleGetItemSales,
  handleGetSalesSummary,
  handleRecordSale,
  handleGetMonthlySales,
  handleGetDailySales,
  handleGetRestaurants,
  handleResetItemSales,
  handleDebugItemSalesRaw,
  handleDebugParcelData,
  handleDebugAllData,
  handleClearAllPetpoojaData,
  handleGetDailyReport,
  handleGetBulkSales,
} from "./routes/sales";
import { handleSupplyNoteUpload, handleSupplyNoteList, handleSupplyNoteStatus, handleSupplyNoteDelete, handleSupplyNoteQtyByItems, handleFixSupplyNoteDates } from "./routes/supply-note";

export function createServer() {
  const app = express();

  // Set socket timeout FIRST (20 minutes = 1200 seconds) before any other middleware
  app.use((req, res, next) => {
    req.socket.setTimeout(1200000); // 20 minutes for socket
    req.setTimeout(1200000); // 20 minutes for request
    res.setTimeout(1200000); // 20 minutes for response
    next();
  });

  // Middleware
  app.use(compression({
    level: 9,
    threshold: 1024, // Compress responses > 1KB
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
  }));
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  }));
  app.use(express.json({ limit: "200mb" }));
  app.use(express.urlencoded({ extended: true, limit: "200mb" }));

  // Ensure responses have proper Content-Type and caching headers
  app.use((req, res, next) => {
    res.setHeader("Content-Type", "application/json");

    // Cache API responses for 5 minutes
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "public, max-age=300");
    }
    next();
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Debug endpoints
  app.get("/api/debug/item-sales", handleDebugItemSales);
  app.get("/api/debug/sales-history", handleDebugSalesHistory);
  app.post("/api/debug/update-shortcode", handleUpdateItemShortCode);

  // SAP Code matching endpoints
  app.get("/api/sap/all-codes", handleGetAllSapCodes);
  app.get("/api/sap/items-with-codes", handleGetItemsWithSapCodes);
  app.post("/api/sap/set-item-code", handleSetItemSapCode);
  app.post("/api/sap/batch-set-codes", handleBatchSetSapCodes);
  app.post("/api/sap/auto-match-variations", handleAutoMatchVariationSapCodes);
  app.get("/api/sap/match-analysis", handleMatchSapCodes);
  app.get("/api/sap/debug-info", handleSapDebugInfo);
  app.get("/api/sap/debug-sales", handleDebugSalesForItem);

  // View petpooja database
  app.get("/api/petpooja/view", handleViewPetpooja);
  app.get("/api/petpooja/search", handleSearchSapCode);

  // Check data
  app.get("/api/check-data", handleCheckAllData);
  app.get("/api/check-data/rows", handleShowSampleRows);

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Upload routes
  app.post("/api/upload/validate", handleValidateUpload);
  app.delete("/api/upload/delete", handleDeleteUpload);
  app.post("/api/upload/chunk", handleChunkUpload);
  app.post("/api/upload/finalize", handleFinalizeUpload);
  app.post("/api/upload", handleUpload);
  app.get("/api/uploads", handleGetUploads);
  app.put("/api/upload", handleUpdateUpload);
  app.get("/api/data", handleGetData);

  // Items routes - more specific routes first
  app.get("/api/items/dropdowns", handleGetDropdowns);
  app.post("/api/items/groups", handleAddGroup);
  app.get("/api/items/groups/:groupName", handleGetGroupCategories);
  app.put("/api/items/groups/:groupName", handleUpdateGroup);
  app.post("/api/items/categories", handleAddCategory);
  app.put("/api/items/categories/:categoryName", handleUpdateCategory);
  app.post("/api/items/hsn-codes", handleAddHsnCode);
  app.put("/api/items/hsn-codes/:code", handleUpdateHsnCode);
  app.post("/api/items/variation-values", handleAddVariationValue);
  app.put("/api/items/variation-values/:value", handleUpdateVariationValue);
  app.post("/api/items/migrate/add-gs1", handleAddGS1Channel);
  app.get("/api/items", handleGetItems);
  app.get("/api/items/:itemId/logs", handleGetItemLogs);
  app.get("/api/items/:itemId", handleGetItemById);
  app.post("/api/items", handleCreateItem);
  app.put("/api/items/:itemId", handleUpdateItem);
  app.post("/api/items/bulk-update-sale-types", handleBulkUpdateSaleTypes);
  app.delete("/api/items/:itemId", handleDeleteItem);

  // Test endpoint
  app.get("/api/test-report", (_req, res) => {
    res.json({
      success: true,
      data: [
        {
          itemId: "TEST001",
          itemName: "Test Item",
          category: "Test Category",
          group: "Sweet",
          date: "2026-01-01",
          zomatoQty: 2.5,
          swiggyQty: 1.8,
          diningQty: 4.2,
          parcelQty: 3.1,
        }
      ],
      count: 1,
    });
  });

  // Supply Note routes
  app.post("/api/supply-note/upload", handleSupplyNoteUpload);
  app.get("/api/supply-note/status", handleSupplyNoteStatus);
  app.delete("/api/supply-note/delete", handleSupplyNoteDelete);
  app.get("/api/supply-note/list", handleSupplyNoteList);
  app.post("/api/supply-note/qty-by-items", handleSupplyNoteQtyByItems);
  app.post("/api/supply-note/fix-dates", handleFixSupplyNoteDates);

  // Sales routes
  app.get("/api/sales/debug-raw", handleDebugItemSalesRaw);
  app.get("/api/sales/debug-parcel/:itemId", handleDebugParcelData);
  app.get("/api/sales/debug-all/:itemId", handleDebugAllData);
  app.get("/api/sales", handleGetSales);
  app.get("/api/sales/restaurants", handleGetRestaurants);
  app.get("/api/sales/summary", handleGetSalesSummary);
  app.get("/api/sales/daily-report", handleGetDailyReport);
  app.post("/api/sales/bulk", handleGetBulkSales);
  app.get("/api/sales/item/:itemId", handleGetItemSales);
  app.get("/api/sales/monthly/:itemId", handleGetMonthlySales);
  app.get("/api/sales/daily/:itemId/:month", handleGetDailySales);
  app.delete("/api/sales/item/:itemId", handleResetItemSales);
  app.delete("/api/sales/clear-all", handleClearAllPetpoojaData);
  app.post("/api/sales", handleRecordSale);

  // 404 handler
  app.use((req, res) => {
    console.warn(`⚠️ 404 Not Found: ${req.method} ${req.path}`);
    res.status(404).json({ error: "Not found", path: req.path });
  });

  // Error handling middleware
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error("Server error:", err);
      res
        .status(500)
        .json({ error: "Internal server error", message: err?.message || String(err) });
    },
  );

  return app;
}
