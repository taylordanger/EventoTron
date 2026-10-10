CREATE TABLE IF NOT EXISTS suite_write_guards (
  token text PRIMARY KEY NOT NULL,
  accepted integer NOT NULL CHECK (accepted = 1)
);
