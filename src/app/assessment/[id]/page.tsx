import { ProductAssessment, type Recommendation } from "@/components/diagnostic-assessment";
import { dashboardUser } from "@/lib/access";
import { diagnosticProductForAttempt, openPracticePackages, ownedProducts, productMaterials, publishedProducts } from "@/lib/products";
import { durationLabel } from "@/lib/ui-format";

export default async function Assessment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await dashboardUser("student", "admin");
  const allowReport = user.role === "student";
  if (!diagnosticProductForAttempt(id, user.id)) return <ProductAssessment key={id} id={id} allowReport={allowReport} />;
  const products = new Map([...publishedProducts(), ...ownedProducts(user.id)].map(product => [product.id, product]));
  const materials = [
    ...openPracticePackages(user.id).map(item => ({ item, href: undefined })),
    ...[...products.values()].filter(product => product.kind === "preparation").flatMap(product =>
      productMaterials(product.id, user.id).map(item => ({ item, href: `/paket/${product.slug}` }))),
  ];
  const recommendations: Recommendation[] = [];
  for (const { item, href } of materials) {
    if (!item.available || item.examId !== "toefl-itp") continue;
    for (const section of item.sections) {
      const start = item.canStart && item.sections.length === 1
        ? { packageId: item.id, title: item.title, count: item.count, duration: durationLabel(section.durationSeconds), hasUntimed: !section.durationSeconds }
        : undefined;
      if (start || href) recommendations.push({ section: section.key, skills: section.skills, start, href });
    }
  }
  return <ProductAssessment key={id} id={id} diagnostic allowReport={allowReport} recommendations={recommendations} />;
}
