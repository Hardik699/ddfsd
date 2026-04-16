import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";

const CHANNELS = ["Dining", "Parcale", "Swiggy", "Zomato", "GS1"];
const ITEM_TYPES = ["Service", "Goods"];
const UNIT_TYPES = ["Single Count", "GM to KG", "All Count"];
const GST_OPTIONS = ["0%", "5%", "12%", "18%", "28%"];
const HSN_CODES = [
  "1001",
  "1002",
  "1003",
  "1004",
  "1005",
  "2101",
  "2102",
  "2201",
  "2202",
  "2301",
];
const VARIATION_VALUES = [
  "200 Gms",
  "250 Gms",
  "500 Gms",
  "1 Kg",
  "500 ml",
  "1 L",
  "2 L",
];

// Helper function to calculate auto pricing
const calculateAutoPrices = (basePrice: number) => {
  if (basePrice <= 0) return { Zomato: 0, Swiggy: 0, GS1: 0 };

  // Round to nearest 5
  const roundToNearest5 = (price: number) => {
    return Math.round(price / 5) * 5;
  };

  // Add 15% markup for Zomato and Swiggy
  const priceWith15Percent = basePrice * 1.15;
  const autoPriceZomato = roundToNearest5(priceWith15Percent);
  const autoPriceSwiggy = roundToNearest5(priceWith15Percent);

  // Add 20% markup for GS1
  const priceWith20Percent = basePrice * 1.20;
  const autoPriceGS1 = roundToNearest5(priceWith20Percent);

  return { Zomato: autoPriceZomato, Swiggy: autoPriceSwiggy, GS1: autoPriceGS1 };
};

interface Variation {
  id: string;
  name: string;
  value: string;
  area?: string;
  channels: Record<string, number>;
  price: number;
  sapCode: string;
  gs1Code?: string;
  saleType?: "QTY" | "KG";
  profitMargin: number;
  gs1Enabled?: boolean;
  salesHistory?: Array<{
    date: string;
    channel: "Dining" | "Parcel" | "Online";
    quantity: number;
    value: number;
    category?: string;
  }>;
}

export default function ItemEdit() {
  const params = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const itemId = params.itemId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [itemName, setItemName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [description, setDescription] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [supplyNoteSku, setSupplyNoteSku] = useState("");
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [profitMargin, setProfitMargin] = useState("");
  const [gst, setGst] = useState("");
  const [itemType, setItemType] = useState("Goods");
  const [unitType, setUnitType] = useState("Single Count");
  const [variations, setVariations] = useState<Variation[]>([]);

  const [activeTab, setActiveTab] = useState<"general" | "variations" | "images">("general");

  const [groups, setGroups] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [hsnCodes, setHsnCodes] = useState<string[]>(HSN_CODES);
  const [variationValues, setVariationValues] =
    useState<string[]>(VARIATION_VALUES);

  const [newGroup, setNewGroup] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newHsnCode, setNewHsnCode] = useState("");
  const [newVariationValue, setNewVariationValue] = useState("");

  // Dropdown editing
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [groupCategories, setGroupCategories] = useState<string[]>([]);
  const [newGroupCategory, setNewGroupCategory] = useState("");
  const [selectedGroupForEdit, setSelectedGroupForEdit] = useState("");

  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [selectedCategoryForEdit, setSelectedCategoryForEdit] = useState("");

  const [showEditHsnCodeModal, setShowEditHsnCodeModal] = useState(false);
  const [editingHsnCode, setEditingHsnCode] = useState("");
  const [selectedHsnCodeForEdit, setSelectedHsnCodeForEdit] = useState("");

  const [showEditVariationValueModal, setShowEditVariationValueModal] = useState(false);
  const [editingVariationValue, setEditingVariationValue] = useState("");
  const [selectedVariationValueForEdit, setSelectedVariationValueForEdit] = useState("");

  // Helper to capitalize first letter of each word
  const toTitleCase = (str: string) => {
    return str.replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Images with channel info
  interface ImageWithChannel {
    file?: File;
    preview: string;
    channel: string;
  }

  const [images, setImages] = useState<ImageWithChannel[]>([]);
  const [selectedImageChannel, setSelectedImageChannel] = useState("Website");
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [tempFileInput, setTempFileInput] = useState<HTMLInputElement | null>(null);

  // Load dropdown data
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const response = await fetch("/api/items/dropdowns");
        if (response.ok) {
          const data = await response.json();
          if (data.groups) setGroups(data.groups);
          if (data.categories) setCategories(data.categories);
          if (data.hsnCodes) setHsnCodes(data.hsnCodes);
          if (data.variationValues) setVariationValues(data.variationValues);
        }
      } catch (error) {
        console.error("Failed to load dropdown data:", error);
      }
    };

    loadDropdownData();
  }, []);

  // Load item data
  useEffect(() => {
    const fetchItem = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch single item directly by ID
        const response = await fetch(`/api/items/${itemId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError(`Item with ID "${itemId}" not found`);
          } else {
            throw new Error("Failed to fetch item");
          }
          return;
        }

        const foundItem = await response.json();

        // Populate form with item data
        setItemName(foundItem.itemName);
        setShortCode(foundItem.shortCode);
        setDescription(foundItem.description || "");
        setHsnCode(foundItem.hsnCode || "");
        setSupplyNoteSku(foundItem.supplyNoteSku || "");
        setGroup(foundItem.group);
        setCategory(foundItem.category);
        setProfitMargin(foundItem.profitMargin?.toString() || "");
        // Format GST with % sign to match dropdown options
        const gstValue = foundItem.gst ? `${foundItem.gst}%` : "";
        setGst(gstValue);
        setItemType(foundItem.itemType || "Goods");
        setUnitType(foundItem.unitType || "Single Count");

        // Load existing images with channel info
        if (foundItem.images && Array.isArray(foundItem.images)) {
          const imageList = foundItem.images.map((img: any) => {
            // Handle both old format (string) and new format (object with url and channel)
            if (typeof img === "string") {
              return { preview: img, channel: "Website" };
            } else {
              return { preview: img.url || img.preview, channel: img.channel || "Website" };
            }
          });
          setImages(imageList);
        }

        // Load variations with auto-calculated prices
        if (foundItem.variations && Array.isArray(foundItem.variations)) {
          setVariations(
            foundItem.variations.map((v: any) => {
              const basePrice = v.price || 0;
              const autoPrices = calculateAutoPrices(basePrice);
              const gs1Enabled = v.channels?.GS1 && v.channels.GS1 > 0 ? true : false;

              // Ensure all channels are initialized
              const initialChannels = CHANNELS.reduce(
                (acc, ch) => ({ ...acc, [ch]: v.channels?.[ch] ?? 0 }),
                {} as Record<string, number>
              );

              return {
                id: v.id || Date.now().toString(),
                name: v.name || "",
                value: v.value || "",
                area: v.area || "",
                channels: {
                  ...initialChannels,
                  // Base price for Dining and Parcel (if not already set)
                  Dining: v.channels?.Dining ?? basePrice,
                  Parcale: v.channels?.Parcale ?? basePrice,
                  // Auto-calculated prices for Zomato and Swiggy (+15%)
                  Zomato: autoPrices.Zomato,
                  Swiggy: autoPrices.Swiggy,
                  // Include GS1 if it's enabled (+20%)
                  ...(gs1Enabled && { GS1: autoPrices.GS1 }),
                },
                price: basePrice,
                sapCode: v.sapCode || "",
                gs1Code: v.gs1Code || "",
                saleType: v.saleType || "QTY",
                profitMargin: v.profitMargin || 0,
                gs1Enabled: gs1Enabled,
                salesHistory: v.salesHistory || [],
              };
            }),
          );
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load item";
        console.error("Error loading item:", errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      fetchItem();
    }
  }, [itemId]);

  const openEditGroupModal = async (groupName: string) => {
    setSelectedGroupForEdit(groupName);
    setEditingGroupName(groupName);
    try {
      const response = await fetch(`/api/items/groups/${encodeURIComponent(groupName)}`);
      if (response.ok) {
        const data = await response.json();
        setGroupCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Failed to fetch group categories:", error);
      setGroupCategories([]);
    }
    setShowEditGroupModal(true);
  };

  const saveGroupChanges = async () => {
    try {
      const response = await fetch(`/api/items/groups/${encodeURIComponent(selectedGroupForEdit)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newName: editingGroupName,
          categories: groupCategories
        }),
      });
      if (response.ok) {
        // Update groups array if name changed
        if (editingGroupName !== selectedGroupForEdit) {
          const updated = groups.map(g => g === selectedGroupForEdit ? editingGroupName : g);
          setGroups(updated);
          if (group === selectedGroupForEdit) {
            setGroup(editingGroupName);
          }
        }
        setShowEditGroupModal(false);
        setNewGroupCategory("");
      }
    } catch (error) {
      console.error("Failed to save group changes:", error);
    }
  };

  const addCategoryToGroup = () => {
    if (newGroupCategory.trim() && !groupCategories.includes(newGroupCategory)) {
      setGroupCategories([...groupCategories, newGroupCategory]);
      setNewGroupCategory("");
    }
  };

  const removeCategoryFromGroup = (categoryName: string) => {
    setGroupCategories(groupCategories.filter(c => c !== categoryName));
  };

  const openEditCategoryModal = (categoryName: string) => {
    setSelectedCategoryForEdit(categoryName);
    setEditingCategoryName(categoryName);
    setShowEditCategoryModal(true);
  };

  const saveCategoryChanges = async () => {
    try {
      const response = await fetch(`/api/items/categories/${encodeURIComponent(selectedCategoryForEdit)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: editingCategoryName }),
      });
      if (response.ok) {
        const updated = categories.map(c => c === selectedCategoryForEdit ? editingCategoryName : c);
        setCategories(updated);
        if (category === selectedCategoryForEdit) {
          setCategory(editingCategoryName);
        }
        setShowEditCategoryModal(false);
      }
    } catch (error) {
      console.error("Failed to save category changes:", error);
    }
  };

  const openEditHsnCodeModal = (code: string) => {
    setSelectedHsnCodeForEdit(code);
    setEditingHsnCode(code);
    setShowEditHsnCodeModal(true);
  };

  const saveHsnCodeChanges = async () => {
    try {
      console.log(`🔄 Saving HSN code: "${selectedHsnCodeForEdit}" -> "${editingHsnCode}"`);

      let response;
      try {
        response = await fetch(`/api/items/hsn-codes/${encodeURIComponent(selectedHsnCodeForEdit)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newCode: editingHsnCode }),
        });
      } catch (fetchError) {
        console.error("❌ Network error during fetch:", fetchError);
        alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`❌ Server error ${response.status}:`, errorText);
        alert(`Error saving HSN code: ${response.status} ${response.statusText}`);
        return;
      }

      const updated = hsnCodes.map(c => c === selectedHsnCodeForEdit ? editingHsnCode : c);
      setHsnCodes(updated);
      if (hsnCode === selectedHsnCodeForEdit) {
        setHsnCode(editingHsnCode);
      }
      setShowEditHsnCodeModal(false);
      console.log("✅ HSN code saved successfully");
    } catch (error) {
      console.error("❌ Failed to save HSN code changes:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Failed to save HSN code"}`);
    }
  };

  const openEditVariationValueModal = (value: string) => {
    setSelectedVariationValueForEdit(value);
    setEditingVariationValue(value);
    setShowEditVariationValueModal(true);
  };

  const saveVariationValueChanges = async () => {
    try {
      console.log(`🔄 Saving variation value: "${selectedVariationValueForEdit}" -> "${editingVariationValue}"`);

      let response;
      try {
        response = await fetch(`/api/items/variation-values/${encodeURIComponent(selectedVariationValueForEdit)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newValue: editingVariationValue }),
        });
      } catch (fetchError) {
        console.error("❌ Network error during fetch:", fetchError);
        alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`❌ Server error ${response.status}:`, errorText);
        alert(`Error saving variation value: ${response.status} ${response.statusText}`);
        return;
      }

      const updated = variationValues.map(v => v === selectedVariationValueForEdit ? editingVariationValue : v);
      setVariationValues(updated);

      // Update variation values in current state
      setVariations(variations.map(v => v.value === selectedVariationValueForEdit ? { ...v, value: editingVariationValue } : v));

      setShowEditVariationValueModal(false);
      console.log("✅ Variation value saved successfully");
    } catch (error) {
      console.error("❌ Failed to save variation value changes:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Failed to save variation value"}`);
    }
  };

  const addGroup = async () => {
    if (newGroup.trim() && !groups.includes(newGroup)) {
      try {
        console.log(`🔄 Adding new group: "${newGroup}"`);

        let response;
        try {
          response = await fetch("/api/items/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newGroup }),
          });
        } catch (fetchError) {
          console.error("❌ Network error during fetch:", fetchError);
          alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error(`❌ Server error ${response.status}:`, errorText);
          alert(`Error adding group: ${response.status} ${response.statusText}`);
          return;
        }

        const updated = [...groups, newGroup];
        setGroups(updated);
        setGroup(newGroup);
        setNewGroup("");
        console.log("✅ Group added successfully");
      } catch (error) {
        console.error("❌ Failed to add group:", error);
        alert(`Error: ${error instanceof Error ? error.message : "Failed to add group"}`);
      }
    }
  };

  const addCategory = async () => {
    if (newCategory.trim() && !categories.includes(newCategory)) {
      try {
        console.log(`🔄 Adding new category: "${newCategory}"`);

        let response;
        try {
          response = await fetch("/api/items/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newCategory }),
          });
        } catch (fetchError) {
          console.error("❌ Network error during fetch:", fetchError);
          alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error(`❌ Server error ${response.status}:`, errorText);
          alert(`Error adding category: ${response.status} ${response.statusText}`);
          return;
        }

        const updated = [...categories, newCategory];
        setCategories(updated);
        setCategory(newCategory);
        setNewCategory("");
        console.log("✅ Category added successfully");
      } catch (error) {
        console.error("❌ Failed to add category:", error);
        alert(`Error: ${error instanceof Error ? error.message : "Failed to add category"}`);
      }
    }
  };

  const addHsnCode = async () => {
    if (newHsnCode.trim() && !hsnCodes.includes(newHsnCode)) {
      try {
        console.log(`🔄 Adding new HSN code: "${newHsnCode}"`);

        let response;
        try {
          response = await fetch("/api/items/hsn-codes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: newHsnCode }),
          });
        } catch (fetchError) {
          console.error("❌ Network error during fetch:", fetchError);
          alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error(`❌ Server error ${response.status}:`, errorText);
          alert(`Error adding HSN code: ${response.status} ${response.statusText}`);
          return;
        }

        const updated = [...hsnCodes, newHsnCode];
        setHsnCodes(updated);
        setHsnCode(newHsnCode);
        setNewHsnCode("");
        console.log("✅ HSN code added successfully");
      } catch (error) {
        console.error("❌ Failed to add HSN code:", error);
        alert(`Error: ${error instanceof Error ? error.message : "Failed to add HSN code"}`);
      }
    }
  };

  const addVariationValue = async () => {
    if (
      newVariationValue.trim() &&
      !variationValues.includes(newVariationValue)
    ) {
      try {
        console.log(`🔄 Adding new variation value: "${newVariationValue}"`);

        let response;
        try {
          response = await fetch("/api/items/variation-values", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: newVariationValue }),
          });
        } catch (fetchError) {
          console.error("❌ Network error during fetch:", fetchError);
          alert(`Network error: ${fetchError instanceof Error ? fetchError.message : "Failed to connect to server"}`);
          return;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error(`❌ Server error ${response.status}:`, errorText);
          alert(`Error adding variation value: ${response.status} ${response.statusText}`);
          return;
        }

        const updated = [...variationValues, newVariationValue];
        setVariationValues(updated);
        setNewVariationValue("");
        console.log("✅ Variation value added successfully");
      } catch (error) {
        console.error("❌ Failed to add variation value:", error);
        alert(`Error: ${error instanceof Error ? error.message : "Failed to add variation value"}`);
      }
    }
  };

  const addVariation = () => {
    const newVariation: Variation = {
      id: Date.now().toString(),
      name: "",
      value: "",
      area: "",
      channels: {
        Dining: 0,
        Parcale: 0,
        Swiggy: 0,
        Zomato: 0,
        GS1: 0,
      },
      price: 0,
      sapCode: "",
      gs1Code: "",
      saleType: "QTY",
      profitMargin: 0,
      gs1Enabled: false,
      salesHistory: [],
    };
    setVariations([...variations, newVariation]);
  };

  const updateVariation = (id: string, field: string, value: any) => {
    setVariations(
      variations.map((v) => {
        if (v.id !== id) return v;

        const updated = { ...v, [field]: value };

        // Auto-calculate prices when base price changes
        if (field === "price") {
          const autoPrices = calculateAutoPrices(value);
          // Ensure all channels exist in the object before updating
          const channelsWithDefaults = CHANNELS.reduce(
            (acc, ch) => ({ ...acc, [ch]: updated.channels?.[ch] ?? 0 }),
            {} as Record<string, number>
          );
          updated.channels = {
            ...channelsWithDefaults,
            // Base price for Dining and Parcel
            Dining: value || 0,
            Parcale: value || 0,
            // Auto-calculated prices for Zomato and Swiggy (+15%)
            Zomato: autoPrices.Zomato,
            Swiggy: autoPrices.Swiggy,
          };
          // Add GS1 price if GS1 is enabled (+20%)
          if (updated.gs1Enabled) {
            updated.channels.GS1 = autoPrices.GS1;
          }
        }

        // When GS1 is toggled, calculate or clear GS1 price
        if (field === "gs1Enabled") {
          if (value) {
            // Enable GS1: calculate auto price
            const autoPrices = calculateAutoPrices(updated.price);
            updated.channels.GS1 = autoPrices.GS1;
          } else {
            // Disable GS1: set to 0
            updated.channels.GS1 = 0;
          }
        }

        return updated;
      }),
    );
  };

  const updateChannelPrice = (id: string, channel: string, value: number) => {
    setVariations(
      variations.map((v) =>
        v.id === id
          ? { ...v, channels: { ...v.channels, [channel]: value } }
          : v,
      ),
    );
  };

  const removeVariation = (id: string) => {
    setVariations(variations.filter((v) => v.id !== id));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length > 0) {
      // Show modal to select channel
      setTempFileInput(e.target);
      setShowChannelModal(true);

      // Process files
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          setImages((prev) => [
            ...prev,
            {
              file: file,
              preview: event.target?.result as string,
              channel: selectedImageChannel,
            },
          ]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleChannelSelect = (channel: string) => {
    // Update the channel for newly uploaded images
    setSelectedImageChannel(channel);
    setShowChannelModal(false);

    // Reset input
    if (tempFileInput) {
      tempFileInput.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const updateImageChannel = (index: number, channel: string) => {
    setImages(
      images.map((img, i) =>
        i === index ? { ...img, channel } : img
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!itemName || !group || !category) {
      alert("Please fill all required fields");
      return;
    }

    // Format images with channel info
    const imageData = images.map((img) => ({
      url: img.preview,
      channel: img.channel,
    }));

    const updatedItem = {
      itemId,
      itemName,
      shortCode,
      description,
      hsnCode,
      supplyNoteSku,
      group,
      category,
      profitMargin: parseFloat(profitMargin) || 0,
      gst: parseFloat(gst) || 0,
      itemType,
      unitType,
      variations,
      images: imageData,
    };

    try {
      setSaving(true);
      console.log("📤 Updating item:", itemId);

      const response = await fetch(`/api/items/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user": localStorage.getItem("username") || "unknown",
        },
        body: JSON.stringify(updatedItem),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API returned ${response.status}`);
      }

      console.log("✅ Item updated successfully");
      navigate(`/items/${itemId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("❌ Failed to update item:", errorMessage);
      alert(`Error updating item: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 sm:p-8">
        <button
          onClick={() => navigate(`/items/${itemId}`)}
          className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Item
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">Loading item...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 sm:p-8">
        <button
          onClick={() => navigate("/items")}
          className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Items
        </button>
        <div className="bg-white rounded-xl border border-red-200 p-8">
          <div className="text-red-600">
            <p className="font-semibold text-lg">Error</p>
            <p className="text-sm mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 sm:p-8">
      <button
        onClick={() => navigate(`/items/${itemId}`)}
        className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Item
      </button>

      <div className="overflow-hidden transition-all duration-300 border border-gray-800 rounded-xl shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 hover:border-blue-600/50 bg-gray-950">
        <h1 className="text-3xl font-bold text-white mb-1 px-6 sm:px-8 pt-6 sm:pt-8 tracking-tight">Edit Item</h1>

        {/* Area-wise Price Summary Row (Vertical Stack per Area) */}
        {variations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 mt-3">
            {CHANNELS.map(channel => {
              const variation = variations[0];
              let price = variation.channels[channel];

              if (!price || price === 0) {
                if (["Zomato", "Swiggy", "GS1"].includes(channel)) {
                  const autoPrices = calculateAutoPrices(variation.price || 0);
                  price = autoPrices[channel as keyof typeof autoPrices];
                } else {
                  price = variation.price;
                }
              }

              if (!price) return null;

              return (
                <div key={channel} className="flex flex-col items-center min-w-[80px] bg-slate-700 px-3 py-2 rounded-lg border border-slate-600 shadow-sm">
                  <span className="text-[10px] font-bold text-blue-400 truncate max-w-[70px] mb-0.5" title={variation.value}>
                    {variation.value}
                  </span>
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    {channel}
                  </span>
                  <span className="text-sm font-black text-white">
                    ₹{price}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Form Tabs */}
        <div className="flex gap-4 border-b border-slate-600 mb-8 px-6 sm:px-8 pt-6 sm:pt-8">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              activeTab === "general"
                ? "border-green-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            General Info
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("variations")}
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              activeTab === "variations"
                ? "border-green-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            Variations ({variations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("images")}
            className={`px-4 py-2 font-semibold border-b-2 transition ${
              activeTab === "images"
                ? "border-green-500 text-white"
                : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            Images ({images.length})
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 sm:px-8 pb-6 sm:pb-8">
          {activeTab === "general" && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Item ID (Read-only)
                  </label>
                  <input
                    type="text"
                    value={itemId}
                    disabled
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-800 text-slate-400 font-semibold text-sm transition-all duration-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(toTitleCase(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Short Code (Read-only)
                  </label>
                  <input
                    type="text"
                    value={shortCode}
                    disabled
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-800 text-slate-400 font-semibold text-sm transition-all duration-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    HSN Code
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      className="flex-1 px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                    >
                      <option value="">Select HSN Code</option>
                      {hsnCodes.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                    {hsnCode && (
                      <button
                        type="button"
                        onClick={() => openEditHsnCodeModal(hsnCode)}
                        className="px-3 py-2 bg-amber-900/30 text-amber-400 rounded-lg hover:bg-amber-900/50 font-semibold border border-amber-600/40 hover:border-amber-500/60 transition-all duration-300"
                        title="Edit selected HSN code"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNewHsnCode("")}
                      className="px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 font-semibold border border-blue-600/40 hover:border-blue-500/60 transition-all duration-300"
                    >
                      +
                    </button>
                  </div>
                  {newHsnCode !== null && newHsnCode !== undefined && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newHsnCode}
                        onChange={(e) => setNewHsnCode(e.target.value)}
                        placeholder="Enter new HSN Code"
                        autoFocus
                        className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                      />
                      <button
                        type="button"
                        onClick={addHsnCode}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-semibold transition-all duration-300"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Supply Note SKU
                  </label>
                  <input
                    type="text"
                    value={supplyNoteSku}
                    onChange={(e) => setSupplyNoteSku(e.target.value)}
                    placeholder="Enter supply note SKU"
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    GST (%)
                  </label>
                  <select
                    value={gst}
                    onChange={(e) => setGst(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                  >
                    <option value="">Select GST</option>
                    {GST_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Group & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Group *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                      className="flex-1 px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                      required
                    >
                      <option value="">Select Group</option>
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    {group && (
                      <button
                        type="button"
                        onClick={() => openEditGroupModal(group)}
                        className="px-3 py-2 bg-amber-900/30 text-amber-400 rounded-lg hover:bg-amber-900/50 font-semibold border border-amber-600/40 hover:border-amber-500/60 transition-all duration-300"
                        title="Edit selected group"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNewGroup("")}
                      className="px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 font-semibold border border-blue-600/40 hover:border-blue-500/60 transition-all duration-300"
                    >
                      +
                    </button>
                  </div>
                  {newGroup !== null && newGroup !== undefined && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newGroup}
                        onChange={(e) => setNewGroup(toTitleCase(e.target.value))}
                        placeholder="Enter new group"
                        autoFocus
                        className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                      />
                      <button
                        type="button"
                        onClick={addGroup}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-semibold transition-all duration-300"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Category *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="flex-1 px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                      required
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {category && (
                      <button
                        type="button"
                        onClick={() => openEditCategoryModal(category)}
                        className="px-3 py-2 bg-amber-900/30 text-amber-400 rounded-lg hover:bg-amber-900/50 font-semibold border border-amber-600/40 hover:border-amber-500/60 transition-all duration-300"
                        title="Edit selected category"
                      >
                        ✏️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNewCategory("")}
                      className="px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 font-semibold border border-blue-600/40 hover:border-blue-500/60 transition-all duration-300"
                    >
                      +
                    </button>
                  </div>
                  {newCategory !== null && newCategory !== undefined && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(toTitleCase(e.target.value))}
                        placeholder="Enter new category"
                        autoFocus
                        className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                      />
                      <button
                        type="button"
                        onClick={addCategory}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-semibold transition-all duration-300"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Item Type & Unit Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Profit Margin (%)
                  </label>
                  <input
                    type="number"
                    value={profitMargin}
                    onChange={(e) => setProfitMargin(e.target.value)}
                    step="0.01"
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Item Type
                  </label>
                  <select
                    value={itemType}
                    onChange={(e) => setItemType(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                  >
                    {ITEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Unit Type
                  </label>
                  <select
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                    className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                  >
                    {UNIT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(toTitleCase(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 min-h-[100px]"
                  placeholder="Enter item description"
                />
              </div>
            </div>
          )}

          {activeTab === "variations" && (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
              {/* Variations Section */}
              <div className="border-t border-slate-600 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">
                    Variations
                  </h3>
                  <button
                    type="button"
                    onClick={addVariation}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300"
                  >
                    <Plus className="w-4 h-4" />
                    Add Variation
                  </button>
                </div>

                {variations.length > 0 ? (
                  variations.map((variation) => (
                    <div
                      key={variation.id}
                      className="mb-6 p-4 border border-slate-600 rounded-lg bg-slate-800/50 transition-colors duration-300"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            Variation Value
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={variation.value}
                              onChange={(e) =>
                                updateVariation(variation.id, "value", e.target.value)
                              }
                              className="flex-1 px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                            >
                              <option value="">Select Variation</option>
                              {variationValues.map((val) => (
                                <option key={val} value={val}>
                                  {val}
                                </option>
                              ))}
                            </select>
                            {variation.value && (
                              <button
                                type="button"
                                onClick={() => openEditVariationValueModal(variation.value)}
                                className="px-3 py-2 bg-amber-900/30 text-amber-400 rounded-lg hover:bg-amber-900/50 font-semibold border border-amber-600/40 hover:border-amber-500/60 transition-all duration-300"
                                title="Edit selected variation value"
                              >
                                ✏️
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setNewVariationValue("")}
                              className="px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 font-semibold border border-blue-600/40 hover:border-blue-500/60 transition-all duration-300"
                            >
                              +
                            </button>
                          </div>
                          {newVariationValue !== null &&
                            newVariationValue !== undefined && (
                              <div className="mt-2 flex gap-2">
                                <input
                                  type="text"
                                  value={newVariationValue}
                                  onChange={(e) =>
                                    setNewVariationValue(toTitleCase(e.target.value))
                                  }
                                  placeholder="e.g., 300 Gms, 1.5 L"
                                  autoFocus
                                  className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                                />
                                <button
                                  type="button"
                                  onClick={addVariationValue}
                                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-semibold transition-all duration-300"
                                >
                                  Add
                                </button>
                              </div>
                            )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            Price
                          </label>
                          <input
                            type="number"
                            value={variation.price || 0}
                            onChange={(e) =>
                              updateVariation(
                                variation.id,
                                "price",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="0"
                            step="0.01"
                            className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            SAP Code
                          </label>
                          <input
                            type="text"
                            value={variation.sapCode}
                            onChange={(e) =>
                              updateVariation(variation.id, "sapCode", e.target.value)
                            }
                            className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            Profit Margin (%)
                          </label>
                          <input
                            type="number"
                            value={variation.profitMargin || 0}
                            onChange={(e) =>
                              updateVariation(
                                variation.id,
                                "profitMargin",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            step="0.01"
                            className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-3">
                            Sale Type
                          </label>
                          <select
                            value={variation.saleType || "QTY"}
                            onChange={(e) =>
                              updateVariation(
                                variation.id,
                                "saleType",
                                e.target.value as "QTY" | "KG"
                              )
                            }
                            className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 cursor-pointer"
                          >
                            <option value="QTY">QTY (Quantity)</option>
                            <option value="KG">KG (Kilogram)</option>
                          </select>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                            {variation.saleType === "KG"
                              ? "KG: Converts value (e.g. 250 Gms) to weight (0.25)"
                              : "QTY: Counts each unit as 1.0"}
                          </p>
                        </div>
                      </div>

                      {/* Channel Prices */}
                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-medium text-gray-300">
                            Channel Prices (Area-wise)
                          </label>
                          <div className="text-xs text-blue-300 bg-blue-900/30 px-2 py-1 rounded space-y-1 border border-blue-600/40">
                            <p>Zomato & Swiggy: auto +15% (rounded to 5)</p>
                            <p>GS1: auto +20% (rounded to 5) - Optional</p>
                          </div>
                        </div>

                        {/* Standard Channels (excluding GS1) */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {CHANNELS.filter((ch) => ch !== "GS1").map((channel) => {
                      const isAutoCalculated = ["Zomato", "Swiggy"].includes(
                        channel,
                      );
                      return (
                        <div key={channel} className="flex flex-col">
                          <div className="flex flex-col mb-1 text-center bg-slate-700 rounded p-1 border border-slate-600">
                             <span className="text-[9px] font-bold text-blue-400 truncate" title={variation.value}>{variation.value}</span>
                             <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-tight leading-none">
                              {channel}
                              {isAutoCalculated && (
                                <span className="text-green-400 ml-1">(auto)</span>
                              )}
                             </span>
                          </div>
                          <input
                            type="number"
                            value={variation.channels[channel] || 0}
                            onChange={(e) =>
                              updateChannelPrice(
                                variation.id,
                                channel,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            placeholder="0"
                            step="0.01"
                            disabled={isAutoCalculated}
                            className={`w-full px-3 py-2 border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500 ${
                              isAutoCalculated
                                ? "bg-blue-900/30 text-blue-300 cursor-not-allowed font-bold border-blue-600/40"
                                : "bg-slate-700 text-white placeholder-slate-400"
                            }`}
                          />
                        </div>
                      );
                    })}
                        </div>

                        {/* GS1 with Checkbox and Code */}
                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600 space-y-3 transition-colors duration-300">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id={`gs1-checkbox-${variation.id}`}
                              checked={variation.gs1Enabled || false}
                              onChange={(e) =>
                                updateVariation(
                                  variation.id,
                                  "gs1Enabled",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 border-slate-600 rounded focus:ring-2 focus:ring-green-500 cursor-pointer bg-slate-700"
                            />
                            <label
                              htmlFor={`gs1-checkbox-${variation.id}`}
                              className="text-sm font-medium text-gray-300 cursor-pointer flex-1"
                            >
                              Enable GS1 Channel
                            </label>
                          </div>

                          {variation.gs1Enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* GS1 Price */}
                        <div>
                          <div className="flex flex-col mb-1 text-center bg-blue-900/30 rounded p-1 border border-blue-600/40">
                             <span className="text-[9px] font-bold text-blue-400 truncate">{variation.value}</span>
                             <span className="text-[8px] font-semibold text-blue-300 uppercase tracking-tight leading-none">GS1 (auto)</span>
                          </div>
                          <input
                            type="number"
                            value={variation.channels.GS1 || 0}
                            placeholder="Auto: 0"
                            step="0.01"
                            disabled
                            className="w-full px-3 py-2 border border-blue-600/40 rounded-lg text-sm bg-blue-900/30 text-blue-300 cursor-not-allowed font-bold"
                          />
                          <p className="text-[10px] text-blue-300 mt-1 italic">
                            Auto +20% (rounded to 5)
                          </p>
                        </div>

                        {/* GS1 Code */}
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 uppercase mb-1">
                            GS1 Code
                          </label>
                          <input
                            type="text"
                            value={variation.gs1Code || ""}
                            onChange={(e) =>
                              updateVariation(
                                variation.id,
                                "gs1Code",
                                e.target.value,
                              )
                            }
                            placeholder="Enter GS1 code"
                            className="w-full px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                          />
                        </div>
                      </div>
                    )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeVariation(variation.id)}
                          className="flex items-center gap-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 px-3 py-2 rounded-lg transition-all duration-300 border border-red-600/40 hover:border-red-500/60"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center bg-slate-800/50 rounded-lg border border-dashed border-slate-600">
                      <p className="text-slate-400">No variations added yet. Click "Add Variation" to start.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "images" && (
              <div className="space-y-6 animate-in slide-in-from-left duration-300">
                {/* Image Upload */}
                <div className="border-t border-slate-600 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-6">📸 Images by Channel</h3>

                  {/* Upload Area */}
                  <div className="mb-6">
                    <div className="border-2 border-dashed border-green-600 rounded-lg p-10 text-center bg-slate-800 hover:bg-slate-700/50 transition cursor-pointer group">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="image-input"
                      />
                      <label htmlFor="image-input" className="cursor-pointer block">
                        <p className="text-3xl mb-2">📁</p>
                        <p className="text-white font-bold text-lg group-hover:text-slate-100 transition-colors duration-300">
                          Click to upload images
                        </p>
                        <p className="text-slate-400 text-sm mt-2 group-hover:text-slate-300 transition-colors duration-300">PNG, JPG up to 10MB</p>
                        <p className="text-green-400 text-xs mt-3 font-semibold group-hover:text-green-300 transition-colors duration-300">
                          Select channel in the popup that appears
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* Image Previews Grouped by Channel */}
                  {images.length > 0 && (
                    <div className="space-y-8 mt-8">
                      <h4 className="text-lg font-bold text-white mb-4">
                        📷 Uploaded Images ({images.length})
                      </h4>
                      {["Website", "Zomato", "Swiggy", "GS1"]
                        .filter((channel) => images.some((img) => img.channel === channel))
                        .map((channel) => {
                          const channelImages = images.filter((img) => img.channel === channel);
                          return (
                            <div key={channel} className="bg-slate-800/50 rounded-lg p-4 border border-slate-600 transition-colors duration-300">
                              <h4 className="text-sm font-bold text-white mb-4 pb-2 border-b border-slate-600">
                                {channel === "Website" && "🌐"}
                                {channel === "Zomato" && "🔴"}
                                {channel === "Swiggy" && "🟠"}
                                {channel === "GS1" && "📦"}
                                {" "}
                                {channel} ({channelImages.length})
                              </h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {channelImages.map((img, idx) => (
                                  <div key={idx} className="relative group">
                                    <img
                                      src={img.preview}
                                      alt={`${channel} Preview ${idx}`}
                                      className="w-full h-40 object-cover rounded-lg shadow-md"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeImage(images.findIndex((i) => i === img))}
                                      className="absolute top-2 right-2 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300"
                                      title="Delete image"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Channel Selection Modal */}
          {showChannelModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg p-4">
              <div className="bg-gray-900 rounded-xl shadow-2xl shadow-blue-500/20 p-8 max-w-md w-full border border-slate-700">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">
                  📁 Select Channel for Images
                </h2>

                <p className="text-slate-300 text-center mb-6">
                  Choose which channel these images will be uploaded to:
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6">
                  {["Website", "Zomato", "Swiggy", "GS1"].map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => handleChannelSelect(channel)}
                      className="px-4 py-3 rounded-lg font-semibold border-2 border-slate-600 hover:border-green-500 hover:bg-green-900/30 transition-all duration-300 text-slate-300 hover:text-green-300"
                    >
                      {channel}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-slate-400 text-center">
                  Click a channel to confirm upload
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 border-t border-slate-600 pt-6">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/20 hover:shadow-xl hover:shadow-green-500/40"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/items/${itemId}`)}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600 hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Edit Group Modal */}
        {showEditGroupModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl shadow-blue-500/20 p-8 max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-700">
              <h2 className="text-2xl font-bold text-white mb-6">
                ✏️ Edit Group
              </h2>

              {/* Rename Group */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Group Name
                </label>
                <input
                  type="text"
                  value={editingGroupName}
                  onChange={(e) => setEditingGroupName(toTitleCase(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                />
              </div>

              {/* Manage Categories */}
              <div className="mb-6 border-t border-slate-600 pt-4">
                <h3 className="text-lg font-semibold text-white mb-4">
                  Categories in this Group
                </h3>

                {/* Add Category to Group */}
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newGroupCategory}
                    onChange={(e) => setNewGroupCategory(toTitleCase(e.target.value))}
                    placeholder="Add new category"
                    className="flex-1 px-3 py-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                  />
                  <button
                    type="button"
                    onClick={addCategoryToGroup}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-semibold transition-all duration-300"
                  >
                    Add
                  </button>
                </div>

                {/* List of Categories */}
                <div className="space-y-2">
                  {groupCategories.length > 0 ? (
                    groupCategories.map((cat) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-600"
                      >
                        <span className="text-sm text-slate-300">{cat}</span>
                        <button
                          type="button"
                          onClick={() => removeCategoryFromGroup(cat)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/30 px-2 py-1 rounded transition text-sm border border-red-600/40 hover:border-red-500/60"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic">No categories yet</p>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-3 border-t border-slate-600 pt-4">
                <button
                  type="button"
                  onClick={saveGroupChanges}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all duration-300 shadow-lg shadow-green-600/20"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditGroupModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white font-semibold transition-all duration-300 border border-slate-600 hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Category Modal */}
        {showEditCategoryModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl shadow-blue-500/20 p-8 max-w-md w-full border border-slate-700">
              <h2 className="text-2xl font-bold text-white mb-6">✏️ Edit Category</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">Category Name</label>
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(toTitleCase(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveCategoryChanges}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all duration-300 shadow-lg shadow-green-600/20"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditCategoryModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white font-semibold transition-all duration-300 border border-slate-600 hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit HSN Code Modal */}
        {showEditHsnCodeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">✏️ Edit HSN Code</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
                <input
                  type="text"
                  value={editingHsnCode}
                  onChange={(e) => setEditingHsnCode(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveHsnCodeChanges}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditHsnCodeModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Variation Value Modal */}
        {showEditVariationValueModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl shadow-2xl shadow-blue-500/20 p-8 max-w-md w-full border border-slate-700">
              <h2 className="text-2xl font-bold text-white mb-6">✏️ Edit Variation Value</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-3">Variation Value</label>
                <input
                  type="text"
                  value={editingVariationValue}
                  onChange={(e) => setEditingVariationValue(toTitleCase(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-600 rounded-lg bg-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-300 hover:border-slate-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveVariationValueChanges}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold transition-all duration-300 shadow-lg shadow-green-600/20"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditVariationValueModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 hover:text-white font-semibold transition-all duration-300 border border-slate-600 hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
