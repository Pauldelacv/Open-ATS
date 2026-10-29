"use client";

import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { Archive, Copy, Mail, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { BoardCard } from "@/lib/services/pipeline";
import { Wordmark } from "@/components/app/logo";
import { CardOverlay, KanbanCard } from "@/components/pipeline/kanban-card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dropzone } from "@/components/ui/dropzone";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Highlighted, Mark } from "@/components/ui/mark";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RatingDots, RatingInput } from "@/components/ui/rating";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

const colors: Array<[string, string, string]> = [
  ["ink", "#18233A", "Texte, titres"],
  ["ink-muted", "#586174", "Texte secondaire"],
  ["ink-subtle", "#6B7383", "Indications, désactivé"],
  ["paper", "#FFFFFF", "Contenus"],
  ["stone", "#EEF0EC", "Fond de l'application"],
  ["stone-strong", "#E3E6E0", "Colonnes, survol"],
  ["line", "#D5D9D2", "Bordures"],
  ["line-strong", "#868E83", "Bordures des champs"],
  ["cobalt", "#2447D6", "Actions, liens, focus"],
  ["cobalt-tint", "#E9EDFC", "Sélection"],
  ["highlighter", "#FFE45C", "Nouveau, mention, recherche"],
  ["success", "#1E7A4C", "Embauché"],
  ["danger", "#B3261E", "Refusé, erreurs"],
  ["warning", "#A15C00", "En attente"],
];

const scale = [
  ["text-48", "48 / 56", "Rejoignez une équipe qui fabrique"],
  ["text-32", "32 / 40", "Développeur full-stack (F/H)"],
  ["text-24", "24 / 32", "Offres"],
  ["text-20", "20 / 28", "Refuser le candidat"],
  ["text-16", "16 / 24", "Marion a postulé il y a 2 jours avec un CV de 2 pages."],
  ["text-14", "14 / 20", "Déplacer vers Entretien"],
  ["text-13", "13 / 18", "Présélection, 12 candidats"],
  ["text-12", "12 / 16", "Il y a 3 jours"],
] as const;

const richLabels = {
  toolbar: "Mise en forme",
  bold: "Gras",
  italic: "Italique",
  heading2: "Titre",
  heading3: "Sous-titre",
  bulletList: "Liste à puces",
  orderedList: "Liste numérotée",
  link: "Lien",
  linkUrl: "Adresse du lien",
  applyLink: "Appliquer",
  removeLink: "Retirer le lien",
};

const dropLabels = {
  prompt: "Déposez votre CV ici ou",
  browse: "parcourez vos fichiers",
  constraints: "PDF ou DOCX, 10 Mo maximum",
  replace: "Remplacer",
  remove: "Retirer",
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-t border-line py-10 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="mb-6 text-20 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function State({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="text-12 text-ink-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const forced = {
  focus: "outline-2 outline-offset-2 outline-cobalt",
  fieldFocus: "border-cobalt outline-1 outline-offset-0 outline-cobalt",
};

export function DesignShowcase() {
  const [rating, setRating] = useState<number | null>(4);
  const [file, setFile] = useState<File | null>(null);
  const [html, setHtml] = useState(
    "<h2>Vos missions</h2><p>Vous concevez et faites évoluer notre outil de <strong>gestion des commandes</strong>.</p><ul><li>Développer de nouvelles fonctionnalités</li><li>Améliorer la qualité du code</li></ul>",
  );
  const sampleFile =
    typeof File !== "undefined"
      ? new File([new Uint8Array(248_000)], "CV-Marion-Lefort.pdf", { type: "application/pdf" })
      : null;

  return (
    <div className="min-h-dvh bg-stone">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Wordmark />
          <span className="text-13 text-ink-muted">Design system « Dossier »</span>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[180px_1fr] md:px-6">
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="sticky top-6 flex flex-col gap-1 text-13">
            {[
              ["colors", "Couleurs"],
              ["type", "Typographie"],
              ["buttons", "Boutons"],
              ["fields", "Champs"],
              ["choices", "Cases et choix"],
              ["labels", "Badges, tags, surligneur"],
              ["navigation", "Onglets"],
              ["overlays", "Superpositions"],
              ["feedback", "Retours"],
              ["rating", "Évaluation"],
              ["upload", "Dépôt de fichier"],
              ["editor", "Texte riche"],
              ["lists", "Listes"],
              ["cards", "Cartes du kanban"],
            ].map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-sm px-2 py-1 text-ink-muted hover:bg-stone-strong hover:text-ink"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 rounded-md border border-line bg-paper px-5 py-8 md:px-8">
          <h1 className="text-24 font-semibold">Composants</h1>
          <p className="mt-1 mb-10 max-w-2xl text-14 text-ink-muted">
            Chaque composant dans ses états : repos, survol, focus, désactivé, erreur, chargement et
            vide. Les états de survol et de focus sont reproduits pour être visibles sans
            interaction. Référence : docs/DESIGN.md.
          </p>

          <Section id="colors" title="Couleurs">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {colors.map(([name, hex, use]) => (
                <li key={name} className="flex items-center gap-3">
                  <span
                    className="size-10 shrink-0 rounded-sm border border-line"
                    style={{ background: hex }}
                  />
                  <span className="min-w-0">
                    <span className="block text-13 font-medium">{name}</span>
                    <span className="block text-12 text-ink-muted tabular-nums">{hex}</span>
                    <span className="block truncate text-12 text-ink-muted">{use}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="type" title="Typographie">
            <div className="flex flex-col divide-y divide-line">
              {scale.map(([cls, size, sample]) => (
                <div key={cls} className="grid grid-cols-[88px_1fr] items-baseline gap-4 py-3">
                  <span className="text-12 text-ink-muted tabular-nums">{size}</span>
                  <span
                    className={cn(
                      cls,
                      cls === "text-48" || cls === "text-32" ? "font-heading" : "",
                      cls === "text-24" || cls === "text-20" ? "font-semibold" : "",
                    )}
                  >
                    {sample}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-13 text-ink-muted">
              Instrument Serif seulement pour les grands titres du site carrière. Chiffres
              tabulaires :{" "}
              <span className="text-ink tabular-nums">12 candidats, 3,8 sur 5, 45 000 €</span>.
            </p>
          </Section>

          <Section id="buttons" title="Boutons">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
                <div key={variant} className="flex flex-col gap-3">
                  <span className="text-13 font-medium">{variant}</span>
                  <State label="Repos">
                    <Button variant={variant}>Publier l&apos;offre</Button>
                  </State>
                  <State label="Survol">
                    <Button
                      variant={variant}
                      className={cn(
                        variant === "primary" && "bg-cobalt-hover",
                        variant === "secondary" && "bg-stone",
                        variant === "ghost" && "bg-stone-strong/70",
                        variant === "danger" && "bg-danger-hover",
                      )}
                    >
                      Publier l&apos;offre
                    </Button>
                  </State>
                  <State label="Focus">
                    <Button variant={variant} className={forced.focus}>
                      Publier l&apos;offre
                    </Button>
                  </State>
                  <State label="Désactivé">
                    <Button variant={variant} disabled>
                      Publier l&apos;offre
                    </Button>
                  </State>
                  <State label="Chargement">
                    <Button variant={variant} loading>
                      Publication…
                    </Button>
                  </State>
                </div>
              ))}
              <div className="flex flex-col gap-3">
                <span className="text-13 font-medium">Tailles et icônes</span>
                <State label="sm, md, lg">
                  <Button size="sm" variant="primary">
                    Petit
                  </Button>
                  <Button size="md" variant="primary">
                    Moyen
                  </Button>
                  <Button size="lg" variant="primary">
                    Grand
                  </Button>
                </State>
                <State label="Avec icône">
                  <Button>
                    <Mail aria-hidden="true" />
                    Envoyer un email
                  </Button>
                </State>
                <State label="Bouton icône (infobulle au survol)">
                  <IconButton label="Modifier">
                    <Pencil />
                  </IconButton>
                  <IconButton label="Copier le lien" className="bg-stone-strong/70 text-ink">
                    <Copy />
                  </IconButton>
                  <IconButton label="Supprimer" disabled>
                    <Trash2 />
                  </IconButton>
                </State>
                <State label="Lien">
                  <Button variant="link">Voir sur le site carrière</Button>
                </State>
              </div>
            </div>
          </Section>

          <Section id="fields" title="Champs">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Intitulé du poste">
                <Input placeholder="Par exemple : Développeur full-stack" />
              </Field>
              <Field label="Survol">
                <Input defaultValue="Développeur full-stack" className="border-ink-muted" />
              </Field>
              <Field label="Focus">
                <Input defaultValue="Développeur full-stack" className={forced.fieldFocus} />
              </Field>
              <Field
                label="Lieu"
                qualifier="(facultatif)"
                hint="Ville ou région, par exemple Lyon."
              >
                <Input />
              </Field>
              <Field
                label="Adresse email"
                error="Saisissez une adresse email valide, par exemple nom@entreprise.fr."
              >
                <Input defaultValue="marion@" />
              </Field>
              <Field label="Désactivé">
                <Input defaultValue="CDI" disabled />
              </Field>
              <Field label="Contrat">
                <Select defaultValue="cdi">
                  <option value="cdi">CDI</option>
                  <option value="cdd">CDD</option>
                  <option value="freelance">Freelance</option>
                </Select>
              </Field>
              <Field label="Message" qualifier="(facultatif)">
                <Textarea placeholder="Quelques mots sur votre motivation" />
              </Field>
              <Field label="Champ grand format (site carrière)" size="lg">
                <Input size="lg" placeholder="Prénom" />
              </Field>
            </div>
          </Section>

          <Section id="choices" title="Cases et choix">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-3">
                <Checkbox id="c1" label="Non cochée" />
                <Checkbox id="c2" label="Cochée" defaultChecked />
                <Checkbox id="c3" label="Désactivée" disabled />
                <Checkbox
                  id="c4"
                  label="Avec explication"
                  hint="Le candidat recevra l'email de refus sélectionné."
                  defaultChecked
                />
              </div>
              <div className="flex flex-col gap-3">
                <Radio id="r1" name="remote" label="Sur site" defaultChecked />
                <Radio id="r2" name="remote" label="Hybride" />
                <Radio id="r3" name="remote" label="Télétravail complet" />
                <Radio id="r4" name="remote-x" label="Désactivé" disabled />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-12 text-ink-muted">Focus</span>
                <span className={cn("inline-flex w-fit rounded-xs", forced.focus)}>
                  <Checkbox id="c5" defaultChecked aria-label="Sélectionner" />
                </span>
                <span className="text-12 text-ink-muted">Erreur</span>
                <Checkbox id="c6" label="J'accepte le traitement de mes données" aria-invalid />
              </div>
            </div>
          </Section>

          <Section id="labels" title="Badges, tags, surligneur">
            <div className="flex flex-col gap-5">
              <State label="Statuts d'offre">
                <Badge tone="muted">Brouillon</Badge>
                <Badge tone="success">Publiée</Badge>
                <Badge tone="neutral">Archivée</Badge>
              </State>
              <State label="Statuts de candidature">
                <Badge tone="success">Embauché</Badge>
                <Badge tone="danger">Refusé</Badge>
                <Badge tone="warning">Invitation en attente</Badge>
              </State>
              <State label="Tags">
                <Tag>React</Tag>
                <Tag onRemove={() => {}} removeLabel="Retirer le tag Anglais courant">
                  Anglais courant
                </Tag>
                <Tag>Vivier 2026</Tag>
              </State>
              <State label="Surligneur : nouveau, mention, terme trouvé">
                <Mark>3 nouveaux</Mark>
                <span className="text-14">
                  <Mark>@Claire</Mark> peux-tu regarder ce profil ?
                </span>
                <span className="text-14">
                  <Highlighted
                    text="…a mené la migration vers Kubernetes chez son employeur…"
                    ranges={[[26, 36]]}
                  />
                </span>
              </State>
              <State label="Avatars et raccourcis">
                <Avatar name="Claire Dubois" />
                <Avatar name="Karim Benali" size={32} />
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
                <Kbd>J</Kbd>
                <Kbd>?</Kbd>
              </State>
            </div>
          </Section>

          <Section id="navigation" title="Onglets">
            <Tabs defaultValue="application">
              <TabsList>
                <TabsTrigger value="application">Candidature</TabsTrigger>
                <TabsTrigger value="notes">
                  Notes <span className="text-ink-muted tabular-nums">3</span>
                </TabsTrigger>
                <TabsTrigger value="evaluations">Évaluations</TabsTrigger>
                <TabsTrigger value="activity" disabled>
                  Activité
                </TabsTrigger>
              </TabsList>
              <TabsContent value="application" className="pt-4 text-14 text-ink-muted">
                Réponses aux questions et message du candidat.
              </TabsContent>
              <TabsContent value="notes" className="pt-4 text-14 text-ink-muted">
                Notes de l&apos;équipe.
              </TabsContent>
              <TabsContent value="evaluations" className="pt-4 text-14 text-ink-muted">
                Évaluations.
              </TabsContent>
            </Tabs>
          </Section>

          <Section id="overlays" title="Superpositions">
            <div className="flex flex-wrap items-start gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Ouvrir une boîte de dialogue</Button>
                </DialogTrigger>
                <DialogContent
                  title="Refuser le candidat"
                  description="Marion Lefort ne sera plus visible dans les étapes actives."
                  closeLabel="Fermer"
                >
                  <DialogBody className="flex flex-col gap-4">
                    <Field label="Motif">
                      <Select defaultValue="profile">
                        <option value="profile">Profil ne correspondant pas au poste</option>
                        <option value="filled">Poste pourvu</option>
                      </Select>
                    </Field>
                    <Checkbox id="dlg-send" label="Envoyer un email au candidat" defaultChecked />
                  </DialogBody>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="ghost">Annuler</Button>
                    </DialogClose>
                    <Button variant="danger">Refuser le candidat</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <MoreHorizontal aria-hidden="true" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Offre</DropdownMenuLabel>
                  <DropdownMenuItem>
                    <Pencil aria-hidden="true" />
                    Modifier l&apos;offre
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Archive aria-hidden="true" />
                    Archiver l&apos;offre
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>Dupliquer l&apos;offre</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem tone="danger">
                    <Trash2 aria-hidden="true" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button>Ajouter un tag</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <Field label="Nouveau tag">
                    <Input placeholder="Par exemple : Anglais courant" />
                  </Field>
                </PopoverContent>
              </Popover>
              <Tooltip content="Raccourci : E">
                <Button>Infobulle</Button>
              </Tooltip>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <State label="Menu (aperçu statique)">
                <div className="w-56 rounded-md border border-line bg-paper p-1 shadow-float">
                  <div className="flex h-8 items-center gap-2 rounded-sm bg-stone px-2 text-14">
                    <Pencil className="size-4 text-ink-muted" aria-hidden="true" />
                    Modifier l&apos;offre
                  </div>
                  <div className="flex h-8 items-center gap-2 rounded-sm px-2 text-14">
                    <Archive className="size-4 text-ink-muted" aria-hidden="true" />
                    Archiver l&apos;offre
                  </div>
                </div>
              </State>
              <State label="Infobulle (aperçu statique)">
                <span className="rounded-sm bg-ink px-2 py-1 text-12 text-paper shadow-float">
                  Raccourci : E
                </span>
              </State>
            </div>
          </Section>

          <Section id="feedback" title="Retours">
            <div className="flex flex-col gap-6">
              <State label="Notifications">
                <Button
                  onClick={() =>
                    toast({
                      message: "Candidat déplacé vers Entretien",
                      action: { label: "Annuler", onClick: () => toast("Déplacement annulé") },
                    })
                  }
                >
                  Afficher une notification
                </Button>
                <Button
                  onClick={() =>
                    toast({
                      message: "L'email n'a pas pu être envoyé. Vérifiez la configuration SMTP.",
                      tone: "danger",
                    })
                  }
                >
                  Notification d&apos;erreur
                </Button>
              </State>
              <State label="Notification (aperçu statique)" className="max-w-sm">
                <div className="flex min-h-11 w-full items-center gap-3 rounded-md bg-ink py-2 pr-2 pl-3.5 text-14 text-paper shadow-float">
                  <p className="flex-1">Candidat déplacé vers Entretien</p>
                  <span className="rounded-sm px-2 py-1 font-medium">Annuler</span>
                </div>
              </State>
              <div className="grid gap-3 lg:grid-cols-3">
                <Banner title="SMTP non configuré">
                  Les emails sont journalisés au lieu d&apos;être envoyés.
                </Banner>
                <Banner tone="warning" title="12 candidats seront anonymisés le 1er décembre">
                  Durée de conservation : 24 mois.
                </Banner>
                <Banner tone="danger" title="Le fichier est trop lourd">
                  Le CV doit être un fichier PDF ou DOCX de 10 Mo maximum.
                </Banner>
              </div>
              <State label="Chargement (squelettes)" className="max-w-md">
                <div className="w-full rounded-md border border-line bg-paper">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
                    >
                      <Skeleton className="size-6 rounded-full" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </State>
              <State label="État vide" className="max-w-xl">
                <div className="w-full rounded-md border border-line">
                  <EmptyState
                    title="Aucune offre publiée"
                    description="Publiez une offre pour la faire apparaître sur votre site carrière."
                    action={<Button variant="primary">Créer une offre</Button>}
                  />
                </div>
              </State>
            </div>
          </Section>

          <Section id="rating" title="Évaluation">
            <div className="flex flex-wrap gap-10">
              <State label="Saisie (touches 1 à 5)">
                <RatingInput
                  value={rating}
                  onChange={setRating}
                  label="Votre note"
                  valueLabels={[1, 2, 3, 4, 5].map((n) => `${n} sur 5`)}
                />
              </State>
              <State label="Vide">
                <RatingInput
                  value={null}
                  onChange={() => {}}
                  label="Note"
                  valueLabels={["1", "2", "3", "4", "5"]}
                />
              </State>
              <State label="Désactivé">
                <RatingInput
                  value={3}
                  onChange={() => {}}
                  label="Note"
                  valueLabels={["1", "2", "3", "4", "5"]}
                  disabled
                />
              </State>
              <State label="Lecture">
                <RatingDots value={3.8} label="3,8 sur 5" />
                <span className="text-13 text-ink-muted tabular-nums">3,8 sur 5</span>
              </State>
            </div>
          </Section>

          <Section id="upload" title="Dépôt de fichier">
            <div className="grid gap-6 md:grid-cols-2">
              <State label="Vide" className="[&>div]:block">
                <Dropzone
                  file={file}
                  onFile={setFile}
                  accept=".pdf,.docx"
                  labels={dropLabels}
                  locale="fr"
                />
              </State>
              <State label="Fichier choisi" className="[&>div]:block">
                <Dropzone
                  file={sampleFile}
                  onFile={() => {}}
                  accept=".pdf,.docx"
                  labels={dropLabels}
                  locale="fr"
                />
              </State>
              <State label="Erreur" className="[&>div]:block">
                <Dropzone
                  file={null}
                  onFile={() => {}}
                  accept=".pdf,.docx"
                  labels={dropLabels}
                  locale="fr"
                  error="Le CV doit être un fichier PDF ou DOCX de 10 Mo maximum."
                />
                <p className="text-13 text-danger">
                  Le CV doit être un fichier PDF ou DOCX de 10 Mo maximum.
                </p>
              </State>
              <State label="Désactivé" className="[&>div]:block">
                <Dropzone
                  file={null}
                  onFile={() => {}}
                  accept=".pdf,.docx"
                  labels={dropLabels}
                  locale="fr"
                  disabled
                />
              </State>
            </div>
          </Section>

          <Section id="editor" title="Texte riche">
            <RichTextEditor
              value={html}
              onChange={setHtml}
              labels={richLabels}
              placeholder="Décrivez le poste"
            />
          </Section>

          <Section id="lists" title="Listes">
            <div className="overflow-hidden rounded-md border border-line">
              <div className="flex h-10 items-center gap-3 border-b border-line px-3 text-14">
                <span className="flex-1 font-medium">Repos</span>
                <span className="text-13 text-ink-muted tabular-nums">12 candidats</span>
              </div>
              <div className="flex h-10 items-center gap-3 border-b border-line bg-stone px-3 text-14">
                <span className="flex-1 font-medium">Survol</span>
                <span className="text-13 text-ink-muted tabular-nums">4 candidats</span>
              </div>
              <div className="flex h-10 items-center gap-3 border-b border-line bg-cobalt-tint px-3 text-14">
                <span className="flex-1 font-medium">Sélectionné</span>
                <span className="text-13 text-ink-muted tabular-nums">7 candidats</span>
              </div>
              <div className="flex h-10 items-center gap-3 px-3 text-14">
                <span className="flex-1 font-medium">
                  Avec nouveautés <Mark className="ml-1 text-12">2 nouveaux</Mark>
                </span>
                <span className="text-13 text-ink-muted tabular-nums">9 candidats</span>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <div className="relative w-72">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Rechercher un candidat"
                  className="pl-8"
                  aria-label="Rechercher un candidat"
                />
              </div>
            </div>
          </Section>

          <Section id="cards" title="Cartes du kanban">
            <KanbanCardStates />
          </Section>
        </main>
      </div>
    </div>
  );
}

function sampleCard(id: string, overrides: Partial<BoardCard>): BoardCard {
  return {
    id,
    candidateId: id,
    firstName: "Marion",
    lastName: "Lefort",
    stageId: "stage",
    position: 0,
    appliedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    isNew: false,
    rejected: false,
    tags: ["Portfolio solide"],
    evaluationCount: 0,
    averageRating: null,
    hasCv: true,
    unreadReplies: 0,
    ...overrides,
  };
}

const cardStates: Array<{
  label: string;
  card: BoardCard;
  selected?: boolean;
  active?: boolean;
  selectionMode?: boolean;
}> = [
  { label: "Repos", card: sampleCard("rest", {}) },
  {
    label: "Nouvelle candidature",
    card: sampleCard("new", { firstName: "Lucas", lastName: "Moreau", isNew: true, tags: [] }),
  },
  {
    label: "Évaluée, avec tags",
    card: sampleCard("rated", {
      firstName: "Bastien",
      lastName: "Roy",
      averageRating: 4.2,
      evaluationCount: 3,
      tags: ["Permis B", "Anglais courant", "Lyon"],
    }),
  },
  {
    label: "Sélection en cours",
    card: sampleCard("selection", { firstName: "Théo", lastName: "Renard" }),
    selectionMode: true,
  },
  {
    label: "Sélectionnée",
    card: sampleCard("selected", { firstName: "Sophie", lastName: "Martin" }),
    selected: true,
  },
  {
    label: "Ouverte dans le panneau",
    card: sampleCard("active", { firstName: "Antoine", lastName: "Petit" }),
    active: true,
  },
  {
    label: "Refusée, sans CV",
    card: sampleCard("rejected", {
      firstName: "Julie",
      lastName: "Garnier",
      rejected: true,
      hasCv: false,
      tags: [],
    }),
  },
];

function KanbanCardStates() {
  const noop = () => {};
  return (
    <DndContext>
      <SortableContext items={cardStates.map((s) => s.card.id)}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cardStates.map((state) => (
            <State key={state.card.id} label={state.label} className="w-64">
              <ul className="w-full">
                <KanbanCard
                  card={state.card}
                  selected={state.selected ?? false}
                  selectionMode={state.selectionMode ?? false}
                  active={state.active ?? false}
                  onOpen={noop}
                  onToggle={noop}
                  disabled
                />
              </ul>
            </State>
          ))}
          <State label="En déplacement" className="w-64">
            <CardOverlay card={sampleCard("drag", { firstName: "Ibrahim", lastName: "Traoré" })} />
          </State>
        </div>
      </SortableContext>
    </DndContext>
  );
}
