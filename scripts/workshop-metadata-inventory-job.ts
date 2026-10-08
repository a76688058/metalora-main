/**
 * NEW4-4D-9D-1 — Cloud Run Job entrypoint (asia-northeast3): production Workshop legacy inventory,
 * METADATA-ONLY. Arguments are fixed here; any runtime argument is refused, so the job cannot be
 * switched to --apply / --verify-bytes without a new image.
 */
import { main } from './workshop-legacy-copy';

export const INVENTORY_JOB_ARGS = ['--ack-readonly-production-inventory', '--metadata-only'] as const;

if (process.argv.length > 2) {
  console.error(JSON.stringify({ status: 'refused', reason: 'arguments_not_accepted' }));
  process.exit(2);
}

main(INVENTORY_JOB_ARGS).then(
  (code) => process.exit(code),
  () => {
    console.error(JSON.stringify({ status: 'error', reason_class: 'unhandled' }));
    process.exit(1);
  },
);
