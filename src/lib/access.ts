import "server-only";
import { getUser, type Role, type User } from "./auth";
import { HttpError } from "./http";

export function assertRole(user: User, ...roles: Role[]) {
  if (!roles.includes(user.role)) throw new HttpError("Akses tidak diizinkan.", 403);
}
export async function dashboardUser(...roles: Role[]): Promise<User> {
  const { redirect } = await import("next/navigation");
  const user = await getUser();
  if (!user) return redirect("/login");
  if (!roles.includes(user.role)) return redirect("/");
  return user;
}
