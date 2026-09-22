import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";

import { I18nProvider, useI18n } from "@/components/os/system/I18nProvider";
import { isWorkspaceShellPath } from "@/lib/perf/marketing-paths";
import type { MessageTree } from "@/lib/i18n/keys";

let mockPath = "/login";
jest.mock("next/navigation", () => ({ usePathname: () => mockPath }));

// The full pack, standing in for lib/i18n/load-messages' 11 packs.
jest.mock("@/lib/i18n/load-messages", () => ({
  getMessages: () => ({
    auth: { title: "כניסה" },
    workspaceWidgets: { empty: { greetingNight: "לילה טוב" } },
  }),
}));

function Greeting() {
  const { t } = useI18n();
  return <p>{t("workspaceWidgets.empty.greetingNight")}</p>;
}

// What /login is served with: no workspace strings at all.
const marketingPack = { auth: { title: "כניסה" } } as unknown as MessageTree;

describe("signing in from a marketing page", () => {
  it("fetches the workspace strings once the visit leaves the marketing pages", async () => {
    mockPath = "/login";
    const { rerender } = render(
      <I18nProvider locale="he" pack="marketing" messages={marketingPack}>
        <Greeting />
      </I18nProvider>,
    );
    // Still on /login: the slim pack is right, and the key is not needed.
    expect(screen.getByText("workspaceWidgets.empty.greetingNight")).toBeTruthy();

    // A soft navigation to /home: same provider, same pack prop — the layout
    // is not rendered again, which is the whole bug.
    mockPath = "/home";
    await act(async () => {
      rerender(
        <I18nProvider locale="he" pack="marketing" messages={marketingPack}>
          <Greeting />
        </I18nProvider>,
      );
    });
    await waitFor(() => expect(screen.getByText("לילה טוב")).toBeTruthy());
  });

  it("does not fetch anything while the visit stays on marketing pages", async () => {
    mockPath = "/contact";
    render(
      <I18nProvider locale="he" pack="marketing" messages={marketingPack}>
        <Greeting />
      </I18nProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("workspaceWidgets.empty.greetingNight")).toBeTruthy();
  });

  it("counts /home as the workspace, like /workspace", () => {
    expect(isWorkspaceShellPath("/home")).toBe(true);
    expect(isWorkspaceShellPath("/home?w=crmTable")).toBe(true);
    expect(isWorkspaceShellPath("/workspace")).toBe(true);
    expect(isWorkspaceShellPath("/login")).toBe(false);
  });
});
