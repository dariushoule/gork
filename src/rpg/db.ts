import Database from "better-sqlite3";

type DB = InstanceType<typeof Database>;

export function initDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      description   TEXT    NOT NULL,
      thread_id     TEXT    UNIQUE,
      status        TEXT    NOT NULL DEFAULT 'active',
      created_at    INTEGER NOT NULL,
      completed_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS monsters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id  INTEGER NOT NULL REFERENCES campaigns(id),
      name         TEXT    NOT NULL,
      tier         TEXT    NOT NULL,
      hp           INTEGER NOT NULL DEFAULT 100,
      position     INTEGER NOT NULL,
      defeated     INTEGER NOT NULL DEFAULT 0,
      defeated_at  INTEGER
    );

    CREATE TABLE IF NOT EXISTS players (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id            TEXT    NOT NULL UNIQUE,
      display_name          TEXT    NOT NULL,
      hp                    INTEGER NOT NULL DEFAULT 100,
      incapacitated_until   INTEGER,
      incapacitation_reason TEXT,
      created_at            INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL REFERENCES players(id),
      name        TEXT    NOT NULL,
      tier        TEXT    NOT NULL,
      acquired_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS status_effects (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  INTEGER NOT NULL REFERENCES players(id),
      effect     TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campaign_participants (
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      player_id   INTEGER NOT NULL REFERENCES players(id),
      PRIMARY KEY (campaign_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS loot (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      monster_id  INTEGER NOT NULL REFERENCES monsters(id),
      name        TEXT    NOT NULL,
      tier        TEXT    NOT NULL,
      awarded_to  INTEGER REFERENCES players(id)
    );

    CREATE TABLE IF NOT EXISTS campaign_summaries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL UNIQUE REFERENCES campaigns(id),
      summary     TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS turn_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id   INTEGER NOT NULL REFERENCES campaigns(id),
      player_name   TEXT    NOT NULL,
      player_action TEXT    NOT NULL,
      gm_narrative  TEXT    NOT NULL,
      turn_number   INTEGER NOT NULL,
      created_at    INTEGER NOT NULL
    );
  `);
  return db;
}

export type { DB };
