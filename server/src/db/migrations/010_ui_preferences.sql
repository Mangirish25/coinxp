CREATE TABLE ui_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  motion_mode TEXT NOT NULL DEFAULT 'SYSTEM' CHECK(motion_mode IN ('SYSTEM','FULL','REDUCED','OFF')),
  celebrations TEXT NOT NULL DEFAULT 'ALL' CHECK(celebrations IN ('ALL','MAJOR','OFF')),
  sound INTEGER NOT NULL DEFAULT 0 CHECK(sound IN (0,1)),
  haptics INTEGER NOT NULL DEFAULT 1 CHECK(haptics IN (0,1)),
  updated_at TEXT NOT NULL
);
