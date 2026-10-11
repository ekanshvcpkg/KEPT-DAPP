// The shell of a tab screen: AppHeader (Keeper mark → the screen's note or the tab's idle line, balance chip → W1, bell → N1, optional
// settings) over a scroll column that leaves room for the tab bar. B1, D0, H1 and I1 use it.
import type { ReactNode } from "react";
import { keeperIdle, t } from "@/copy";
import { AppHeader } from "@/components/chrome";
import { Screen } from "@/components/layout/Screen";
import { formatSkr } from "@/lib/format";
import { metrics } from "@/theme";
import { useBalances, useInbox } from "@/api/queries";
import { useGo } from "@/app/nav";
import type { DesignId } from "@/app/routes";

type TabId = "today" | "oaths" | "bounties" | "profile";
const TAB_SCREEN: Record<TabId, DesignId> = { today: "B1", oaths: "D0", bounties: "H1", profile: "I1" };

/** Space under the content for the floating tab bar (bottom 28 + height 64 + 16). */
const TAB_BAR_SPACE = metrics.tabBar.bottom + metrics.tabBar.height + 16;

/** `layout`: the designed state shown (B2–B4 are the Today tab), for its ambient light. */
export function TabScreen({ tab, children, layout }: { tab: TabId; children?: ReactNode; layout?: DesignId }) {
  const { go } = useGo();
  const balances = useBalances();
  const inbox = useInbox();
  const id = TAB_SCREEN[tab];
  const idle = keeperIdle(tab);
  return (
    <Screen
      bottomInset={TAB_BAR_SPACE}
      {...(layout ? { layout } : {})}
      keeperIdle={idle}
      bar={
        <AppHeader
          title={t(`screens.${id}.header.title` as never)}
          balance={balances.data ? formatSkr(balances.data.skr, { dp: 0 }) : "–"}
          unreadCount={inbox.data?.unread ?? 0}
          onBalance={() => go("W1")}
          onBell={() => go("N1")}
          {...(tab === "profile" ? { extra: { icon: "cog-outline" as const, label: t("additions.a11y.settings"), onPress: () => go("I4") } } : {})}
        />
      }
    >
      {children}
    </Screen>
  );
}
