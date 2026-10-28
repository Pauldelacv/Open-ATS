"use client";

import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
} from "@/app/(app)/(backoffice)/settings/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import type { Role } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";

type Member = { membershipId: string; userId: string; name: string; email: string; role: Role };
type Invitation = { id: string; email: string; role: Role; expiresAt: Date };

const roles: Role[] = ["admin", "recruiter", "member"];

export function TeamManager({
  members,
  invitations,
  currentUserId,
}: {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
}) {
  const t = useTranslations("settings.team");
  const tr = useTranslations("roles");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("recruiter");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ link: string; logged: boolean } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const result = await action();
      if (!result.ok)
        return void toast({ message: tx(result.error ?? "common.unknownError"), tone: "danger" });
      toast(success);
      router.refresh();
    });

  const invite = () =>
    start(async () => {
      setInviteError(null);
      const result = await inviteMemberAction({ email, role });
      if (!result.ok) {
        setInviteError(result.fieldErrors?.email ?? result.error);
        return;
      }
      setCreatedLink({ link: result.data.link, logged: result.data.delivery !== "sent" });
      if (result.data.delivery === "sent") toast(t("invited"));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-20 font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setInviteOpen(true);
            setCreatedLink(null);
            setEmail("");
            setInviteError(null);
          }}
        >
          <UserPlus aria-hidden="true" />
          {t("invite")}
        </Button>
      </div>

      <section
        className="overflow-hidden rounded-md border border-line bg-paper"
        aria-labelledby="members-title"
      >
        <h3
          id="members-title"
          className="border-b border-line px-4 py-2.5 text-13 font-medium text-ink-muted"
        >
          {t("members")} <span className="tabular-nums">{members.length}</span>
        </h3>
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Avatar name={m.name} size={32} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-14 font-medium">
                  {m.name}
                  {m.userId === currentUserId ? (
                    <span className="font-normal text-ink-muted"> ({t("you")})</span>
                  ) : null}
                </p>
                <p className="truncate text-13 text-ink-muted">{m.email}</p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Select
                  aria-label={t("role", { name: m.name })}
                  value={m.role}
                  disabled={pending}
                  className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                  onChange={(e) =>
                    run(
                      () => changeRoleAction(m.membershipId, e.target.value as Role),
                      t("roleChanged"),
                    )
                  }
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {tr(r)}
                    </option>
                  ))}
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label={tx("common.more")} variant="ghost" className="w-8 px-0">
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem tone="danger" onSelect={() => setRemoving(m)}>
                      {t("remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {invitations.length > 0 ? (
        <section
          className="overflow-hidden rounded-md border border-line bg-paper"
          aria-labelledby="pending-title"
        >
          <h3
            id="pending-title"
            className="border-b border-line px-4 py-2.5 text-13 font-medium text-ink-muted"
          >
            {t("pending")} <span className="tabular-nums">{invitations.length}</span>
          </h3>
          <ul className="divide-y divide-line">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-14 font-medium">{inv.email}</p>
                  <p className="flex flex-wrap gap-x-3 text-13 text-ink-muted">
                    <span>{tr(inv.role)}</span>
                    <span>{t("expires", { date: formatRelative(inv.expiresAt, locale) })}</span>
                  </p>
                </div>
                <Badge tone="warning">{t("pendingBadge")}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => revokeInvitationAction(inv.id), t("revoked"))}
                >
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="rounded-md border border-line bg-paper px-4 py-3"
        aria-labelledby="roles-title"
      >
        <h3 id="roles-title" className="text-14 font-semibold">
          {t("roles")}
        </h3>
        <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          {roles.map((r) => (
            <div key={r}>
              <dt className="text-13 font-medium">{tr(r)}</dt>
              <dd className="text-13 text-ink-muted">{tr(`${r}Hint`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent title={t("inviteTitle")} closeLabel={tx("common.close")}>
          {createdLink ? (
            <>
              <DialogBody className="flex flex-col gap-3">
                <Banner tone={createdLink.logged ? "warning" : "info"}>
                  {createdLink.logged ? t("invitedLogged") : t("invited")}
                </Banner>
                <Field label={t("inviteLink")}>
                  <Input readOnly value={createdLink.link} onFocus={(e) => e.target.select()} />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(createdLink.link);
                    toast(tx("common.copied"));
                  }}
                >
                  <Copy aria-hidden="true" />
                  {tx("common.copy")}
                </Button>
                <DialogClose asChild>
                  <Button variant="primary">{tx("common.close")}</Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                invite();
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                <Field label={t("inviteEmail")} error={inviteError ? tx(inviteError) : undefined}>
                  <Input
                    type="email"
                    inputMode="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label={t("inviteRole")} hint={tr(`${role}Hint`)}>
                  <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {tr(r)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{tx("common.cancel")}</Button>
                </DialogClose>
                <Button type="submit" variant="primary" loading={pending}>
                  {t("inviteSubmit")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        {removing ? (
          <DialogContent
            width="sm"
            title={t("removeTitle", { name: removing.name })}
            closeLabel={tx("common.close")}
          >
            <DialogBody>
              <p className="text-14">{t("removeBody", { name: removing.name })}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{tx("common.cancel")}</Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={pending}
                onClick={() => {
                  const target = removing;
                  setRemoving(null);
                  run(() => removeMemberAction(target.membershipId), t("removed"));
                }}
              >
                {t("remove")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
