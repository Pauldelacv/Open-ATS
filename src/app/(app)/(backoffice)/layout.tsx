import { Sidebar } from "@/components/app/sidebar";
import { CommandPaletteProvider } from "@/components/app/command-palette-context";
import { CommandPalette } from "@/components/app/command-palette";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { unreadMentionCount } from "@/lib/services/notifications";
import { getOrganization } from "@/lib/services/organizations";
import { mediaUrl } from "@/lib/media";

export default async function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const [org, unread] = await Promise.all([getOrganization(ctx), unreadMentionCount(ctx)]);
  return (
    <CommandPaletteProvider>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Sidebar
          organization={{
            name: org.name,
            slug: org.slug,
            logoUrl: org.logoKey ? mediaUrl(org.logoKey) : null,
          }}
          user={{ name: ctx.user.name, email: ctx.user.email }}
          unreadMentions={unread}
          canSeeSettings={can(ctx.role, "settings:organization")}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <CommandPalette canCreateJob={can(ctx.role, "job:manage")} />
    </CommandPaletteProvider>
  );
}
