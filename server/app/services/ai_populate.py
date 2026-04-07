import json
from openai import OpenAI

from app.config import get_settings
from app.constants import CATEGORIES, CONDITIONS
from app.dependencies import get_supabase


SYSTEM_PROMPT = """You are a listing assistant for DormDrop, a college student marketplace.

Look at the image and describe what you see accurately. Adapt your detail level to the type of item:

- **Electronics/tech**: Include brand, model, and key specs (e.g. "Apple MacBook Pro 14\" M3 - Space Gray").
- **Furniture/home goods**: Describe what it is, its style, material, color, and approximate dimensions (e.g. "Wooden Counter-Height Table with 2 Stools - Dark Walnut").
- **Clothing/accessories**: Mention brand (if visible), type, size, color, and material (e.g. "Patagonia Better Sweater Quarter-Zip - Grey, Size M").
- **Books/school supplies**: Include title, author/edition if visible (e.g. "Organic Chemistry 9th Edition - McMurry").
- **Other items**: Just describe clearly what the item is, its notable features, and color.

Return a JSON object:

- "title": A clear, descriptive title following the guidelines above. Never make up brands or models you can't see — just describe what's there.
- "description": 2-3 sentences. Stick to factual details only: what the item is, its features, dimensions/size, material, color, and visible condition. Do NOT add sales pitches, suggestions for how to use it, or phrases like "great for..." or "perfect for...". Just describe the product.
- "category": MUST be one of: {categories}
- "condition": MUST be one of: {conditions} — judge from visible wear in the image.
- "price_cents": Estimated fair resale price in cents (USD) for a college student marketplace.
- "is_negotiable": true for higher-value items (electronics, furniture), false for low-cost items.

Return ONLY valid JSON. No markdown, no explanation.""".format(
    categories=", ".join(CATEGORIES),
    conditions=", ".join(CONDITIONS),
)


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


def get_signed_url(storage_path: str, expires_in: int = 300) -> str:
    """Generate a short-lived signed URL for a private storage object."""
    supabase = get_supabase()
    result = supabase.storage.from_("listing_photos").create_signed_url(
        storage_path, expires_in
    )
    return result["signedURL"]


async def auto_populate_from_image(storage_path: str) -> dict:
    """Download image via signed URL and send to the vision model."""
    client = get_openai_client()
    signed_url = get_signed_url(storage_path)

    response = client.chat.completions.create(
        model="gpt-5.4-nano",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": signed_url}},
                    {"type": "text", "text": "What is this item? Describe it accurately and generate a listing. Only mention brand/model/specs if you can actually see them — otherwise just describe what the item is."},
                ],
            },
        ],
        response_format={"type": "json_object"},
    )

    raw_text = response.choices[0].message.content
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        return {"raw": raw_text, "error": "Failed to parse AI response"}

    if data.get("category") not in CATEGORIES:
        data["category"] = None

    if data.get("condition") not in CONDITIONS:
        data["condition"] = None

    return {"suggestions": data, "raw": raw_text}
