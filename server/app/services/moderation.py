from openai import OpenAI
from app.config import get_settings


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


async def moderate_content(
    text: str | None = None,
    image_urls: list[str] | None = None,
) -> dict:
    """Run text and/or images through OpenAI's moderation API.

    Returns: {"flagged": bool, "categories": dict, "raw": dict}
    """
    client = get_openai_client()

    inputs = []
    if text:
        inputs.append({"type": "text", "text": text})
    if image_urls:
        for url in image_urls:
            inputs.append({"type": "image_url", "image_url": {"url": url}})

    if not inputs:
        return {"flagged": False, "categories": {}, "raw": {}}

    response = client.moderations.create(
        model="omni-moderation-latest",
        input=inputs,
    )

    result = response.results[0]
    return {
        "flagged": result.flagged,
        "categories": {k: v for k, v in result.categories.model_dump().items() if v},
        "raw": response.model_dump(),
    }
