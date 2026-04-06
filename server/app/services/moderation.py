from openai import OpenAI
from app.config import get_settings


SCORE_THRESHOLDS = {
    "sexual": 0.15,
    "sexual/minors": 0.05,
    "harassment": 0.4,
    "harassment/threatening": 0.3,
    "hate": 0.4,
    "hate/threatening": 0.3,
    "illicit": 0.4,
    "illicit/violent": 0.3,
    "self-harm": 0.3,
    "self-harm/intent": 0.3,
    "self-harm/instructions": 0.3,
    "violence": 0.5,
    "violence/graphic": 0.4,
}


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


def storage_path_to_public_url(path: str) -> str:
    """Convert a storage path to its public URL."""
    base = get_settings().supabase_url
    return f"{base}/storage/v1/object/public/listing_photos/{path}"


def _check_scores(result) -> dict:
    """Apply custom thresholds to category scores. Returns flagged categories."""
    scores = result.category_scores.model_dump()
    violated = {}
    for category, threshold in SCORE_THRESHOLDS.items():
        score = scores.get(category, 0)
        if score >= threshold:
            violated[category] = round(score, 4)
    return violated


async def moderate_text(text: str) -> dict:
    """Run text through OpenAI's moderation API with custom thresholds."""
    client = get_openai_client()

    print(f"[MODERATION] Checking text: {text[:80]}...")

    response = client.moderations.create(
        model="omni-moderation-latest",
        input=[{"type": "text", "text": text}],
    )

    result = response.results[0]
    violated = _check_scores(result)
    flagged = result.flagged or len(violated) > 0

    print(f"[MODERATION] Text result: flagged={flagged} violated={violated}")

    return {"flagged": flagged, "categories": violated}


async def moderate_image(storage_path: str) -> dict:
    """Run a single image through OpenAI's moderation API with custom thresholds."""
    client = get_openai_client()
    url = storage_path_to_public_url(storage_path)

    print(f"[MODERATION] Checking image: {url}")

    response = client.moderations.create(
        model="omni-moderation-latest",
        input=[{"type": "image_url", "image_url": {"url": url}}],
    )

    result = response.results[0]
    violated = _check_scores(result)
    flagged = result.flagged or len(violated) > 0

    all_scores = {
        k: round(v, 4)
        for k, v in result.category_scores.model_dump().items()
        if v > 0.01
    }
    print(f"[MODERATION] Image scores: {all_scores}")
    print(f"[MODERATION] Image result: flagged={flagged} violated={violated}")

    return {"flagged": flagged, "categories": violated}
