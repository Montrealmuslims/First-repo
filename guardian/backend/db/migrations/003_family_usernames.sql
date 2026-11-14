-- Family members without an email address (e.g. a grandparent) sign in with
-- a username that the family owner creates for them.

ALTER TABLE parents
  ALTER COLUMN email DROP NOT NULL,
  ADD COLUMN username citext UNIQUE
    CHECK (username IS NULL OR username ~ '^[a-z0-9._-]{3,30}$'),
  ADD CONSTRAINT parents_login_present CHECK (email IS NOT NULL OR username IS NOT NULL);
