type StudyTopic = {
  title: string;
  content: string;
  strategy: string;
};

type StudyGuide = {
  id: string;
  title: string;
  category: string;
  summary: string;
  format: string[];
  scope: string;
  topics: StudyTopic[];
  tips: string[];
  sources: { label: string; href: string }[];
};

export const guideReviewedOn = "2026-11-08";

export const studyGuides: StudyGuide[] = [
  {
    id: "toefl-itp",
    title: "TOEFL ITP",
    category: "Bahasa Inggris",
    summary: "Tes kemampuan bahasa Inggris untuk konteks akademik dan sosial. Konfirmasi level dan skor yang diminta kampus atau lembagamu.",
    format: [
      "Level 1 · 140 soal pilihan ganda · 115 menit waktu tes · skala skor resmi 310–677.",
      "Level 2 · 95 soal pilihan ganda · 70 menit waktu tes · skala skor resmi 200–500.",
      "Speaking adalah tes terpisah yang tersedia bersama TOEFL ITP digital.",
    ],
    scope: "Panduan dan simulasi penuh di aplikasi berfokus pada Level 1. Hasil simulasi di aplikasi menampilkan jumlah jawaban benar. Setiap institusi menentukan skor resmi yang diterimanya.",
    topics: [
      {
        title: "Listening Comprehension · 50 soal · 35 menit",
        content: "Part A berisi dialog pendek. Part B berisi percakapan lebih panjang dan Part C berisi paparan. Satu percakapan atau paparan panjang diikuti beberapa pertanyaan.",
        strategy: "Dengarkan perubahan rencana. Jika pertanyaan pembuka menyebut today dan penutur kemudian mengatakan she will arrive tomorrow, tomorrow menjawab pertanyaan tentang kapan dia tiba.",
      },
      {
        title: "Structure and Written Expression · 40 soal · 25 menit",
        content: "Lengkapi kalimat atau identifikasi bagian yang salah. Latih hubungan subjek dan kata kerja, kelengkapan klausa, bentuk kata, dan paralelisme.",
        strategy: "Cari inti subjek sebelum memilih kata kerja. Pada The list of topics is on the desk, list adalah inti subjek tunggal. Frasa of topics hanya menjelaskan isinya.",
      },
      {
        title: "Reading Comprehension · 50 soal · 55 menit",
        content: "Pahami gagasan utama, detail, kesimpulan yang didukung teks, dan makna kosakata dalam konteks.",
        strategy: "Untuk soal detail, temukan kalimat buktinya lalu cocokkan maknanya dengan opsi. Periksa apakah opsi menambahkan sebab atau kepastian yang tidak dinyatakan dalam teks.",
      },
    ],
    tips: [
      "Saat latihan Listening, dengarkan sekali dahulu. Putar ulang saat pembahasan untuk menandai petunjuk yang terlewat.",
      "Latih bagian yang paling sering salah, lalu coba satu set bertimer untuk membiasakan diri dengan alokasi waktu per bagian.",
      "Baca petunjuk penyelenggara sebelum hari tes, terutama aturan pencatatan dan navigasi soal untuk format yang kamu ikuti.",
    ],
    sources: [
      { label: "ETS · Struktur TOEFL ITP Level 1 dan Level 2", href: "https://www.ets.org/toefl/itp/test-content.html" },
      { label: "ETS · Panduan peserta dan contoh soal", href: "https://www.ets.org/pdfs/toefl-itp-test-taker-handbook.pdf" },
      { label: "ETS · Ketentuan skor yang diterima institusi", href: "https://www.ets.org/pdfs/toefl/toefl-itp-reliability-table.pdf" },
    ],
  },
  {
    id: "cpns-skd",
    title: "CPNS",
    category: "Seleksi kerja",
    summary: "Latih TWK, TIU, dan TKP, lalu kerjakan simulasi SKD dengan timer gabungan.",
    format: [
      "Simulasi independen dengan acuan KepmenPANRB 321 Tahun 2024 untuk CPNS tahun anggaran 2024.",
      "110 soal dengan durasi umum 100 menit dalam acuan tersebut, mencakup 30 TWK, 35 TIU, dan 45 TKP.",
      "Jawaban benar pada TWK dan TIU bernilai 5. Opsi TKP berbobot 1–5. Soal kosong bernilai 0.",
    ],
    scope: "Skor latihan mengikuti bobot paket. Jadwal pendaftaran, syarat, dan ketentuan kelulusan mengikuti pengumuman resmi untuk periode dan formasi yang kamu ikuti.",
    topics: [
      { title: "TWK · Tes Wawasan Kebangsaan", content: "Latih nasionalisme, integritas, bela negara, pilar negara, dan bahasa negara.", strategy: "Baca situasinya, cari prinsip yang diuji, lalu cocokkan pilihan dengan dasar atau ketentuan yang relevan." },
      { title: "TIU · Tes Intelegensia Umum", content: "Latih analogi dan silogisme, perhitungan dan soal cerita, serta pola gambar.", strategy: "Uji satu aturan pada seluruh data. Pada soal figural, cek posisi, arah, dan jumlah elemen secara terpisah." },
      { title: "TKP · Tes Karakteristik Pribadi", content: "Latih penilaian situasi layanan publik, jejaring kerja, sosial budaya, teknologi informasi, profesionalisme, dan antiradikalisme.", strategy: "Bandingkan dampak, kewenangan, dan tindak lanjut dari setiap respons. Tinjau alasan mengapa satu respons mendapat bobot latihan lebih tinggi." },
    ],
    tips: [
      "Gunakan latihan singkat untuk mengenali pola, lalu jalankan simulasi penuh untuk memeriksa alokasi waktu lintas bagian.",
      "Saat membahas TKP, perhatikan pilihan yang sudah baik tetapi belum menyelesaikan masalah atau belum menjangkau pihak yang perlu dilibatkan.",
    ],
    sources: [
      { label: "KepmenPANRB 321 Tahun 2024 · Materi dan penilaian SKD", href: "https://www.kemhan.go.id/ropeg/wp-content/uploads/2024/08/Kepmenpanrb-No-321-Th-2024-ttg-NAB-SKD-Pengadaan-PNS-Th-2024.pdf" },
      { label: "BKN · Pengumuman resmi melalui SSCASN", href: "https://sscasn.bkn.go.id/" },
    ],
  },
  {
    id: "casn-tiu",
    title: "TIU CPNS",
    category: "Seleksi kerja",
    summary: "Tes Intelegensia Umum (TIU) merupakan salah satu komponen Seleksi Kompetensi Dasar (SKD) CPNS, bersama TWK dan TKP.",
    format: [
      "Acuan materi · KepmenPANRB Nomor 321 Tahun 2024 untuk pengadaan PNS tahun anggaran 2024.",
      "Dalam acuan tersebut, TIU terdiri atas 35 soal yang mencakup kemampuan verbal, numerik, dan figural.",
    ],
    scope: "Latihan di kategori ini berfokus pada TIU. Gunakan pengumuman resmi untuk tahun dan kebutuhan formasi yang kamu ikuti saat mengecek aturan, waktu, dan ambang batas SKD.",
    topics: [
      {
        title: "Kemampuan verbal",
        content: "Analogi kata, silogisme, dan penalaran analitis. Cari hubungan antarkonsep atau kesimpulan yang didukung oleh informasi soal.",
        strategy: "Pada silogisme, uji apakah kesimpulan wajib benar. Jika semua A adalah B dan sebagian B adalah C, hubungan antara A dan C masih bisa berbeda pada beberapa contoh.",
      },
      {
        title: "Kemampuan numerik",
        content: "Berhitung, deret angka, perbandingan kuantitatif, dan soal cerita.",
        strategy: "Samakan satuan sebelum menghitung. Jika satu data dalam menit dan data lain dalam jam, ubah keduanya ke satu satuan sebelum membandingkan laju.",
      },
      {
        title: "Kemampuan figural",
        content: "Analogi gambar, mencari gambar yang berbeda, dan melanjutkan pola gambar.",
        strategy: "Periksa jumlah elemen, posisi, arah, dan arsiran secara terpisah. Uji aturan yang sama pada beberapa langkah sebelum memilih gambar berikutnya.",
      },
    ],
    tips: [
      "Tulis informasi yang diketahui dan apa yang ditanya sebelum membuat model soal cerita.",
      "Ulangi soal yang lambat dengan alasan yang jelas, misalnya salah membaca syarat, salah hitung, atau memilih aturan pola terlalu cepat.",
    ],
    sources: [
      { label: "JDIH Kementerian PANRB · KepmenPANRB Nomor 321 Tahun 2024", href: "https://jdih.menpan.go.id/dokumen-hukum/keputusan-menteri-pendayagunaan-aparatur-negara-dan-reformasi-birokrasi-nomor-321-tahun-2024-tentang-1851" },
      { label: "Kementerian Pertahanan · Salinan keputusan dan rincian materi", href: "https://www.kemhan.go.id/ropeg/wp-content/uploads/2024/08/Kepmenpanrb-No-321-Th-2024-ttg-NAB-SKD-Pengadaan-PNS-Th-2024.pdf" },
      { label: "BKN · Portal SSCASN untuk pengumuman seleksi", href: "https://sscasn.bkn.go.id/" },
    ],
  },
  {
    id: "utbk",
    title: "UTBK–SNBT",
    category: "Seleksi perguruan tinggi",
    summary: "UTBK adalah ujian berbasis komputer yang hasilnya dipakai dalam jalur Seleksi Nasional Berdasarkan Tes (SNBT).",
    format: [
      "Acuan · Framework resmi UTBK–SNBT 2026.",
      "Tujuh subtes · Tes Potensi Skolastik dan Tes Literasi · 195 menit pada pelaksanaan 2026.",
    ],
    scope: "Gunakan format 2026 sebagai acuan belajar. Jadwal, ketentuan, dan cakupan untuk tahun pendaftaranmu mengikuti pengumuman SNPMB tahun tersebut. Paket di aplikasi dapat mencakup sebagian subtes.",
    topics: [
      {
        title: "Penalaran Umum",
        content: "Penalaran induktif, deduktif, dan kuantitatif. Cari aturan dari contoh, terapkan premis, atau analisis hubungan antarangka.",
        strategy: "Coba aturan yang kamu pilih pada semua data yang tersedia. Satu contoh yang cocok masih bisa sesuai dengan beberapa aturan berbeda.",
      },
      {
        title: "Pengetahuan dan Pemahaman Umum",
        content: "Makna kata dan frasa dalam konteks, serta hubungan informasi dalam bacaan.",
        strategy: "Masukkan makna yang kamu pilih kembali ke kalimat dan cek apakah hubungan maknanya dengan kalimat sekitar tetap masuk akal.",
      },
      {
        title: "Pemahaman Bacaan dan Menulis",
        content: "Pemilihan, penataan, dan perbaikan gagasan dalam kalimat atau paragraf.",
        strategy: "Saat memilih kalimat yang tepat, cek fungsi kalimat itu dalam paragraf, misalnya memberi contoh, menambah alasan, atau menyimpulkan.",
      },
      {
        title: "Pengetahuan Kuantitatif",
        content: "Konsep bilangan, aljabar, geometri dan pengukuran, analisis data, serta peluang.",
        strategy: "Perkirakan rentang hasil sebelum menghitung tepat. Perkiraan membantu menemukan salah satuan, salah tanda, dan pilihan yang mustahil.",
      },
      {
        title: "Literasi dalam Bahasa Indonesia",
        content: "Pahami informasi, hubungkan bagian-bagian teks, dan evaluasi gagasan berdasarkan bukti dalam bacaan.",
        strategy: "Bedakan apa yang dikatakan penulis dari kesimpulan yang kamu tarik. Uji kesimpulan itu dengan menunjuk bagian teks yang mendukungnya.",
      },
      {
        title: "Literasi dalam Bahasa Inggris",
        content: "Pahami isi dan hubungan gagasan dalam teks bahasa Inggris, termasuk makna yang dapat disimpulkan dari konteks.",
        strategy: "Cari padanan makna antarkalimat. Kata sambung seperti although atau however bisa membantu melihat batas dan arah argumen penulis.",
      },
      {
        title: "Penalaran Matematika",
        content: "Gunakan konsep matematika untuk memodelkan situasi, menyelesaikan masalah, dan menafsirkan hasilnya.",
        strategy: "Nyatakan dulu apa yang diwakili variabel, misalnya tarif per kilometer. Setelah menghitung, jelaskan makna hasil dalam situasi soal.",
      },
    ],
    tips: [
      "Latih tiap subtes dengan durasi yang tercantum pada acuan tahun yang dipakai.",
      "Saat membahas jawaban, tandai tahap yang perlu diperbaiki, mulai dari memahami bacaan, membangun model, sampai menghitung.",
    ],
    sources: [
      { label: "SNPMB · Framework UTBK–SNBT 2026", href: "https://snpmb.id/fr/" },
      { label: "SNPMB · Informasi umum UTBK–SNBT", href: "https://www.snpmb.id/utbk-snbt/informasi-umum" },
    ],
  },
  {
    id: "tpa",
    title: "Tes Potensi Akademik",
    category: "Penalaran umum",
    summary: "TPA mengukur kemampuan mengolah informasi dan bernalar. Cek penyelenggara yang diminta oleh kampus, lembaga, atau program seleksimu.",
    format: [
      "Acuan contoh · TPA Bappenas mencakup verbal, numerik, dan penalaran.",
      "Jumlah soal, waktu, dan cara penilaian mengikuti ketentuan penyelenggara yang kamu pilih.",
    ],
    scope: "Kategori ini menyediakan kerangka belajar untuk keterampilan umum TPA. Cocokkan format latihan dengan panduan tes tujuanmu.",
    topics: [
      {
        title: "Verbal",
        content: "Pahami makna dan hubungan kata serta informasi yang disampaikan dalam bahasa.",
        strategy: "Pada analogi, buat frasa yang menjelaskan hubungan pasangan awal. Terapkan frasa yang sama pada pilihan jawaban, termasuk arah hubungannya.",
      },
      {
        title: "Numerik",
        content: "Gunakan informasi angka untuk membandingkan besaran, melihat pola, dan menyelesaikan persoalan hitung.",
        strategy: "Ubah data persentase ke basis yang sama. Penurunan 20% dari 100 dan kenaikan 20% dari 80 memakai besaran awal yang berbeda.",
      },
      {
        title: "Penalaran",
        content: "Susun informasi yang tersebar dan tentukan kesimpulan logis dari kondisi yang diberikan.",
        strategy: "Untuk soal urutan, buat tabel posisi. Catat syarat wajib dan coret pilihan yang melanggar salah satu syarat.",
      },
    ],
    tips: [
      "Latih satu tipe soal sampai kamu bisa menjelaskan alasan jawabannya. Setelah itu, campurkan beberapa tipe dalam satu sesi.",
      "Gunakan contoh dan aturan waktu dari penyelenggara yang dituju ketika membuat latihan bertimer.",
    ],
    sources: [
      { label: "UUO PT Bappenas · Pengenalan dan materi TPA Bappenas", href: "https://koperasi.bappenas.go.id/jadwal-tpa/apa-itu-tpa-bappenas" },
    ],
  },
  {
    id: "ielts",
    title: "IELTS",
    category: "Bahasa Inggris",
    summary: "IELTS menguji empat keterampilan bahasa Inggris. Academic biasanya dipakai untuk studi tingkat perguruan tinggi atau registrasi profesi. General Training sering dipakai untuk kebutuhan migrasi, pelatihan, atau studi di bawah tingkat gelar.",
    format: [
      "Academic dan General Training memiliki Listening dan Speaking yang sama. Reading dan Writing berbeda menurut varian.",
      "Listening sekitar 30 menit · Reading 60 menit · Writing 60 menit · Speaking 11–14 menit.",
      "IELTS mengumumkan transisi ke tes komputer mulai pertengahan 2026. Pilihan Writing on Paper tersedia di negara tertentu. Cek opsi yang ditawarkan pusat tesmu.",
    ],
    scope: "Latihan di aplikasi berfokus pada soal objektif Listening dan Reading. Panduan di bawah juga mengenalkan Writing dan Speaking untuk persiapan tes lengkap.",
    topics: [
      {
        title: "Listening",
        content: "Empat bagian dengan total 40 soal, mulai dari situasi sosial sehari-hari hingga situasi pendidikan dan akademik.",
        strategy: "Untuk isian, baca batas jumlah kata dan perkirakan bentuk jawaban, misalnya nama, tanggal, atau jumlah. Saat memeriksa, cocokkan ejaan dan bentuk tunggal atau jamaknya.",
      },
      {
        title: "Reading",
        content: "Terdiri atas 40 soal. Academic memakai bacaan yang sesuai untuk konteks akademik. General Training mencakup bacaan sehari-hari, pekerjaan, dan satu bacaan umum yang lebih panjang.",
        strategy: "Untuk True, False, Not Given, tandai bukti yang mendukung, bertentangan, atau tidak cukup untuk menilai pernyataan. Gunakan jenis label yang diminta soal.",
      },
      {
        title: "Writing",
        content: "Task 1 Academic meminta penjelasan informasi visual, sedangkan Task 1 General Training meminta surat. Task 2 berupa esai pada kedua varian dan memiliki bobot lebih besar.",
        strategy: "Untuk Academic Task 1, cari gambaran umum dan pilih perbandingan yang paling penting. Untuk General Training Task 1, cek tujuan surat, siapa penerimanya, dan semua butir instruksi.",
      },
      {
        title: "Speaking",
        content: "Tiga bagian berupa tanya jawab awal, berbicara dengan topik yang diberikan, dan diskusi lanjutan.",
        strategy: "Latih jawaban singkat yang langsung menjawab pertanyaan, lalu tambahkan alasan atau contoh yang relevan. Rekam latihanmu untuk mengecek kelancaran dan kejelasan.",
      },
    ],
    tips: [
      "Cocokkan varian IELTS dan band yang dibutuhkan dengan ketentuan lembaga tujuan.",
      "Gunakan kriteria resmi IELTS saat membahas tulisan dan rekaman lisan, termasuk tanggapan terhadap tugas, keterpaduan, kosakata, tata bahasa, dan pelafalan sesuai bagian yang dinilai.",
    ],
    sources: [
      { label: "IELTS · Format Academic", href: "https://ielts.org/take-a-test/test-types/ielts-academic-test" },
      { label: "IELTS · Format General Training", href: "https://ielts.org/take-a-test/test-types/ielts-general-training-test" },
      { label: "IELTS · Kriteria penilaian dan band", href: "https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail" },
      { label: "IELTS · Pembaruan cara mengikuti tes", href: "https://ielts.org/news-and-insights/updates-to-ielts-test-delivery" },
    ],
  },
];

export function studyGuide(examId: string) {
  return studyGuides.find(guide => guide.id === examId);
}
