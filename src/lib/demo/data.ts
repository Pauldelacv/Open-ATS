// Fictional company used for the demo. Any resemblance to a real company is unintended.
import type { ContractType, QuestionType, RemotePolicy } from "@/lib/db/schema";

export const demoCompany = {
  name: "Maison Pivert",
  slug: "maison-pivert",
  brandColor: "#1F5E4B",
  tagline: "Des meubles en bois massif, dessinés et fabriqués à Lyon",
  websiteUrl: "https://maison-pivert.example",
  privacyContactEmail: "rgpd@maison-pivert.example",
  descriptionHtml:
    "<p>Maison Pivert dessine et fabrique des tables, des chaises et des rangements en chêne et en noyer, dans un atelier de 2 000 m² à Vénissieux. Nous vendons en ligne et dans deux boutiques, à Lyon et à Paris.</p><p>Nous sommes 82 : ébénistes, designers, développeurs, conseillers et logisticiens. Les décisions se prennent près de l'établi, les horaires sont fixes et chaque meuble est signé par la personne qui l'a assemblé.</p>",
};

export const demoUsers = [
  { key: "admin", name: "Camille Roussel", email: "demo@open-ats.example", role: "admin" as const },
  { key: "recruiter", name: "Hugo Marchand", email: "hugo.marchand@open-ats.example", role: "recruiter" as const },
  { key: "member", name: "Inès Belkacem", email: "ines.belkacem@open-ats.example", role: "member" as const },
];

type DemoQuestion = { label: string; type: QuestionType; options?: string[]; required: boolean };

export type DemoJob = {
  key: string;
  title: string;
  department: string;
  location: string;
  remote: RemotePolicy;
  contract: ContractType;
  salary?: { min: number; max: number; period: "year" | "month" };
  status: "published" | "draft";
  members: string[];
  publishedDaysAgo: number;
  questions: DemoQuestion[];
  descriptionHtml: string;
};

export const demoJobs: DemoJob[] = [
  {
    key: "ebeniste",
    title: "Ébéniste d'atelier (F/H)",
    department: "Atelier",
    location: "Vénissieux",
    remote: "onsite",
    contract: "cdi",
    salary: { min: 2300, max: 2800, period: "month" },
    status: "published",
    members: ["member"],
    publishedDaysAgo: 41,
    questions: [{ label: "Avez-vous un CAP ou un BP d'ébéniste ?", type: "yes_no", required: true }],
    descriptionHtml:
      "<h2>Le poste</h2><p>Vous rejoignez l'équipe de fabrication de huit ébénistes. Vous assemblez nos tables et nos rangements, du débit au vernis, sur des séries de cinq à vingt pièces.</p><ul><li>Lire un plan et préparer les débits</li><li>Usiner, assembler et poncer</li><li>Contrôler chaque pièce avant finition</li></ul><h2>Le profil</h2><p>Vous avez au moins trois ans d'expérience en atelier et vous aimez le travail du bois massif. La pratique d'une CN est un plus, nous formons sur place.</p><h2>Ce que nous proposons</h2><ul><li>Horaires fixes de 7 h 30 à 15 h 30, du lundi au vendredi</li><li>Mutuelle prise en charge à 80 %</li><li>Un meuble de la collection par an</li></ul>",
  },
  {
    key: "dev",
    title: "Développeur full-stack (F/H)",
    department: "Produit numérique",
    location: "Lyon",
    remote: "hybrid",
    contract: "cdi",
    salary: { min: 45000, max: 55000, period: "year" },
    status: "published",
    members: ["member"],
    publishedDaysAgo: 18,
    questions: [
      { label: "Avez-vous déjà travaillé avec PostgreSQL ?", type: "yes_no", required: false },
      { label: "Quand pourriez-vous commencer ?", type: "single_choice", options: ["Immédiatement", "Sous un mois", "Sous trois mois"], required: true },
    ],
    descriptionHtml:
      "<h2>Le poste</h2><p>Notre boutique en ligne et nos outils internes (devis, suivi de fabrication, livraisons) sont développés par une équipe de quatre personnes. Vous prenez en charge des fonctionnalités de bout en bout, de la base de données à l'interface.</p><ul><li>Faire évoluer le configurateur de meubles sur mesure</li><li>Relier la boutique au suivi de l'atelier</li><li>Améliorer les performances et l'accessibilité du site</li></ul><h2>Le profil</h2><p>Trois ans d'expérience en TypeScript, à l'aise avec React et Node.js. Vous écrivez des tests et vous aimez comprendre le métier des personnes qui utilisent vos outils.</p><h2>Ce que nous proposons</h2><ul><li>Deux jours de télétravail par semaine</li><li>Un poste dans nos bureaux au-dessus de la boutique de Lyon</li><li>Budget formation de 1 500 € par an</li></ul>",
  },
  {
    key: "sales",
    title: "Chargé de clientèle professionnelle (F/H)",
    department: "Commercial",
    location: "Lyon",
    remote: "hybrid",
    contract: "cdi",
    salary: { min: 36000, max: 42000, period: "year" },
    status: "published",
    members: [],
    publishedDaysAgo: 27,
    questions: [{ label: "Dans quel secteur avez-vous vendu jusqu'ici ?", type: "short_text", required: false }],
    descriptionHtml:
      "<h2>Le poste</h2><p>Vous accompagnez les architectes, hôtels et bureaux qui équipent leurs espaces avec nos meubles : premier échange, devis, suivi de fabrication et livraison.</p><ul><li>Répondre aux demandes entrantes et relancer les devis</li><li>Préparer les échantillons de bois et de finitions</li><li>Coordonner les délais avec l'atelier</li></ul><h2>Le profil</h2><p>Deux ans d'expérience en vente B2B, idéalement dans l'aménagement ou la décoration. Vous écrivez clairement et vous tenez vos délais.</p>",
  },
  {
    key: "marketing",
    title: "Alternance marketing digital (F/H)",
    department: "Marketing",
    location: "Lyon",
    remote: "hybrid",
    contract: "apprenticeship",
    status: "published",
    members: [],
    publishedDaysAgo: 9,
    questions: [{ label: "Quel est votre rythme d'alternance ?", type: "short_text", required: true }],
    descriptionHtml:
      "<h2>Le poste</h2><p>Pendant un ou deux ans, vous travaillez avec notre responsable marketing sur la newsletter, les réseaux sociaux et les fiches produits de la boutique en ligne.</p><ul><li>Rédiger et programmer la newsletter mensuelle</li><li>Photographier les meubles à l'atelier avec notre photographe</li><li>Suivre les résultats des campagnes</li></ul><h2>Le profil</h2><p>Vous préparez un bac +3 à bac +5 en marketing ou communication et vous écrivez bien.</p>",
  },
  {
    key: "design",
    title: "Stage design produit (F/H)",
    department: "Bureau d'études",
    location: "Vénissieux",
    remote: "onsite",
    contract: "internship",
    status: "published",
    members: ["member"],
    publishedDaysAgo: 33,
    questions: [{ label: "Lien vers votre portfolio", type: "short_text", required: true }],
    descriptionHtml:
      "<h2>Le stage</h2><p>Six mois au bureau d'études, à côté de l'atelier. Vous participez au dessin de la collection 2027 : recherches, maquettes à l'échelle, plans de fabrication.</p><h2>Le profil</h2><p>École de design produit ou d'architecture intérieure, maîtrise d'un logiciel de modélisation 3D. Gratification légale et repas pris en charge.</p>",
  },
  {
    key: "logistics",
    title: "Responsable logistique (F/H)",
    department: "Logistique",
    location: "Vénissieux",
    remote: "onsite",
    contract: "cdi",
    status: "draft",
    members: [],
    publishedDaysAgo: 0,
    questions: [],
    descriptionHtml:
      "<h2>Le poste</h2><p>Vous organisez les expéditions de l'atelier vers nos clients et nos boutiques, avec une équipe de trois préparateurs.</p>",
  },
];

/** [firstName, lastName, city] — fictional people. */
export const demoPeople: Array<[string, string, string]> = [
  ["Marion", "Lefort", "Lyon"],
  ["Karim", "Benali", "Villeurbanne"],
  ["Sophie", "Martin", "Lyon"],
  ["Lucas", "Moreau", "Saint-Étienne"],
  ["Aïcha", "Diallo", "Lyon"],
  ["Thomas", "Girard", "Grenoble"],
  ["Chloé", "Fontaine", "Lyon"],
  ["Mehdi", "Haddad", "Vénissieux"],
  ["Julie", "Lambert", "Annecy"],
  ["Antoine", "Rousseau", "Lyon"],
  ["Léa", "Garnier", "Villeurbanne"],
  ["Nicolas", "Faure", "Lyon"],
  ["Yasmine", "Cherif", "Bron"],
  ["Pierre", "Blanchard", "Mâcon"],
  ["Emma", "Chevalier", "Lyon"],
  ["Sarah", "Cohen", "Paris"],
  ["Maxime", "Perrin", "Lyon"],
  ["Nadia", "Boucher", "Vaulx-en-Velin"],
  ["Romain", "Guérin", "Lyon"],
  ["Manon", "Robin", "Caluire-et-Cuire"],
  ["Bastien", "Muller", "Lyon"],
  ["Clara", "Henry", "Lyon"],
  ["Olivier", "Masson", "Vienne"],
  ["Fatou", "Ndiaye", "Lyon"],
  ["Quentin", "Dupuis", "Villefranche-sur-Saône"],
  ["Alice", "Barbier", "Lyon"],
  ["Théo", "Renaud", "Lyon"],
  ["Pauline", "Arnaud", "Écully"],
  ["Samuel", "Lévy", "Lyon"],
  ["Élodie", "Brun", "Oullins"],
  ["Adrien", "Colin", "Lyon"],
  ["Lina", "Mercier", "Lyon"],
  ["Victor", "Lacroix", "Chambéry"],
  ["Margaux", "Picard", "Lyon"],
  ["Rayan", "Benoit", "Vénissieux"],
  ["Jeanne", "Roux", "Lyon"],
  ["Gabriel", "Leclerc", "Clermont-Ferrand"],
  ["Zoé", "Gauthier", "Lyon"],
  ["Ibrahim", "Traoré", "Lyon"],
  ["Hélène", "Vidal", "Tassin-la-Demi-Lune"],
];

/** Profile material per job, used to write varied CVs. */
export const demoProfiles: Record<string, { headlines: string[]; companies: string[]; points: string[]; skills: string[]; schools: string[] }> = {
  ebeniste: {
    headlines: ["Ébéniste", "Menuisier ébéniste", "Ébéniste, finition et vernis"],
    companies: ["Atelier du Chêne Clair", "Menuiserie Vallon", "Ébénisterie des Monts", "Atelier Roche et fils"],
    points: [
      "Fabrication de tables en chêne massif en petites séries",
      "Assemblages à tenon et mortaise, queues d'aronde",
      "Réglage et programmation d'une CN 5 axes",
      "Finitions à l'huile dure et vernis à l'eau",
      "Restauration de mobilier ancien",
      "Encadrement de deux apprentis",
    ],
    skills: ["Lecture de plans", "Commande numérique", "Placage", "Finition", "Bois massif", "Sécurité machines"],
    schools: ["CAP Ébéniste, Lycée professionnel du Bois", "BP Ébéniste, CFA du Bâtiment", "BMA Ébénisterie, École Boulle"],
  },
  dev: {
    headlines: ["Développeuse full-stack", "Développeur TypeScript", "Ingénieur logiciel web"],
    companies: ["Agence Méridienne", "Studio Lumen", "Coopérative Numérique Rhône", "Transports Alvéole", "Éditions Pixel"],
    points: [
      "Refonte du tunnel de commande d'une boutique en ligne",
      "Migration d'une application vers PostgreSQL et Kubernetes",
      "Design system en React, accessibilité WCAG AA",
      "API Node.js pour la planification de tournées",
      "Mise en place de tests de bout en bout avec Playwright",
      "Réduction de 40 % du temps de chargement des pages produit",
    ],
    skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "Playwright", "Next.js"],
    schools: ["Master informatique, Université Lyon 1", "École d'ingénieurs INSA Lyon", "BUT Informatique, IUT Lyon 1"],
  },
  sales: {
    headlines: ["Chargée de clientèle B2B", "Commercial grands comptes", "Conseiller en aménagement"],
    companies: ["Bureaux & Espaces", "Mobilier Contemporain Rhône", "Lumière Hôtellerie", "Agencement Duval"],
    points: [
      "Suivi d'un portefeuille de 60 clients professionnels",
      "Devis et négociation de projets d'aménagement de bureaux",
      "Coordination des livraisons avec les équipes de pose",
      "Progression du chiffre d'affaires de 18 % en deux ans",
      "Présentation des collections sur salons professionnels",
    ],
    skills: ["Négociation", "CRM", "Devis", "Relation client", "Anglais professionnel"],
    schools: ["BTS Négociation et digitalisation de la relation client", "Licence commerce, IAE Lyon", "Bachelor business, école de commerce"],
  },
  marketing: {
    headlines: ["Étudiante en marketing digital", "Alternant communication", "Étudiant en master marketing"],
    companies: ["Librairie des Quais (stage)", "Association Culture Croix-Rousse", "Café Poivre (job étudiant)", "Agence Fil Rouge (stage)"],
    points: [
      "Rédaction de la newsletter et des publications Instagram",
      "Suivi des statistiques d'une campagne locale",
      "Organisation d'un événement de 200 personnes",
      "Prises de vue produits et retouche",
    ],
    skills: ["Rédaction", "Canva", "Photographie", "Statistiques web", "Réseaux sociaux"],
    schools: ["Bachelor marketing digital, en cours", "BUT Information-communication, en cours", "Master marketing, en cours"],
  },
  design: {
    headlines: ["Étudiante en design produit", "Étudiant en design d'objet", "Designer produit junior"],
    companies: ["Atelier Formes (stage)", "Studio Ardoise (stage)", "FabLab de la Guillotière"],
    points: [
      "Conception d'une chaise empilable en contreplaqué",
      "Maquettes à l'échelle 1:5 et prototypes en atelier",
      "Modélisation 3D et plans de fabrication",
      "Étude de matériaux biosourcés",
    ],
    skills: ["Rhino", "Fusion 360", "Croquis", "Maquette", "Dessin technique"],
    schools: ["DN MADe design d'objet, en cours", "École de design Nantes Atlantique, en cours", "ENSCI, en cours"],
  },
};

export const demoTags = ["Anglais courant", "Permis B", "Vivier 2027", "Recommandé", "Disponible rapidement", "Portfolio solide"];
