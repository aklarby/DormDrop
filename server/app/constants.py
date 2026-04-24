"""Auto-generated from shared/constants.json — do not edit manually."""

from typing import Literal

CATEGORIES = ["furniture", "textbooks", "electronics", "appliances", "kitchenware", "bedding_linens", "lighting", "storage_organization", "desk_accessories", "clothing", "shoes", "sports_equipment", "bikes_scooters", "musical_instruments", "school_supplies", "dorm_decor", "mini_fridge", "tv_monitor", "gaming", "free"]
Categories = Literal['furniture', 'textbooks', 'electronics', 'appliances', 'kitchenware', 'bedding_linens', 'lighting', 'storage_organization', 'desk_accessories', 'clothing', 'shoes', 'sports_equipment', 'bikes_scooters', 'musical_instruments', 'school_supplies', 'dorm_decor', 'mini_fridge', 'tv_monitor', 'gaming', 'free']

CONDITIONS = ["new", "like_new", "good", "fair", "poor"]
Conditions = Literal['new', 'like_new', 'good', 'fair', 'poor']

LISTING_STATUSES = ["active", "sold", "reserved", "expired", "removed"]
ListingStatuses = Literal['active', 'sold', 'reserved', 'expired', 'removed']

CONVERSATION_STATUSES = ["open", "closed"]
ConversationStatuses = Literal['open', 'closed']

REPORT_TARGET_TYPES = ["listing", "student", "message", "transaction"]
ReportTargetTypes = Literal['listing', 'student', 'message', 'transaction']

CATEGORY_LABELS: dict[str, str] = {
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
}

CONDITION_LABELS: dict[str, str] = {
    "new": "New",
    "like_new": "Like New",
    "good": "Good",
    "fair": "Fair",
    "poor": "Poor"
}
