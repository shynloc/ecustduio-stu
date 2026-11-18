import { existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./db.js";
// Only the local upgrader controls this marker. HTTP clients cannot create it.
export const upgradeMaintenance = () => existsSync(join(dataDir, "upgrade-maintenance.json"));
