import "./load-env";
import { rebuildGraph } from "@/lib/graph/sync";
import { closeDriver } from "@/lib/graph/client";

/** `pnpm graph:rebuild` — wipe Neo4j and replay every published record from the database. */
rebuildGraph()
  .then(async (r) => {
    console.log(`✓ graph rebuilt: ${r.challenges} challenges, ${r.teams} teams, ${r.deliveries} deliveries, ${r.builders} builders`);
    await closeDriver();
    process.exit(0);
  })
  .catch((e) => {
    console.error(`✗ graph rebuild failed: ${e.message}`);
    process.exit(1);
  });
