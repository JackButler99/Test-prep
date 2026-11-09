import Image from "next/image";
import "./student-room-bara.css";

export function StudentRoomBara() {
  return <span className="student-room-bara" aria-hidden="true" title="Bara · Pengawas ujian">
    <Image src="/illustrations/bara-pengawas.svg" alt="" width={48} height={35} unoptimized loading="eager" />
  </span>;
}
