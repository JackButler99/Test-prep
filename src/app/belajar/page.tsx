import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StudyPage() {
  const user = await getUser();
  redirect(user ? "/#jenis-tes" : "/paket");
}
