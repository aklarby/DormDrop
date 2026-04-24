from app.dependencies import get_supabase


def get_public_url(bucket: str, path: str) -> str:
    supabase = get_supabase()
    return supabase.storage.from_(bucket).get_public_url(path)


def move_from_staging(bucket: str, staging_path: str, final_path: str) -> str:
    """Move a file from staging to its final path within a bucket."""
    supabase = get_supabase()
    supabase.storage.from_(bucket).move(staging_path, final_path)
    return final_path


def delete_file(bucket: str, path: str) -> None:
    """Best-effort delete of a single storage object. Swallows errors so
    lifecycle hooks don't fail the whole request when a photo was already
    removed or never existed (e.g. stale JSONB entries)."""
    supabase = get_supabase()
    try:
        supabase.storage.from_(bucket).remove([path])
    except Exception as exc:
        print(f"[storage] delete_file failed for {bucket}/{path}: {exc}")


def delete_files(bucket: str, paths: list[str]) -> None:
    """Bulk best-effort delete."""
    if not paths:
        return
    supabase = get_supabase()
    try:
        supabase.storage.from_(bucket).remove(paths)
    except Exception as exc:
        print(f"[storage] delete_files failed for {bucket} ({len(paths)} paths): {exc}")


def extract_photo_paths(photos) -> list[str]:
    """Normalize listing.photos JSONB into a flat list of storage paths."""
    if not photos:
        return []
    paths: list[str] = []
    for entry in photos:
        if isinstance(entry, str):
            paths.append(entry)
        elif isinstance(entry, dict) and entry.get("path"):
            paths.append(entry["path"])
    return paths
