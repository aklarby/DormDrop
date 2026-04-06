import json
from openai import OpenAI

from app.config import get_settings
from app.constants import CATEGORIES, CONDITIONS


SYSTEM_PROMPT = """You are a product listing assistant for a college student marketplace called DormDrop.
Given an image of an item, return a JSON object with these fields:
- title: a concise, descriptive title
- description: a short description (2-3 sentences)
- category: one of {categories}
- condition: one of {conditions}
- price_cents: estimated price in cents (USD)
- is_negotiable: boolean

Return ONLY valid JSON. No markdown, no explanation.""".format(
    categories=", ".join(CATEGORIES),
    conditions=", ".join(CONDITIONS),
)


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


async def auto_populate_from_image(image_url: str) -> dict:
    """Send an image to the vision model and get structured listing data."""
    client = get_openai_client()

    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_url}},
                    {"type": "text", "text": "What is this item? Fill out the listing form."},
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
