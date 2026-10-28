import { writeFileSync } from "node:fs";
import { renderCvPdf } from "../src/lib/demo/cv";

const out = process.argv[2] ?? "test-cv.pdf";
const pdf = await renderCvPdf({
  name: "Marion Lefort",
  headline: "Développeuse full-stack",
  email: "marion.lefort@example.com",
  phone: "06 12 34 56 78",
  city: "Lyon",
  summary: "Six ans d'expérience sur des applications web en TypeScript, de la base de données à l'interface.",
  experience: [
    { role: "Développeuse full-stack", company: "Agence Méridienne", period: "2021 – 2026", points: ["Refonte du tunnel de commande", "Migration vers PostgreSQL et Kubernetes"] },
    { role: "Développeuse front-end", company: "Studio Lumen", period: "2019 – 2021", points: ["Design system en React", "Accessibilité WCAG AA"] },
  ],
  education: [{ title: "Master informatique", school: "Université Lyon 1", period: "2017 – 2019" }],
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
  languages: ["Français", "Anglais courant"],
  labels: { experience: "Expérience", education: "Formation", skills: "Compétences", languages: "Langues" },
});
writeFileSync(out, pdf);
console.log(out, pdf.length);
