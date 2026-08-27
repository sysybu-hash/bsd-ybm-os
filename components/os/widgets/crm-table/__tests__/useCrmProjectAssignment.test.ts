/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCrmProjectAssignment } from "../useCrmProjectAssignment";
import type { Client } from "../types";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/app/actions/crm", () => ({ createProjectForContact: jest.fn() }));
jest.mock("../crm-table-api", () => ({
  fetchProjectOptionsApi: jest.fn(),
  fetchProjectSyncMetaApi: jest.fn(),
  checkProjectChangeApi: jest.fn(),
  updateContactApi: jest.fn(),
}));

import { toast } from "sonner";
import { createProjectForContact } from "@/app/actions/crm";
import {
  checkProjectChangeApi,
  fetchProjectOptionsApi,
  fetchProjectSyncMetaApi,
  updateContactApi,
} from "../crm-table-api";

const t = (key: string) => key;

function client(over: Partial<Client> = {}): Client {
  return { id: "c1", name: "Acme", projectId: null, ...over } as Client;
}

function setup(selected: Client | null) {
  const setSelectedClient = jest.fn();
  const setClients = jest.fn();
  const hook = renderHook(() =>
    useCrmProjectAssignment({ selectedClient: selected, setSelectedClient, setClients, t }),
  );
  return { ...hook, setSelectedClient, setClients };
}

beforeEach(() => jest.clearAllMocks());

describe("crmSyncStatus", () => {
  it("is unlinked when the contact has no project", () => {
    const { result } = setup(client());
    expect(result.current.crmSyncStatus).toBe("unlinked");
  });

  it("is linked when the project does not auto-sync", async () => {
    (fetchProjectSyncMetaApi as jest.Mock).mockResolvedValue({
      autoSyncCrm: false,
      primaryContactId: "c1",
    });
    const { result } = setup(client({ projectId: "p1" }));
    await waitFor(() => expect(result.current.crmSyncStatus).toBe("linked"));
  });

  it("is synced only when auto-sync is on AND this contact is the primary", async () => {
    (fetchProjectSyncMetaApi as jest.Mock).mockResolvedValue({
      autoSyncCrm: true,
      primaryContactId: "c1",
    });
    const { result } = setup(client({ projectId: "p1" }));
    await waitFor(() => expect(result.current.crmSyncStatus).toBe("synced"));
  });

  /** The distinction that is easy to get wrong: auto-sync alone is not enough. */
  it("is linked, not synced, when auto-sync points at a different contact", async () => {
    (fetchProjectSyncMetaApi as jest.Mock).mockResolvedValue({
      autoSyncCrm: true,
      primaryContactId: "someone-else",
    });
    const { result } = setup(client({ projectId: "p1" }));
    await waitFor(() => expect(result.current.crmSyncStatus).toBe("linked"));
  });
});

describe("saveClientProject", () => {
  it("refuses the change and explains when the server disallows it", async () => {
    (checkProjectChangeApi as jest.Mock).mockResolvedValue({ allowed: false, warn: "nope" });
    const { result } = setup(client());

    await act(async () => {
      await result.current.saveClientProject("p2");
    });

    expect(updateContactApi).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("nope");
  });

  it("asks before a warned change and aborts when the user declines", async () => {
    (checkProjectChangeApi as jest.Mock).mockResolvedValue({ warn: "are you sure?" });
    window.confirm = jest.fn(() => false);
    const { result } = setup(client());

    await act(async () => {
      await result.current.saveClientProject("p2");
    });

    expect(window.confirm).toHaveBeenCalledWith("are you sure?");
    expect(updateContactApi).not.toHaveBeenCalled();
  });

  it("writes the new project through to both the detail and the list", async () => {
    (checkProjectChangeApi as jest.Mock).mockResolvedValue(null);
    (updateContactApi as jest.Mock).mockResolvedValue({ id: "c1", name: "Acme", projectId: "p2" });
    const { result, setSelectedClient, setClients } = setup(client());

    await act(async () => {
      await result.current.saveClientProject("p2");
    });

    expect(setSelectedClient).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c1", projectId: "p2" }),
    );
    expect(setClients).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  /**
   * Unlinking returns nothing from the API, and the contact must still be
   * cleared locally rather than keeping its stale project name.
   */
  it("clears the link locally when unlinking returns no contact", async () => {
    (updateContactApi as jest.Mock).mockResolvedValue(null);
    const { result, setSelectedClient } = setup(
      client({ projectId: "p1", projectName: "Old" } as Partial<Client>),
    );

    await act(async () => {
      await result.current.saveClientProject(null);
    });

    expect(setSelectedClient).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, projectName: null, totalProjects: 0 }),
    );
  });

  it("does nothing without a selected contact", async () => {
    const { result } = setup(null);
    await act(async () => {
      await result.current.saveClientProject("p2");
    });
    expect(updateContactApi).not.toHaveBeenCalled();
  });
});

describe("handleCreateProjectForClient", () => {
  it("adopts the new project and refreshes the option list", async () => {
    (createProjectForContact as jest.Mock).mockResolvedValue({
      ok: true,
      projectId: "p9",
      projectName: "New",
    });
    (fetchProjectOptionsApi as jest.Mock).mockResolvedValue([{ id: "p9", name: "New" }]);
    const { result, setSelectedClient } = setup(client());

    await act(async () => {
      await result.current.handleCreateProjectForClient();
    });

    expect(setSelectedClient).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p9", projectName: "New", totalProjects: 1 }),
    );
    await waitFor(() => expect(result.current.projectOptions).toHaveLength(1));
  });

  it("surfaces the server's reason and changes nothing on failure", async () => {
    (createProjectForContact as jest.Mock).mockResolvedValue({ ok: false, error: "quota" });
    const { result, setSelectedClient } = setup(client());

    await act(async () => {
      await result.current.handleCreateProjectForClient();
    });

    expect(toast.error).toHaveBeenCalledWith("quota");
    expect(setSelectedClient).not.toHaveBeenCalled();
  });

  it("clears the in-flight flag even when the call throws", async () => {
    (createProjectForContact as jest.Mock).mockRejectedValue(new Error("offline"));
    const { result } = setup(client());

    await act(async () => {
      await result.current.handleCreateProjectForClient();
    });

    expect(result.current.creatingProject).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });
});
