import "server-only";

import { assertRole } from "./access";
import type { User } from "./auth";
import { db } from "./db";
import type { PackageSnapshot } from "./learning-types";

export function adminPreviewSnapshot(user: User, packageId: string) {
  assertRole(user, "admin");
  const row = db().prepare("SELECT snapshot_json FROM assessment_packages WHERE id=? AND state IN ('draft','published')")
    .get(packageId) as { snapshot_json: string } | undefined;
  return row ? JSON.parse(row.snapshot_json) as PackageSnapshot : null;
}
