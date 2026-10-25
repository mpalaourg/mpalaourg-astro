-- Keep unsuccessful runs out of daily budgets while retaining burst protection.
ALTER TABLE chat_messages ADD COLUMN replaces_id TEXT;
CREATE UNIQUE INDEX chat_message_replacement ON chat_messages(replaces_id) WHERE replaces_id IS NOT NULL;
CREATE TABLE chat_attempts (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX chat_attempts_recent ON chat_attempts(visitor,created_at);
INSERT INTO chat_attempts SELECT id,visitor,created_at FROM chat_usage;
DROP TRIGGER chat_reserve;
CREATE TRIGGER chat_reserve BEFORE INSERT ON chat_usage BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_usage WHERE day=NEW.day)>=200 THEN RAISE(ABORT,'chat_global_limit') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_usage WHERE visitor=NEW.visitor)>=10 THEN RAISE(ABORT,'chat_visitor_limit') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM chat_attempts WHERE visitor=NEW.visitor AND created_at>NEW.created_at-60000)>=3 THEN RAISE(ABORT,'chat_burst_limit') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM chat_threads WHERE id=NEW.thread_id AND archived=0 AND questions<4) THEN RAISE(ABORT,'chat_thread_limit') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM chat_messages WHERE thread_id=NEW.thread_id AND status='pending') THEN RAISE(ABORT,'chat_busy') END;
  INSERT INTO chat_attempts VALUES(NEW.id,NEW.visitor,NEW.created_at);
  UPDATE chat_threads SET questions=questions+1,updated_at=NEW.created_at WHERE id=NEW.thread_id;
END;
CREATE TRIGGER chat_release_run AFTER UPDATE OF status ON chat_messages
WHEN (OLD.status='pending' AND NEW.status IN ('failed','cancelled')) OR (OLD.status='done' AND NEW.status='superseded') BEGIN
  UPDATE chat_threads SET questions=MAX(0,questions-1) WHERE id=NEW.thread_id;
  DELETE FROM chat_usage WHERE id=NEW.id AND OLD.status='pending';
END;
CREATE TRIGGER chat_validate_replacement BEFORE INSERT ON chat_messages WHEN NEW.replaces_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM chat_messages old WHERE old.id=NEW.replaces_id AND old.thread_id=NEW.thread_id AND old.status='superseded'
    AND NOT EXISTS (SELECT 1 FROM chat_messages newer WHERE newer.thread_id=old.thread_id AND newer.status<>'superseded' AND (newer.created_at>old.created_at OR (newer.created_at=old.created_at AND newer.id>old.id))))
    THEN RAISE(ABORT,'chat_invalid_replacement') END;
END;
DELETE FROM chat_usage WHERE id IN (SELECT id FROM chat_messages WHERE status='failed');
UPDATE chat_threads SET questions=(SELECT COUNT(*) FROM chat_messages WHERE thread_id=chat_threads.id AND status IN ('pending','done'));
