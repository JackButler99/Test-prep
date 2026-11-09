import type { Metadata } from "next";
import "./globals.css";
import "./learning-mascots.css";
import "./typography.css";
import "./disclosure.css";
import "./bank.css";
import "./reading.css";
import "./exam-room.css";
import "./assessment-workspace.css";

export const metadata: Metadata = {
  title: "ITP Practice Lab",
  description: "Latihan mandiri dan simulasi format TOEFL ITP Level 1 dengan soal orisinal.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
