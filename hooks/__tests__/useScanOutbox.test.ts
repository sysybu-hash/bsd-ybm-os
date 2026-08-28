/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useScanOutbox } from "../useScanOutbox";

jest.mock("@/lib/offline/scan-outbox", () => ({
  countOutbox: jest.fn(),
  flushScanOutbox: jest.fn(),
}));

import { countOutbox, flushScanOutbox } from "@/lib/offline/scan-outbox";

const mockCount = countOutbox as jest.Mock;
const mockFlush = flushScanOutbox as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCount.mockResolvedValue(2);
});

function fireOnline() {
  window.dispatchEvent(new Event("online"));
}

describe("useScanOutbox", () => {
  it("reports the queued count on mount", async () => {
    const { result } = renderHook(() => useScanOutbox());
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  /**
   * The outbox posts with persist:"true", so a second flush that overlaps the
   * first re-submits records the first has not finished clearing — duplicate
   * documents, not just duplicate work.
   */
  it("flushes once when the network reconnects twice in quick succession", async () => {
    let release!: () => void;
    mockFlush.mockImplementation(
      () => new Promise((res) => { release = () => res({ synced: 2, remaining: 0 }); }),
    );

    renderHook(() => useScanOutbox());
    await waitFor(() => expect(mockCount).toHaveBeenCalled());

    await act(async () => { fireOnline(); });
    await act(async () => { fireOnline(); });

    expect(mockFlush).toHaveBeenCalledTimes(1);

    await act(async () => { release(); });
  });

  it("allows a further sync once the first one has finished", async () => {
    mockFlush.mockResolvedValue({ synced: 2, remaining: 0 });
    const { result } = renderHook(() => useScanOutbox());
    await waitFor(() => expect(mockCount).toHaveBeenCalled());

    await act(async () => { await result.current.sync(); });
    await act(async () => { await result.current.sync(); });

    expect(mockFlush).toHaveBeenCalledTimes(2);
  });

  it("keeps the periodic refresh reading the live queue", async () => {
    jest.useFakeTimers();
    try {
      renderHook(() => useScanOutbox());
      mockCount.mockResolvedValue(7);
      await act(async () => { jest.advanceTimersByTime(15_000); });
      expect(mockCount).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
