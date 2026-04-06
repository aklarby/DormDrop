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
    supabase = get_supabase()
    supabase.storage.from_(bucket).remove([path])
