const fs = require('node:fs');
const path = require('node:path');

// Load primary production env (.env)
require('dotenv').config();

// Load local overrides (.env.local) if present (for staging/development)
const localEnvPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(localEnvPath)) {
    try {
        const dotenv = require('dotenv');
        const localEnv = dotenv.parse(fs.readFileSync(localEnvPath));
        for (const k in localEnv) {
            process.env[k] = localEnv[k];
        }
        console.log('[SYSTEM] Loaded local environment overrides from .env.local');
    } catch (e) {
        console.warn('[SYSTEM WARNING] Failed to parse .env.local:', e.message);
    }
}
