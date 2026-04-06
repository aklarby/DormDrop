// Auto-generated from shared/constants.json — do not edit manually

export const CATEGORIES = ["furniture", "textbooks", "electronics", "appliances", "kitchenware", "bedding_linens", "lighting", "storage_organization", "desk_accessories", "clothing", "shoes", "sports_equipment", "bikes_scooters", "musical_instruments", "school_supplies", "dorm_decor", "mini_fridge", "tv_monitor", "gaming", "free"] as const;
export type Categories = (typeof CATEGORIES)[number];

export const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
export type Conditions = (typeof CONDITIONS)[number];

export const LISTING_STATUSES = ["active", "sold", "reserved", "expired", "removed"] as const;
export type ListingStatuses = (typeof LISTING_STATUSES)[number];

export const CONVERSATION_STATUSES = ["open", "closed"] as const;
export type ConversationStatuses = (typeof CONVERSATION_STATUSES)[number];

export const REPORT_TARGET_TYPES = ["listing", "student", "message"] as const;
export type ReportTargetTypes = (typeof REPORT_TARGET_TYPES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  "furniture": "Furniture",
  "textbooks": "Textbooks",
  "electronics": "Electronics",
  "appliances": "Appliances",
  "kitchenware": "Kitchenware",
  "bedding_linens": "Bedding & Linens",
  "lighting": "Lighting",
  "storage_organization": "Storage & Organization",
  "desk_accessories": "Desk Accessories",
  "clothing": "Clothing",
  "shoes": "Shoes",
  "sports_equipment": "Sports Equipment",
  "bikes_scooters": "Bikes & Scooters",
  "musical_instruments": "Musical Instruments",
  "school_supplies": "School Supplies",
  "dorm_decor": "Dorm Decor",
  "mini_fridge": "Mini Fridge",
  "tv_monitor": "TV & Monitor",
  "gaming": "Gaming",
  "free": "Free"
};

export const CONDITION_LABELS: Record<string, string> = {
  "new": "New",
  "like_new": "Like New",
  "good": "Good",
  "fair": "Fair",
  "poor": "Poor"
};
