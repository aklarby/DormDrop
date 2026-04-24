#!/usr/bin/env python3
"""Add a new college to DormDrop.

Usage:
    python scripts/add_college.py \
        --name "Example University" \
        --domain "example.edu" \
        --logo ./logo.png \
        --tagline "For students, by students" \
        [--region "Pacific Northwest"] \
        [--moderator-email "mod@example.edu"]

Env: SUPABASE_URL + SUPABASE_SECRET_KEY.
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from pathlib import Path

# Allow running from repo root without installing the server package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

try:
    from supabase import create_client, Client  # type: ignore
except ImportError:
    print("supabase package missing — run `pip install -r server/requirements.txt` first.")
    sys.exit(1)


def _client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        print("SUPABASE_URL / SUPABASE_SECRET_KEY must be set in the environment.")
        sys.exit(1)
    return create_client(url, key)


def ensure_region(sb: Client, name: str | None) -> str | None:
    if not name:
        return None
    existing = sb.table("regions").select("id").eq("name", name).maybe_single().execute()
    if existing and existing.data:
        return existing.data["id"]
    inserted = sb.table("regions").insert({"name": name}).execute()
    return inserted.data[0]["id"]


def upload_logo(sb: Client, path: str, college_id: str) -> str | None:
    p = Path(path)
    if not p.exists():
        print(f"Logo file {path} not found; skipping upload")
        return None
    mime = mimetypes.guess_type(str(p))[0] or "image/png"
    storage_path = f"{college_id}/logo{p.suffix}"
    data = p.read_bytes()
    sb.storage.from_("college_assets").upload(
        storage_path, data, {"content-type": mime, "upsert": "true"}
    )
    return storage_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Add a college to DormDrop")
    parser.add_argument("--name", required=True)
    parser.add_argument("--domain", required=True, help="Email domain, e.g. example.edu")
    parser.add_argument("--logo", help="Path to a PNG/SVG logo")
    parser.add_argument("--tagline", help="Short per-college tagline")
    parser.add_argument("--region", help="Region name (created if missing)")
    parser.add_argument("--moderator-email", action="append", help="Can be passed multiple times")
    args = parser.parse_args()

    sb = _client()
    region_id = ensure_region(sb, args.region)

    existing = (
        sb.table("colleges")
        .select("id")
        .eq("email_domain", args.domain.lower())
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        college_id = existing.data["id"]
        print(f"College with domain {args.domain} already exists: {college_id}")
    else:
        inserted = sb.table("colleges").insert({
            "name": args.name,
            "email_domain": args.domain.lower(),
            "tagline": args.tagline,
            "region_id": region_id,
        }).execute()
        college_id = inserted.data[0]["id"]
        print(f"Created college {args.name} ({college_id})")

    if args.logo:
        path = upload_logo(sb, args.logo, college_id)
        if path:
            sb.table("colleges").update({"logo_path": path}).eq("id", college_id).execute()
            print(f"Logo uploaded: college_assets/{path}")

    for email in args.moderator_email or []:
        print(f"NOTE: moderator @ {email} will need to sign up and then have role='moderator'")

    print("Done.")


if __name__ == "__main__":
    main()
