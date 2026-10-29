import type { EmailTemplateKind, Locale } from "@/lib/db/schema";

// Default email templates created with every organisation. Kept out of the message catalogues
// because their {{variables}} would clash with ICU message syntax.
type DefaultTemplate = { name: string; kind: EmailTemplateKind; subject: string; body: string };

export const defaultTemplates: Record<Locale, DefaultTemplate[]> = {
  fr: [
    {
      name: "Accusé de réception",
      kind: "confirmation",
      subject: "Votre candidature pour le poste {{offre}}",
      body: "Bonjour {{prénom}},\n\nNous avons bien reçu votre candidature pour le poste {{offre}}. Nous la lisons avec attention et revenons vers vous dans les prochains jours.\n\nMerci de l'intérêt que vous portez à {{entreprise}}.\n\nL'équipe recrutement de {{entreprise}}",
    },
    {
      name: "Refus après candidature",
      kind: "rejection",
      subject: "Votre candidature pour le poste {{offre}}",
      body: "Bonjour {{prénom}},\n\nMerci d'avoir postulé au poste {{offre}}. Après avoir étudié votre candidature, nous avons choisi de ne pas poursuivre avec votre profil pour ce poste.\n\nCette décision tient à nos besoins actuels et ne remet pas en cause la qualité de votre parcours. Nous vous souhaitons une bonne continuation.\n\n{{recruteur}}\n{{entreprise}}",
    },
    {
      name: "Refus après entretien",
      kind: "rejection",
      subject: "Suite à nos échanges pour le poste {{offre}}",
      body: "Bonjour {{prénom}},\n\nMerci pour le temps que vous nous avez accordé lors de nos échanges pour le poste {{offre}}. Nous avons finalement retenu une autre candidature, plus proche de nos besoins actuels.\n\nCe choix a été difficile. Si vous le souhaitez, nous pouvons vous faire un retour plus détaillé par téléphone.\n\n{{recruteur}}\n{{entreprise}}",
    },
    {
      name: "Proposition d'entretien",
      kind: "interview",
      subject: "Échangeons sur le poste {{offre}}",
      body: "Bonjour {{prénom}},\n\nVotre candidature pour le poste {{offre}} a retenu notre attention et nous aimerions en parler avec vous.\n\nPouvez-vous nous indiquer vos disponibilités pour un premier échange de 30 minutes dans les prochains jours ?\n\n{{recruteur}}\n{{entreprise}}",
    },
  ],
  en: [
    {
      name: "Application received",
      kind: "confirmation",
      subject: "Your application for {{job}}",
      body: "Hello {{first_name}},\n\nWe have received your application for the {{job}} position. We are reading it carefully and will get back to you in the coming days.\n\nThank you for your interest in {{company}}.\n\nThe {{company}} recruiting team",
    },
    {
      name: "Rejection after application",
      kind: "rejection",
      subject: "Your application for {{job}}",
      body: "Hello {{first_name}},\n\nThank you for applying for the {{job}} position. After reviewing your application, we have decided not to move forward with your profile for this role.\n\nThis decision reflects our current needs and is not a judgement on your background. We wish you all the best.\n\n{{recruiter}}\n{{company}}",
    },
    {
      name: "Rejection after interview",
      kind: "rejection",
      subject: "Following our conversations about {{job}}",
      body: "Hello {{first_name}},\n\nThank you for the time you gave us during our conversations about the {{job}} position. We have decided to move forward with another candidate whose profile is closer to our current needs.\n\nThis was a difficult choice. If you wish, we can give you more detailed feedback over the phone.\n\n{{recruiter}}\n{{company}}",
    },
    {
      name: "Interview invitation",
      kind: "interview",
      subject: "Let's talk about the {{job}} position",
      body: "Hello {{first_name}},\n\nYour application for the {{job}} position caught our attention and we would like to talk with you.\n\nCould you share your availability for a first 30-minute conversation in the coming days?\n\n{{recruiter}}\n{{company}}",
    },
  ],
};
