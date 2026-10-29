"use client";

import { Link2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createChannelAction,
  deleteChannelAction,
  renameChannelAction,
} from "@/app/(app)/(backoffice)/settings/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { SettingsSection } from "./section";

type Channel = { id: string; name: string; slug: string; applications: number; feedUrl: string };

export function ChannelsManager({ channels, feedUrl }: { channels: Channel[]; feedUrl: string }) {
  const t = useTranslations("settings.distribution");
  const tc = useTranslations("common");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Channel | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Channel | null>(null);

  const add = () =>
    start(async () => {
      setAddError(null);
      const result = await createChannelAction(name);
      if (!result.ok) return void setAddError(result.error);
      setName("");
      toast(t("added"));
      router.refresh();
    });

  const rename = () =>
    start(async () => {
      if (!renaming) return;
      setRenameError(null);
      const result = await renameChannelAction(renaming.id, renameValue);
      if (!result.ok) return void setRenameError(result.error);
      setRenaming(null);
      toast(t("renamed"));
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      const result = await deleteChannelAction(deleting.id);
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      setDeleting(null);
      toast(t("deleted"));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-20 font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
      </div>

      <SettingsSection title={t("channels")} description={t("channelsDescription")}>
        {channels.length === 0 ? (
          <EmptyState title={t("empty")} description={t("emptyBody")} />
        ) : (
          <ul className="-mt-2 divide-y divide-line">
            {channels.map((channel) => (
              <li key={channel.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-14 font-medium">{channel.name}</span>
                  <span className="block truncate text-12 text-ink-muted">
                    {t("slugHint", { slug: channel.slug })}
                  </span>
                </span>
                <span className="shrink-0 text-13 text-ink-muted tabular-nums">
                  {tx("distribution.applications", { count: channel.applications })}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-8 px-0"
                      aria-label={t("channelActions", { name: channel.name })}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={async () => {
                        await navigator.clipboard.writeText(channel.feedUrl);
                        toast(t("feedCopied"));
                      }}
                    >
                      <Link2 aria-hidden="true" />
                      {t("copyFeed")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(channel);
                        setRenameValue(channel.name);
                        setRenameError(null);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      {t("rename")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem tone="danger" onSelect={() => setDeleting(channel)}>
                      <Trash2 aria-hidden="true" />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
        <form
          noValidate
          className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field
            label={t("name")}
            className="flex-1"
            labelClassName="sr-only"
            error={addError ? tx(addError) : undefined}
          >
            <Input
              value={name}
              maxLength={60}
              placeholder={t("addPlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Button type="submit" loading={pending && !renaming && !deleting}>
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection title={t("feed")} description={t("feedDescription")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="shrink-0 text-14 font-medium">{t("feedUrl")}</span>
          <span className="min-w-0 flex-1 truncate text-13 text-ink-muted" title={feedUrl}>
            {feedUrl}
          </span>
          <CopyButton value={feedUrl} label={tc("copyLink")} copiedLabel={tc("copied")} size="sm" />
        </div>
      </SettingsSection>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        {renaming ? (
          <DialogContent width="sm" title={t("rename")} closeLabel={tc("close")}>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                rename();
              }}
            >
              <DialogBody>
                <Field
                  label={t("name")}
                  hint={t("slugHint", { slug: renaming.slug })}
                  error={renameError ? tx(renameError) : undefined}
                >
                  <Input
                    autoFocus
                    value={renameValue}
                    maxLength={60}
                    onChange={(e) => setRenameValue(e.target.value)}
                  />
                </Field>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{tc("cancel")}</Button>
                </DialogClose>
                <Button type="submit" variant="primary" loading={pending}>
                  {t("rename")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting ? (
          <DialogContent
            width="sm"
            title={t("deleteTitle", { name: deleting.name })}
            closeLabel={tc("close")}
          >
            <DialogBody>
              <p className="text-14">{t("deleteBody")}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{tc("cancel")}</Button>
              </DialogClose>
              <Button variant="danger" loading={pending} onClick={remove}>
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
