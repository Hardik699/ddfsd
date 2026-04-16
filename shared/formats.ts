export const UPLOAD_FORMATS = {
  petpooja: {
    name: "Petpooja Upload",
    requiredColumns: [
      "restaurant_name",
      "invoice_no",
      "date",
      "New Date",
      "Time",
      "payment_type",
      "order_type",
      "status",
      "area",
      "virtual_brand_name",
      "brand_grouping",
      "assign_to",
      "customer_phone",
      "customer_name",
      "customer_address",
      "persons",
      "order_cancel_reason",
      "my_amount",
      "total_tax",
      "discount",
      "delivery_charge",
      "container_charge",
      "service_charge",
      "additional_charge",
      "waived_off",
      "round_off",
      "total",
      "item_name",
      "category_name",
      "sap_code",
      "item_price",
      "item_quantity",
      "item_total",
      "Total"
    ],
    description: "Petpooja restaurant order data format with restaurant info, invoice details, order information, customer details, charges, and item details"
  },
  pain_lebs: {
    name: "Pain Labs Upload",
    requiredColumns: [
      "Store ID",
      "Store Name",
      "Region",
      "Customer Phone",
      "Customer Email",
      "Customer Name",
      "Customer address",
      "Customer GST Number",
      "Order ID",
      "Reference Order ID",
      "Invoice Number",
      "Product ID",
      "Order Sub ID",
      "Order Date",
      "Order Time",
      "Product",
      "Size",
      "Category",
      "Brand",
      "Sub Category",
      "Income Head",
      "Barcode",
      "SKU",
      "Batch Variant ID",
      "Batch Variant Name",
      "HSN / SAC Code",
      "Quantity Ordered",
      "Unit",
      "Base Price",
      "Net Sale",
      "Taxes",
      "Gross Sale",
      "Void Amount",
      "MRP",
      "Cost Price per Unit",
      "Cost Of Goods Sold",
      "Void Quantity",
      "Void Date",
      "Void Time",
      "User",
      "Billing User",
      "Manufacturer ID",
      "Manufacturer",
      "Discount Total Value",
      "Discount Remarks",
      "Discount IDs",
      "Discount Names",
      "Coupon Code",
      "Total Charge Value",
      "Payment Mode"
    ],
    description: "Pain Labs retail sales data format with store info, customer details, order information, product details, pricing, taxes, discounts, and payment information"
  },
  website: {
    name: "Website Upload",
    requiredColumns: [
      "Page Title",
      "URL",
      "Visits",
      "Bounce Rate",
      "Avg Duration",
      "Date"
    ],
    description: "Website format with Page Title, URL, Visits, Bounce Rate, Avg Duration, and Date"
  },
  supply_note: {
    name: "Supply Note Upload",
    requiredColumns: [
      "Sku Code",
      "Indent No.",
      "Delivery Location",
      "Invoice Date",
      "Received Qty"
    ],
    description: "Supply note format with SKU Code, Indent No., Delivery Location, Invoice Date, and Received Qty"
  }
} as const;

export type UploadType = keyof typeof UPLOAD_FORMATS;

export function validateFileFormat(headers: string[], uploadType: keyof typeof UPLOAD_FORMATS): { valid: boolean; missing: string[] } {
  const format = UPLOAD_FORMATS[uploadType];
  const requiredColumns = format.requiredColumns;
  
  // Normalize headers (trim and lowercase for comparison)
  const normalizedHeaders = headers.map(h => h.trim());
  const normalizedRequired = requiredColumns.map(c => c.toLowerCase().trim());
  
  // Check if all required columns exist (case-insensitive)
  const missing: string[] = [];
  for (const required of normalizedRequired) {
    const found = normalizedHeaders.some(h => h.toLowerCase() === required);
    if (!found) {
      missing.push(required);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}
