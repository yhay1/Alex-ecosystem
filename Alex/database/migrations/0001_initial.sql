-- Generic storage for shared DataStore collections.
CREATE TABLE ecosystem_records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection, id)
);

CREATE INDEX ecosystem_records_collection_idx
  ON ecosystem_records (collection);