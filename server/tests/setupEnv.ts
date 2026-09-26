// Runs in each test worker before any app module is imported.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://iia:iia_test@localhost:5434/instagram_intel_test";
process.env.INSTAGRAM_API_MODE = "mock";
process.env.OPENAI_API_KEY = ""; // force the deterministic assistant engine
process.env.ALLOW_SIGNUP = "";
process.env.PROFILE_CACHE_TTL_SECONDS = "300";
process.env.MIN_REFRESH_INTERVAL_MINUTES = "15";
