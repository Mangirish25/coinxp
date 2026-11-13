ALTER TABLE streak_runs ADD COLUMN comeback_json TEXT;
ALTER TABLE streak_runs ADD COLUMN config_version TEXT NOT NULL DEFAULT '0.1.0';
ALTER TABLE streak_periods ADD COLUMN config_version TEXT NOT NULL DEFAULT '0.1.0';
