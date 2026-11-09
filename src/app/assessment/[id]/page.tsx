import { ProductAssessment } from "@/components/diagnostic-assessment";
import { dashboardUser } from "@/lib/access";
import { diagnosticProductForAttempt, openPracticePackages, productMaterials, publishedProducts } from "@/lib/products";
import { durationLabel } from "@/lib/ui-format";

export default async function Assessment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await dashboardUser("student", "admin");
  if (!diagnosticProductForAttempt(id, user.id)) return <ProductAssessment key={id} id={id} allowReport={user.role === "student"} />;
  const preparation = publishedProducts().filter(product => product.kind === "preparation")
    .map(product => ({ ...product, materials: productMaterials(product.id, user.id).filter(item => item.examId === "toefl-itp") }))
    .filter(product => product.materials.length);
  const recommendations = [...openPracticePackages(user.id), ...preparation.flatMap(product => product.materials)]
    .filter(item => item.examId === "toefl-itp" && item.canStart && item.sections.length === 1)
    .map(item => ({ packageId: item.id, section: item.sections[0].key, title: item.title, count: item.count,
      duration: durationLabel(item.sections[0].durationSeconds), hasUntimed: !item.sections[0].durationSeconds, skills: item.skills }));
  return <ProductAssessment key={id} id={id} diagnostic allowReport={user.role === "student"} recommendations={recommendations}
    preparationHref={preparation[0] ? `/paket/${preparation[0].slug}` : "/paket"} />;
}
