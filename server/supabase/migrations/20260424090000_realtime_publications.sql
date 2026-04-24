-- Make sure the tables the client subscribes to via Supabase Realtime
-- (`postgres_changes`) are actually in the supabase_realtime publication.
-- INSERTs on `conversations` power "new chat appears without refresh";
-- UPDATEs on `messages` power read-receipt flips.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
