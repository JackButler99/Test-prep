import Image from "next/image";
import type { ReactNode } from "react";
import "./exam-proctor.css";

export function ExamProctor({ children }: { children: ReactNode }) {
  return <div className="exam-proctor">
    <div className="exam-proctor-copy">{children}</div>
    <figure className="exam-proctor-mascot" aria-hidden="true">
      <Image src="/illustrations/bara-pengawas.svg" alt="" width={240} height={176} unoptimized />
      <figcaption>Bara · Pengawas</figcaption>
    </figure>
  </div>;
}
