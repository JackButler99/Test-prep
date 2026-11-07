import "server-only";
import { db } from "./db";

export function canStartProductPackage(userId: string, packageId: string, visibility: string) {
  const offer = db().prepare(`SELECT p.access, p.state, g.user_id AS granted
    FROM practice_product_packages m JOIN practice_products p ON p.id=m.product_id
    LEFT JOIN practice_product_access g ON g.product_id=p.id AND g.user_id=?
    WHERE m.package_id=?`).get(userId, packageId);
  if (!offer) return visibility === "public";
  if (offer.access === "free") return offer.state === "published";
  return offer.granted === userId && (offer.state === "published" || offer.state === "archived");
}
