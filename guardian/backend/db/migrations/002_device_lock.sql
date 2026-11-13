-- Remote lock: a parent can lock all of a child's devices for a while or
-- until they unlock. Enforced by the child app (screen lock via the Android
-- device-admin "force lock" policy). Requires the 'device_lock' consent scope.

ALTER TABLE children
  ADD COLUMN locked_until  timestamptz,           -- NULL = not locked; 'infinity' = until unlocked
  ADD COLUMN lock_message  text CHECK (char_length(lock_message) <= 140),
  ADD COLUMN locked_by     uuid REFERENCES parents(id) ON DELETE SET NULL,
  ADD COLUMN locked_at     timestamptz;

-- Reported by the device on every heartbeat: can it actually lock the screen?
-- (false when the child or anyone turned off the app's device-admin permission)
ALTER TABLE devices
  ADD COLUMN lock_capable  boolean;
