/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";

const listAppSchemasAction = jest.fn();
const deleteAppSchemaAction = jest.fn();
const loadAppSchemaAction = jest.fn();

jest.mock("@/app/actions/app-builder", () => ({
  listAppSchemasAction: (...a: unknown[]) => listAppSchemasAction(...a),
  deleteAppSchemaAction: (...a: unknown[]) => deleteAppSchemaAction(...a),
  loadAppSchemaAction: (...a: unknown[]) => loadAppSchemaAction(...a),
}));

import { useAppBuilderSavedApps } from "../useAppBuilderSavedApps";

import type { AppSchemaListItem } from "@/app/actions/app-builder";

const app = (over: Partial<AppSchemaListItem> = {}): AppSchemaListItem => ({
  id: "a1",
  name: "My app",
  description: null,
  appType: "form",
  isGlobal: false,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

function setup(over: Partial<Parameters<typeof useAppBuilderSavedApps>[0]> = {}) {
  const onError = jest.fn();
  const onSuccess = jest.fn();
  const onDeletedCurrent = jest.fn();
  const onLoaded = jest.fn();
  const opts = {
    t: (key: string) => key,
    prefix: "p",
    onError,
    onSuccess,
    isCurrent: () => false,
    onDeletedCurrent,
    onLoaded,
    ...over,
  };
  const hook = renderHook(() => useAppBuilderSavedApps(opts));
  return { hook, onError, onSuccess, onDeletedCurrent, onLoaded };
}

beforeEach(() => {
  jest.clearAllMocks();
  listAppSchemasAction.mockResolvedValue({ ok: true, schemas: [app()] });
  deleteAppSchemaAction.mockResolvedValue({ ok: true });
  loadAppSchemaAction.mockResolvedValue({
    ok: true,
    schema: {
      id: "a1",
      name: "My app",
      description: null,
      uiSchema: { type: "form" },
      jsxCode: null,
      isGlobal: false,
    },
  });
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

describe("useAppBuilderSavedApps", () => {
  it("loads the list on mount and clears the loading flag", async () => {
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    expect(hook.result.current.savedApps).toHaveLength(1);
    expect(listAppSchemasAction).toHaveBeenCalledTimes(1);
  });

  it("reports a failed list without leaving the spinner on", async () => {
    listAppSchemasAction.mockResolvedValue({ ok: false, error: "boom" });
    const { hook, onError } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("clears the spinner when the action throws", async () => {
    listAppSchemasAction.mockRejectedValue(new Error("network"));
    const { hook, onError } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    expect(onError).toHaveBeenCalledWith("p.loadSchemaError");
  });

  it("refuses to delete a global app and never calls the action", async () => {
    const { hook, onError } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app({ isGlobal: true }));
    });
    expect(deleteAppSchemaAction).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("p.globalAppReadOnly");
  });

  it("aborts when the confirm dialog is dismissed", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app());
    });
    expect(deleteAppSchemaAction).not.toHaveBeenCalled();
  });

  it("deletes, reports success and refreshes the list", async () => {
    const { hook, onSuccess } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app());
    });
    expect(deleteAppSchemaAction).toHaveBeenCalledWith("a1");
    expect(onSuccess).toHaveBeenCalledWith("p.deleteSchemaSuccess");
    expect(listAppSchemasAction).toHaveBeenCalledTimes(2);
  });

  // The editor must be reset only when the row being deleted is the one open.
  it("notifies when the deleted app is the one currently open", async () => {
    const { hook, onDeletedCurrent } = setup({ isCurrent: (id) => id === "a1" });
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app());
    });
    expect(onDeletedCurrent).toHaveBeenCalledTimes(1);
  });

  it("does not notify when a different app is deleted", async () => {
    const { hook, onDeletedCurrent } = setup({ isCurrent: (id) => id === "other" });
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app());
    });
    expect(onDeletedCurrent).not.toHaveBeenCalled();
  });

  it("always clears deletingSchemaId, even when the delete fails", async () => {
    deleteAppSchemaAction.mockRejectedValue(new Error("nope"));
    const { hook, onError } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleDeleteSaved(app());
    });
    expect(hook.result.current.deletingSchemaId).toBeNull();
    expect(onError).toHaveBeenCalledWith("p.deleteSchemaError");
  });

  it("hands a loaded schema to the editor and clears loadingSchemaId", async () => {
    const { hook, onLoaded } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleLoadSaved("a1");
    });
    expect(loadAppSchemaAction).toHaveBeenCalledWith("a1");
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    expect(hook.result.current.loadingSchemaId).toBeNull();
  });

  it("does not hand anything to the editor when the load fails", async () => {
    loadAppSchemaAction.mockResolvedValue({ ok: false });
    const { hook, onLoaded, onError } = setup();
    await waitFor(() => expect(hook.result.current.loadingSaved).toBe(false));
    await act(async () => {
      await hook.result.current.handleLoadSaved("a1");
    });
    expect(onLoaded).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("p.loadSchemaError");
    expect(hook.result.current.loadingSchemaId).toBeNull();
  });
});
