import json
from openai import OpenAI

from app.config import get_settings
from app.constants import CATEGORIES, CONDITIONS
from app.dependencies import get_supabase


SYSTEM_PROMPT = """You are a product listing assistant for DormDrop, a college student marketplace.

Analyze the item in the image carefully. Identify the brand, model, size, color, and any visible wear or damage.

Return a JSON object with these fields:

- "title": Brand + model + key attribute (e.g. "Apple MacBook Pro 14\" M3 - Space Gray"). Be specific — avoid generic titles like "Laptop" or "Apple MacBook Laptop".
- "description": 3-4 sentences a buyer would actually find useful. Mention the brand/model, key specs or features, physical condition you can observe, and what makes it a good deal for a college student. Write in a natural, friendly tone — not robotic.
- "category": MUST be one of: {categories}
- "condition": MUST be one of: {conditions} — judge from visible wear in the image.
- "price_cents": Estimated fair resale price in cents (USD) for a college student marketplace. Factor in typical used pricing for this item.
- "is_negotiable": true if the item is commonly negotiated on (electronics, furniture), false for low-cost items.

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.""".format(
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
                    {"type": "text", "text": "Identify this item precisely (brand, model, specs) and generate a compelling listing for a college student marketplace. Be specific in the title and helpful in the description."},
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
