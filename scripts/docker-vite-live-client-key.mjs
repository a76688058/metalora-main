import fs from "node:fs";

const secretPath = process.argv[2];
const envPath = process.argv[3];
if (!secretPath || !envPath) process.exit(1);
if (!fs.existsSync(secretPath)) process.exit(0);

const raw = fs.readFileSync(secretPath, "utf8").trim();
if (!raw) process.exit(1);
if (/test_(ck|sk|gsk)|live_(sk|gsk)/.test(raw) || !/^live_ck_[A-Za-z0-9]+$/.test(raw)) {
  process.exit(1);
}

fs.writeFileSync(envPath, `VITE_TOSS_LIVE_CLIENT_KEY=${raw}\n`, { mode: 0o600 });
