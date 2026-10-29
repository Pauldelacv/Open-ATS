"use client";

import {
  Bell,
  Briefcase,
  CalendarDays,
  ExternalLink,
  LogOut,
  Menu,
  Search,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState, useSyncExternalStore, type ComponentType } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/cn";
import { LogoMark } from "./logo";
import { useCommandPalette } from "./command-palette-context";

export type SidebarProps = {
  organization: { name: string; slug: string; logoUrl: string | null };
  user: { name: string; email: string };
  unreadNotifications: number;
  canSeeSettings: boolean;
};

const noopSubscribe = () => () => {};

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
};

function OrgBadge({
  organization,
  compact,
}: {
  organization: SidebarProps["organization"];
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {organization.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={organization.logoUrl}
          alt=""
          className="size-7 shrink-0 rounded-sm border border-line bg-paper object-contain"
        />
      ) : (
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-line bg-paper">
          <LogoMark className="size-4" />
        </span>
      )}
      {!compact ? (
        <span className="truncate text-14 font-semibold text-ink">{organization.name}</span>
      ) : null}
    </span>
  );
}

function SidebarContent({
  props,
  rail,
  onNavigate,
}: {
  props: SidebarProps;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const router = useRouter();
  const palette = useCommandPalette();
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );

  const items: NavItem[] = [
    { href: "/jobs", label: t("jobs"), icon: Briefcase },
    { href: "/candidates", label: t("candidates"), icon: Users },
    { href: "/interviews", label: t("interviews"), icon: CalendarDays },
    { href: "/inbox", label: t("inbox"), icon: Bell, badge: props.unreadNotifications },
    {
      href: props.canSeeSettings ? "/settings" : "/settings/profile",
      label: t("settings"),
      icon: Settings,
    },
  ];

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  const link = (item: NavItem) => {
    const active =
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`) ||
      (item.href === "/settings/profile" && pathname.startsWith("/settings"));
    const Icon = item.icon;
    const content = (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={rail ? item.label : undefined}
        className={cn(
          "flex h-8 items-center gap-2.5 rounded-sm text-13 font-medium transition-colors duration-[120ms]",
          rail ? "w-8 justify-center" : "px-2",
          active
            ? "bg-cobalt-tint text-ink"
            : "text-ink-muted hover:bg-stone-strong hover:text-ink",
        )}
      >
        <span className="relative inline-flex">
          <Icon className={cn("size-4 shrink-0", active ? "text-cobalt" : "")} />
          {rail && item.badge ? (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-highlighter ring-2 ring-stone" />
          ) : null}
        </span>
        {!rail ? <span className="flex-1 truncate">{item.label}</span> : null}
        {!rail && item.badge ? (
          <span
            className="rounded-xs bg-highlighter px-1 text-12 font-medium text-ink tabular-nums"
            aria-label={t("unread", { count: item.badge })}
          >
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
    return (
      <li key={item.href}>
        {rail ? (
          <Tooltip side="right" content={item.badge ? `${item.label} (${item.badge})` : item.label}>
            {content}
          </Tooltip>
        ) : (
          content
        )}
      </li>
    );
  };

  const searchButton = (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        palette.open();
      }}
      aria-label={rail ? t("search") : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-sm border border-line bg-paper text-13 text-ink-muted transition-colors duration-[120ms] hover:border-line-strong hover:text-ink",
        rail ? "w-8 justify-center" : "px-2",
      )}
    >
      <Search className="size-4 shrink-0" />
      {!rail ? (
        <>
          <span className="flex-1 text-left">{t("search")}</span>
          <span className="flex gap-0.5">
            <Kbd className="h-4.5 min-w-4.5">{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd className="h-4.5 min-w-4.5">K</Kbd>
          </span>
        </>
      ) : null}
    </button>
  );

  return (
    <div className={cn("flex h-full flex-col gap-4 py-3", rail ? "items-center px-2" : "px-3")}>
      <div className={cn("flex h-9 items-center", rail ? "justify-center" : "px-1")}>
        <OrgBadge organization={props.organization} compact={rail} />
      </div>
      {rail ? (
        <Tooltip side="right" content={t("search")}>
          {searchButton}
        </Tooltip>
      ) : (
        searchButton
      )}
      <nav aria-label={t("main")}>
        <ul className="flex flex-col gap-0.5">{items.map(link)}</ul>
      </nav>
      <div className="mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-sm text-left text-13 hover:bg-stone-strong",
              rail ? "w-9 justify-center" : "px-1.5",
            )}
            aria-label={t("account")}
          >
            <Avatar name={props.user.name} />
            {!rail ? (
              <span className="min-w-0 flex-1 truncate font-medium text-ink">
                {props.user.name}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent side={rail ? "right" : "top"} align="start" className="w-60">
            <DropdownMenuLabel>
              <span className="block truncate text-13 font-medium text-ink">{props.user.name}</span>
              <span className="block truncate">{props.user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings/profile")}>
              <UserRound aria-hidden="true" />
              {t("profile")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.open(`/careers/${props.organization.slug}`, "_blank", "noopener")
              }
            >
              <ExternalLink aria-hidden="true" />
              {t("careerSite")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut aria-hidden="true" />
              {tAuth("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const t = useTranslations("nav");
  const [drawer, setDrawer] = useState(false);
  return (
    <>
      {/* Desktop: full sidebar; tablet: icon rail. */}
      <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 border-r border-line bg-stone md:block xl:hidden">
        <SidebarContent props={props} rail />
      </aside>
      <aside className="sticky top-0 hidden h-dvh w-54 shrink-0 border-r border-line bg-stone xl:block">
        <SidebarContent props={props} rail={false} />
      </aside>
      {/* Phone: top bar with a drawer. */}
      <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-stone px-2 md:hidden">
        <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
          <DialogPrimitive.Trigger
            aria-label={t("openMenu")}
            className="inline-flex size-9 items-center justify-center rounded-sm text-ink hover:bg-stone-strong"
          >
            <Menu className="size-5" />
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/30 data-[state=open]:animate-fade-in" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-64 border-r border-line bg-stone shadow-lift data-[state=open]:animate-fade-in">
              <DialogPrimitive.Title className="sr-only">{t("main")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {props.organization.name}
              </DialogPrimitive.Description>
              <SidebarContent props={props} rail={false} onNavigate={() => setDrawer(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <OrgBadge organization={props.organization} />
      </div>
    </>
  );
}
