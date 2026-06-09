-- Player mailbox. Broadcast-only for v1: every row in mail_messages is
-- visible to every authenticated player. Per-user state (read / claimed)
-- lives in mail_reads. Attachments are doubloons + gems for now; richer
-- payloads (items, crew, bait) can be added without a schema migration
-- by adding nullable columns and growing claim_mail.
--
-- Admin compose is service-role-only (INSERT into mail_messages has no
-- RLS policy → blocked for anon/authenticated). For now you send mail by
-- asking Claude to insert a row via MCP. A future /admin/mail compose
-- page would call the same INSERT with the service-role client.

CREATE TABLE IF NOT EXISTS mail_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject       text NOT NULL,
  body          text NOT NULL,
  sender_label  text NOT NULL DEFAULT 'Cap''n Shibling',
  attachment_doubloons int NOT NULL DEFAULT 0 CHECK (attachment_doubloons >= 0),
  attachment_gems      int NOT NULL DEFAULT 0 CHECK (attachment_gems >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NULL
);

CREATE INDEX IF NOT EXISTS mail_messages_created_at_idx
  ON mail_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS mail_reads (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id  uuid NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  read_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at  timestamptz NULL,
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS mail_reads_user_idx ON mail_reads (user_id);

ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_reads    ENABLE ROW LEVEL SECURITY;

-- Every authenticated player can read every announcement. INSERT/UPDATE/
-- DELETE deliberately have no policy → service-role-only.
DROP POLICY IF EXISTS mail_messages_select_auth ON mail_messages;
CREATE POLICY mail_messages_select_auth ON mail_messages
  FOR SELECT TO authenticated USING (true);

-- Each user manages only their own mail_reads rows. Service-role bypasses
-- RLS automatically; the claim_mail RPC also runs SECURITY DEFINER so its
-- own writes pass regardless of these policies.
DROP POLICY IF EXISTS mail_reads_select_own ON mail_reads;
CREATE POLICY mail_reads_select_own ON mail_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS mail_reads_insert_own ON mail_reads;
CREATE POLICY mail_reads_insert_own ON mail_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS mail_reads_update_own ON mail_reads;
CREATE POLICY mail_reads_update_own ON mail_reads
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- claim_mail: atomic claim + grant. Returns one of:
--   { ok: true,  gems: N, doubloons: N }     on first successful claim
--   { error: 'not_found' | 'no_attachment' | 'already_claimed' }
--
-- Race-safety comes from the INSERT ... ON CONFLICT DO UPDATE WHERE
-- mail_reads.claimed_at IS NULL pattern: only one transaction can flip
-- claimed_at from NULL → now(), so concurrent calls cleanly resolve to
-- one ok + one already_claimed.
--
-- SECURITY DEFINER + uid arg → service-role only (per security memory).
CREATE OR REPLACE FUNCTION claim_mail(uid uuid, mid uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg RECORD;
  rows_affected int;
BEGIN
  SELECT id, attachment_gems, attachment_doubloons
    INTO msg FROM mail_messages WHERE id = mid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF msg.attachment_gems = 0 AND msg.attachment_doubloons = 0 THEN
    RETURN jsonb_build_object('error', 'no_attachment');
  END IF;

  INSERT INTO mail_reads (user_id, message_id, read_at, claimed_at)
  VALUES (uid, mid, now(), now())
  ON CONFLICT (user_id, message_id) DO UPDATE
    SET claimed_at = EXCLUDED.claimed_at
    WHERE mail_reads.claimed_at IS NULL;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('error', 'already_claimed');
  END IF;

  UPDATE profiles
    SET gems = COALESCE(gems, 0) + msg.attachment_gems,
        doubloons = COALESCE(doubloons, 0) + msg.attachment_doubloons
    WHERE id = uid;

  RETURN jsonb_build_object(
    'ok', true,
    'gems', msg.attachment_gems,
    'doubloons', msg.attachment_doubloons
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_mail(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_mail(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION claim_mail(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION claim_mail(uuid, uuid) TO service_role;
