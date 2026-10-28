import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const admin = {
  name: "Claire Dubois",
  email: "claire@atelier-e2e.test",
  password: "mot-de-passe-solide",
  company: "Atelier E2E",
};
const candidate = { firstName: "Marion", lastName: "Lefort", email: "marion.lefort@e2e.test" };
const jobTitle = "Développeur full-stack (F/H)";

test("create a job, publish it, apply, find the candidate, move and reject with an email", async ({
  page,
}) => {
  // First-run setup creates the admin account and the company.
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Votre nom").fill(admin.name);
  await page.getByLabel("Adresse email professionnelle").fill(admin.email);
  await page.getByLabel("Mot de passe").fill(admin.password);
  await page.getByLabel("Nom de l'entreprise").fill(admin.company);
  await page.getByRole("button", { name: "Créer l'espace" }).click();
  await expect(page).toHaveURL(/\/jobs$/);

  // Create and publish a job.
  await page.getByRole("link", { name: "Créer une offre" }).first().click();
  await page.getByLabel("Intitulé du poste").fill(jobTitle);
  await page.locator(".tiptap").click();
  await page.keyboard.type("Vous rejoignez une équipe de quatre personnes.");
  await page.getByLabel("Service").fill("Produit");
  await page.getByLabel("Lieu").fill("Lyon");
  await page.getByRole("button", { name: "Publier l'offre" }).click();
  await expect(page.getByText("Offre publiée")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: jobTitle })).toBeVisible();
  const pipelineUrl = page.url();

  // Apply from the career site, in a separate anonymous context.
  const visitor = await page.context().browser()!.newContext({ locale: "fr-FR" });
  const site = await visitor.newPage();
  await site.goto("/");
  await expect(site).toHaveURL(/\/careers\/atelier-e2e/);
  await site.getByRole("link", { name: jobTitle }).click();
  await expect(site.getByRole("heading", { level: 1, name: jobTitle })).toBeVisible();
  await expect(site.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await site.getByLabel("Prénom").fill(candidate.firstName);
  await site.getByLabel("Nom", { exact: true }).fill(candidate.lastName);
  await site.getByLabel("Email").fill(candidate.email);
  await site
    .locator("#apply-cv")
    .setInputFiles(fileURLToPath(new URL("./fixtures/cv-marion-lefort.pdf", import.meta.url)));
  await site.getByRole("checkbox", { name: /J'accepte que mes données/ }).check();
  await site.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(site.getByRole("heading", { name: "Candidature envoyée" })).toBeVisible();
  await visitor.close();

  // The candidate is in the first column of the pipeline, marked as new.
  await page.goto(pipelineUrl);
  const newColumn = page
    .getByRole("region", { name: "Pipeline de l'offre" })
    .locator("section", { has: page.getByRole("heading", { name: /^Nouveau/ }) });
  const card = newColumn.getByRole("button", {
    name: `Ouvrir la fiche de ${candidate.firstName} ${candidate.lastName}`,
  });
  await expect(card).toBeVisible();
  await expect(newColumn.getByText("1 nouveau")).toBeVisible();

  // Move it with the keyboard to the next stage (once the board is interactive).
  const announcements = page.locator('[id^="DndLiveRegion"]');
  await card.focus();
  await page.keyboard.press("Space");
  await expect(announcements).toContainText("Marion Lefort");
  await page.keyboard.press("ArrowRight");
  await expect(announcements).toContainText("au-dessus de la colonne Présélection");
  await page.keyboard.press("Space");
  await expect(page.getByText("Candidat déplacé vers Présélection")).toBeVisible();
  const screening = page.locator("section", {
    has: page.getByRole("heading", { name: /^Présélection/ }),
  });
  await expect(screening.getByRole("button", { name: /Marion Lefort/ })).toBeVisible();

  // Open the panel: the CV and the application are there.
  await screening.getByRole("button", { name: /Marion Lefort/ }).click();
  const panel = page.getByRole("complementary", { name: "Fiche candidat" });
  await expect(panel.getByRole("heading", { name: "Marion Lefort" })).toBeVisible();
  await expect(panel.getByRole("img", { name: "Page 1 sur 1" })).toBeVisible();

  // Reject with a reason and the default rejection email.
  await panel.getByRole("button", { name: "Refuser" }).click();
  const dialog = page.getByRole("dialog", { name: "Refuser le candidat" });
  await dialog.getByLabel("Motif").selectOption("position_filled");
  await expect(
    dialog.getByRole("checkbox", { name: "Envoyer un email au candidat" }),
  ).toBeChecked();
  await expect(dialog.getByText("Bonjour Marion,")).toBeVisible();
  await dialog.getByRole("button", { name: "Refuser le candidat" }).click();
  await expect(page.getByText(/Candidat refusé/).first()).toBeVisible();
  await expect(panel.getByRole("alert").filter({ hasText: "Refusé" })).toBeVisible();
  await expect(panel.getByLabel("Étape")).toHaveValue(
    (await panel.getByRole("option", { name: "Refusé" }).getAttribute("value")) ?? "",
  );

  // The rejection email is in the journal (SMTP is not configured in tests).
  await page.goto("/settings/emails");
  const journal = page
    .getByRole("region", { name: "Journal des envois" })
    .or(
      page.locator("section", { has: page.getByRole("heading", { name: "Journal des envois" }) }),
    );
  await expect(
    journal.getByText(`Votre candidature pour le poste ${jobTitle}`).first(),
  ).toBeVisible();
  await expect(journal.getByText(candidate.email).first()).toBeVisible();
  await expect(journal.getByText("Journalisé").first()).toBeVisible();
});
