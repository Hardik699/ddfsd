import { RequestHandler } from "express";
import { getDatabase } from "../db";
import { cache, CACHE_KEYS } from "../cache";

// Create or get items collection
async function getItemsCollection() {
  const db = await getDatabase();
  return db.collection("items");
}

// Create or get dropdowns collection
async function getDropdownsCollection() {
  const db = await getDatabase();
  return db.collection("item_dropdowns");
}

// Get all items with ULTRA-FAST caching
export const handleGetItems: RequestHandler = async (req, res) => {
  try {
    // Check cache first - INSTANT response if cached
    const cachedItems = cache.get(CACHE_KEYS.ITEMS_ALL);
    if (cachedItems) {
      console.log(`⚡ CACHE HIT: Returning ${cachedItems.length} items instantly`);
      return res.json(cachedItems);
    }

    console.log("🔄 CACHE MISS: Fetching from database...");
    const collection = await getItemsCollection();
    
    // Ultra-optimized query with minimal projection
    const items = await collection.find({}, {
      projection: {
        itemId: 1,
        itemName: 1,
        group: 1,
        category: 1,
        shortCode: 1,
        unitType: 1,
        saleType: 1,
        itemType: 1,
        supplyNoteSku: 1,
        variations: {
          $slice: ["$variations", 10] // Limit variations for speed
        },
        updatedAt: 1
      }
    })
    .sort({ updatedAt: -1 })
    .limit(2000) // Limit for ultra-fast response
    .toArray();

    if (items.length === 0) {
      console.warn("⚠️ No items found in database");
      return res.json([]);
    }

    console.log(`✅ Retrieved ${items.length} items from database`);

    // Process and cache for 5 minutes
    const processedItems = items.map((item: any) => {
      if (!item.itemId) {
        console.warn(`⚠️ Item missing itemId: ${item.itemName}`);
      }
      return item;
    });

    // Cache for ultra-fast future requests
    cache.set(CACHE_KEYS.ITEMS_ALL, processedItems, 300); // 5 minutes
    console.log("💾 Cached items for ultra-fast access");

    const responseSize = JSON.stringify(processedItems).length;
    console.log(`📤 Items response size: ${(responseSize / 1024).toFixed(2)} KB`);

    res.json(processedItems);
  } catch (error) {
    console.error("❌ Error fetching items:", error);
    res.status(500).json({
      error: "Failed to fetch items",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Get a single item by ID
export const handleGetItemById: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      return res.status(400).json({ error: "itemId is required" });
    }

    const collection = await getItemsCollection();
    const item = await collection.findOne({ itemId });

    if (!item) {
      return res
        .status(404)
        .json({ error: `Item with ID "${itemId}" not found` });
    }

    console.log(`✅ Retrieved item ${itemId}: ${(item as any).itemName}`);
    res.json(item);
  } catch (error) {
    console.error("❌ Error fetching item:", error);
    res.status(500).json({
      error: "Failed to fetch item",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Create a new item
export const handleCreateItem: RequestHandler = async (req, res) => {
  try {
    const item = req.body;

    // Validate required fields
    if (!item.itemId || !item.itemName || !item.group || !item.category) {
      console.error("❌ Missing required fields:", {
        itemId: item.itemId,
        itemName: item.itemName,
        group: item.group,
        category: item.category,
      });
      return res.status(400).json({ error: "Missing required fields" });
    }

    const collection = await getItemsCollection();

    // Check if item already exists
    const existing = await collection.findOne({ itemId: item.itemId });
    if (existing) {
      console.warn(`⚠️ Item ${item.itemId} already exists`);
      return res
        .status(409)
        .json({ error: "Item with this ID already exists" });
    }

    const documentToInsert = {
      ...item,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(`📝 Inserting item ${item.itemId}:`, {
      itemName: item.itemName,
      group: item.group,
      category: item.category,
      variations: item.variations?.length || 0,
    });

    const result = await collection.insertOne(documentToInsert);

    console.log(
      `✅ Item ${item.itemId} created with MongoDB ID:`,
      result.insertedId,
    );

    // Invalidate cache
    cache.delete(CACHE_KEYS.ITEMS_ALL);

    // Ensure itemId is included in the response
    const responseItem = { ...item, _id: result.insertedId };
    console.log(`📤 Sending response:`, {
      itemId: responseItem.itemId,
      itemName: responseItem.itemName,
    });

    res.status(201).json(responseItem);
  } catch (error) {
    console.error("❌ Error creating item:", error);
    res.status(500).json({
      error: "Failed to create item",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Update an item
// Helper: compute diff between old and new item
function computeDiff(oldItem: any, newItem: any): Array<{ field: string; oldValue: any; newValue: any }> {
  const changes: Array<{ field: string; oldValue: any; newValue: any }> = [];
  const SKIP = ["updatedAt", "createdAt", "_id"];

  // Normalize value for comparison (coerce strings to numbers where possible)
  const normalize = (v: any): any => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
    return v;
  };

  const compareValues = (key: string, oldVal: any, newVal: any) => {
    const o = normalize(oldVal);
    const n = normalize(newVal);
    if (JSON.stringify(o) !== JSON.stringify(n)) {
      changes.push({ field: key, oldValue: oldVal ?? null, newValue: newVal ?? null });
    }
  };

  const allKeys = new Set([...Object.keys(oldItem || {}), ...Object.keys(newItem || {})]);
  for (const key of allKeys) {
    if (SKIP.includes(key)) continue;
    if (key === "variations") {
      const oldVars = oldItem.variations || [];
      const newVars = newItem.variations || [];
      const maxLen = Math.max(oldVars.length, newVars.length);
      for (let i = 0; i < maxLen; i++) {
        const ov = oldVars[i];
        const nv = newVars[i];
        if (!ov) { changes.push({ field: `variation[${i}]`, oldValue: null, newValue: nv }); continue; }
        if (!nv) { changes.push({ field: `variation[${i}]`, oldValue: ov, newValue: null }); continue; }
        const varKeys = new Set([...Object.keys(ov), ...Object.keys(nv)]);
        for (const vk of varKeys) {
          if (vk === "channels") {
            // Compare each channel price
            const oldCh = ov.channels || {};
            const newCh = nv.channels || {};
            const chKeys = new Set([...Object.keys(oldCh), ...Object.keys(newCh)]);
            for (const ch of chKeys) {
              if (normalize(oldCh[ch]) !== normalize(newCh[ch])) {
                changes.push({
                  field: `variation[${i}](${ov.value || i}).channels.${ch}`,
                  oldValue: oldCh[ch] ?? null,
                  newValue: newCh[ch] ?? null,
                });
              }
            }
          } else {
            const o2 = normalize(ov[vk]);
            const n2 = normalize(nv[vk]);
            if (JSON.stringify(o2) !== JSON.stringify(n2)) {
              changes.push({
                field: `variation[${i}](${ov.value || i}).${vk}`,
                oldValue: ov[vk] ?? null,
                newValue: nv[vk] ?? null,
              });
            }
          }
        }
      }
    } else {
      compareValues(key, oldItem?.[key], newItem?.[key]);
    }
  }
  return changes;
}

export const handleUpdateItem: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;
    const updateData = req.body;
    const changedBy = req.headers["x-user"] as string || "unknown";
    const clientIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();

    const collection = await getItemsCollection();

    // Fetch old item for diff
    const oldItem = await collection.findOne({ itemId });
    if (!oldItem) {
      return res.status(404).json({ error: "Item not found" });
    }

    const result = await collection.updateOne(
      { itemId },
      { $set: { ...updateData, updatedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Invalidate cache so next fetch gets fresh data
    cache.delete(CACHE_KEYS.ITEMS_ALL);
    console.log("🗑️ Cache invalidated after item update");

    // Save change log
    try {
      const db = await getDatabase();
      const logsCollection = db.collection("itemLogs");
      const changes = computeDiff(oldItem, updateData);
      await logsCollection.insertOne({
        itemId,
        itemName: oldItem.itemName,
        changedBy,
        clientIp,
        changedAt: new Date(),
        changes: changes.length > 0 ? changes : [{ field: "updated", oldValue: null, newValue: "saved" }],
      });
      console.log(`📝 Logged ${changes.length} changes for item ${itemId}`);
    } catch (logErr) {
      console.warn("⚠️ Failed to save item log:", logErr);
    }

    res.json({ message: "Item updated successfully" });
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ error: "Failed to update item" });
  }
}

// Bulk update sale types from Excel
export const handleBulkUpdateSaleTypes: RequestHandler = async (req, res) => {
  try {
    const { updates } = req.body; // Array of { itemId, sapCode?, newSaleType }
    const changedBy = req.headers["x-user"] as string || "system";
    const clientIp = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown").split(",")[0].trim();

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "Updates array is required" });
    }

    const collection = await getItemsCollection();
    const db = await getDatabase();
    const logsCollection = db.collection("itemLogs");

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const update of updates) {
      try {
        const { itemId, sapCode, newSaleType } = update;

        if (!itemId || !newSaleType || !["QTY", "KG"].includes(newSaleType)) {
          errors.push(`Invalid update data for item ${itemId}`);
          errorCount++;
          continue;
        }

        // Find the item
        const item = await collection.findOne({ itemId });
        if (!item) {
          errors.push(`Item not found: ${itemId}`);
          errorCount++;
          continue;
        }

        let updateQuery: any = {};
        let logChanges: any[] = [];

        if (sapCode && sapCode.trim() !== "") {
          // Update specific variation by SAP code
          const variationIndex = item.variations?.findIndex((v: any) => v.sapCode === sapCode);
          if (variationIndex >= 0) {
            const oldSaleType = item.variations[variationIndex].saleType || item.saleType || "QTY";
            if (oldSaleType !== newSaleType) {
              updateQuery[`variations.${variationIndex}.saleType`] = newSaleType;
              logChanges.push({
                field: `variation[${sapCode}].saleType`,
                oldValue: oldSaleType,
                newValue: newSaleType
              });
            }
          } else {
            errors.push(`Variation with SAP code ${sapCode} not found in item ${itemId}`);
            errorCount++;
            continue;
          }
        } else {
          // Update item-level sale type
          const oldSaleType = item.saleType || "QTY";
          if (oldSaleType !== newSaleType) {
            updateQuery.saleType = newSaleType;
            logChanges.push({
              field: "saleType",
              oldValue: oldSaleType,
              newValue: newSaleType
            });
          }
        }

        // Only update if there are changes
        if (Object.keys(updateQuery).length > 0) {
          updateQuery.updatedAt = new Date();
          
          const result = await collection.updateOne(
            { itemId },
            { $set: updateQuery }
          );

          if (result.matchedCount > 0) {
            // Log the change
            await logsCollection.insertOne({
              itemId,
              itemName: item.itemName,
              changedBy,
              clientIp,
              changedAt: new Date(),
              changes: logChanges,
            });
            successCount++;
          } else {
            errors.push(`Failed to update item ${itemId}`);
            errorCount++;
          }
        } else {
          // No changes needed
          successCount++;
        }
      } catch (error) {
        console.error(`Error updating item ${update.itemId}:`, error);
        errors.push(`Error updating item ${update.itemId}: ${error instanceof Error ? error.message : "Unknown error"}`);
        errorCount++;
      }
    }

    console.log(`📊 Bulk sale type update completed: ${successCount} success, ${errorCount} errors`);

    res.json({
      success: true,
      message: `Updated ${successCount} items successfully`,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Error in bulk sale type update:", error);
    res.status(500).json({ error: "Failed to update sale types" });
  }
}

export const handleGetItemLogs: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;
    const db = await getDatabase();
    const logsCollection = db.collection("itemLogs");
    const logs = await logsCollection
      .find({ itemId })
      .sort({ changedAt: -1 })
      .limit(100)
      .toArray();
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error("Error fetching item logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
};

// Delete an item
export const handleDeleteItem: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;

    if (!itemId) {
      console.error("❌ Delete request missing itemId");
      return res.status(400).json({ error: "itemId is required" });
    }

    console.log(`🗑️ Deleting item: ${itemId}`);

    const collection = await getItemsCollection();

    const result = await collection.deleteOne({ itemId });

    if (result.deletedCount === 0) {
      console.warn(`⚠️ Item ${itemId} not found for deletion`);
      return res.status(404).json({ error: "Item not found" });
    }

    console.log(`✅ Item ${itemId} deleted successfully`);
    cache.delete(CACHE_KEYS.ITEMS_ALL);
    res.json({ message: "Item deleted successfully", deletedCount: result.deletedCount });
  } catch (error) {
    console.error(`❌ Error deleting item ${req.params.itemId}:`, error);
    res.status(500).json({
      error: "Failed to delete item",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Migrate all items to add GS1 channel to variations
export const handleAddGS1Channel: RequestHandler = async (req, res) => {
  try {
    const collection = await getItemsCollection();

    // Find all items with variations
    const items = await collection.find({}).toArray();

    let updatedCount = 0;
    let variationsUpdated = 0;

    for (const item of items) {
      if (item.variations && Array.isArray(item.variations)) {
        let hasChanges = false;

        // Update each variation to add GS1 channel if it doesn't exist
        const updatedVariations = item.variations.map((variation: any) => {
          if (!variation.channels) {
            variation.channels = {};
          }

          if (!("GS1" in variation.channels)) {
            variation.channels.GS1 = 0;
            hasChanges = true;
            variationsUpdated++;
          }

          return variation;
        });

        // If changes were made, update the item in the database
        if (hasChanges) {
          await collection.updateOne(
            { _id: item._id },
            { $set: { variations: updatedVariations, updatedAt: new Date() } },
          );
          updatedCount++;
        }
      }
    }

    console.log(
      `✅ Migration complete: Updated ${updatedCount} items, added GS1 channel to ${variationsUpdated} variations`,
    );

    res.json({
      success: true,
      message: `Successfully added GS1 channel to ${variationsUpdated} variations across ${updatedCount} items`,
      updatedItems: updatedCount,
      variationsUpdated,
    });
  } catch (error) {
    console.error("Error adding GS1 channel:", error);
    res.status(500).json({
      error: "Failed to add GS1 channel",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

// Get all dropdown options (groups, categories, HSN codes, variation values)
export const handleGetDropdowns: RequestHandler = async (req, res) => {
  try {
    const collection = await getDropdownsCollection();

    const dropdowns = await collection.findOne({ _id: "main" } as any);

    if (!dropdowns) {
      return res.json({
        groups: [],
        categories: [],
        hsnCodes: [],
        variationValues: [],
      });
    }

    res.json({
      groups: dropdowns.groups || [],
      categories: dropdowns.categories || [],
      hsnCodes: dropdowns.hsnCodes || [],
      variationValues: dropdowns.variationValues || [],
    });
  } catch (error) {
    console.error("Error fetching dropdowns:", error);
    res.status(500).json({ error: "Failed to fetch dropdowns" });
  }
};

// Add a new group
export const handleAddGroup: RequestHandler = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const collection = await getDropdownsCollection();

    const result = await collection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { groups: name.trim() },
        $setOnInsert: {
          categories: [],
          hsnCodes: [],
          variationValues: [],
        },
      },
      { upsert: true },
    );

    res.status(201).json({ message: "Group added successfully" });
  } catch (error) {
    console.error("Error adding group:", error);
    res.status(500).json({ error: "Failed to add group" });
  }
};

// Add a new category
export const handleAddCategory: RequestHandler = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const collection = await getDropdownsCollection();

    await collection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { categories: name.trim() },
        $setOnInsert: {
          groups: [],
          hsnCodes: [],
          variationValues: [],
        },
      },
      { upsert: true },
    );

    res.status(201).json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ error: "Failed to add category" });
  }
};

// Add a new HSN code
export const handleAddHsnCode: RequestHandler = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: "HSN code is required" });
    }

    const collection = await getDropdownsCollection();

    await collection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { hsnCodes: code.trim() },
        $setOnInsert: {
          groups: [],
          categories: [],
          variationValues: [],
        },
      },
      { upsert: true },
    );

    res.status(201).json({ message: "HSN code added successfully" });
  } catch (error) {
    console.error("Error adding HSN code:", error);
    res.status(500).json({ error: "Failed to add HSN code" });
  }
};

// Add a new variation value
export const handleAddVariationValue: RequestHandler = async (req, res) => {
  try {
    const { value } = req.body;

    if (!value || !value.trim()) {
      return res.status(400).json({ error: "Variation value is required" });
    }

    const collection = await getDropdownsCollection();

    await collection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { variationValues: value.trim() },
        $setOnInsert: {
          groups: [],
          categories: [],
          hsnCodes: [],
        },
      },
      { upsert: true },
    );

    res.status(201).json({ message: "Variation value added successfully" });
  } catch (error) {
    console.error("Error adding variation value:", error);
    res.status(500).json({ error: "Failed to add variation value" });
  }
};

// Get group categories
export const handleGetGroupCategories: RequestHandler = async (req, res) => {
  try {
    const { groupName } = req.params;

    if (!groupName) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const db = await getDatabase();
    const collection = db.collection("group_categories");

    const groupData = await collection.findOne({ groupName: decodeURIComponent(groupName) });

    if (!groupData) {
      return res.json({ categories: [] });
    }

    res.json({ categories: groupData.categories || [] });
  } catch (error) {
    console.error("Error fetching group categories:", error);
    res.status(500).json({ error: "Failed to fetch group categories" });
  }
};

// Update a group
export const handleUpdateGroup: RequestHandler = async (req, res) => {
  try {
    const { groupName } = req.params;
    const { newName, categories } = req.body;

    const decodedGroupName = decodeURIComponent(groupName);

    const db = await getDatabase();
    const dropdownsCollection = await getDropdownsCollection();
    const groupCategoriesCollection = db.collection("group_categories");

    // If group name is being changed, update it in the groups array
    if (newName && newName !== decodedGroupName) {
      await dropdownsCollection.updateOne(
        { _id: "main" } as any,
        {
          $pull: { groups: decodedGroupName },
          $addToSet: { groups: newName },
        } as any,
      );

      // Also update the group categories mapping
      await groupCategoriesCollection.updateOne(
        { groupName: decodedGroupName },
        { $set: { groupName: newName, categories: categories || [] } },
        { upsert: true },
      );

      // Update all items that reference this group
      const itemsCollection = await getItemsCollection();
      await itemsCollection.updateMany(
        { group: decodedGroupName },
        { $set: { group: newName } },
      );
    } else {
      // Just update the categories for the group
      await groupCategoriesCollection.updateOne(
        { groupName: decodedGroupName },
        { $set: { categories: categories || [] } },
        { upsert: true },
      );
    }

    res.json({ message: "Group updated successfully" });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({ error: "Failed to update group" });
  }
};

// Update a category
export const handleUpdateCategory: RequestHandler = async (req, res) => {
  try {
    const { categoryName } = req.params;
    const { newName } = req.body;

    const decodedCategoryName = decodeURIComponent(categoryName);

    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: "New category name is required" });
    }

    const dropdownsCollection = await getDropdownsCollection();
    const itemsCollection = await getItemsCollection();

    // Update in dropdowns
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $pull: { categories: decodedCategoryName },
      } as any
    );
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { categories: newName.trim() },
      } as any
    );

    // Update all items that reference this category
    await itemsCollection.updateMany(
      { category: decodedCategoryName },
      { $set: { category: newName.trim() } }
    );

    res.json({ message: "Category updated successfully" });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
};

// Update an HSN code
export const handleUpdateHsnCode: RequestHandler = async (req, res) => {
  try {
    const { code } = req.params;
    const { newCode } = req.body;

    const decodedCode = decodeURIComponent(code);

    if (!newCode || !newCode.trim()) {
      return res.status(400).json({ error: "New HSN code is required" });
    }

    const dropdownsCollection = await getDropdownsCollection();
    const itemsCollection = await getItemsCollection();

    // Update in dropdowns
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $pull: { hsnCodes: decodedCode },
      } as any
    );
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { hsnCodes: newCode.trim() },
      } as any
    );

    // Update all items that reference this HSN code
    await itemsCollection.updateMany(
      { hsnCode: decodedCode },
      { $set: { hsnCode: newCode.trim() } }
    );

    res.json({ message: "HSN code updated successfully" });
  } catch (error) {
    console.error("Error updating HSN code:", error);
    res.status(500).json({ error: "Failed to update HSN code" });
  }
};

// Update a variation value
export const handleUpdateVariationValue: RequestHandler = async (req, res) => {
  try {
    const { value } = req.params;
    const { newValue } = req.body;

    const decodedValue = decodeURIComponent(value);

    if (!newValue || !newValue.trim()) {
      return res.status(400).json({ error: "New variation value is required" });
    }

    const dropdownsCollection = await getDropdownsCollection();
    const itemsCollection = await getItemsCollection();

    // Update in dropdowns
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $pull: { variationValues: decodedValue },
      } as any
    );
    await dropdownsCollection.updateOne(
      { _id: "main" } as any,
      {
        $addToSet: { variationValues: newValue.trim() },
      } as any
    );

    // Update all items that have variations with this value
    // This is more complex because variations is an array of objects
    await itemsCollection.updateMany(
      { "variations.value": decodedValue },
      { $set: { "variations.$[elem].value": newValue.trim() } },
      { arrayFilters: [{ "elem.value": decodedValue }] }
    );

    res.json({ message: "Variation value updated successfully" });
  } catch (error) {
    console.error("Error updating variation value:", error);
    res.status(500).json({ error: "Failed to update variation value" });
  }
};
