import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAction } from "./use-action";

/**
 * The bug this guards against: a button wired to a slow request looked dead
 * while it ran, so it got clicked again, and both requests eventually finished
 * and reported success.
 *
 * The first test is the one that matters. A guard built on state instead of a
 * ref passes every other test here and still fails that one, because two
 * clicks in the same tick both read the pre-update value.
 */

function Harness({ action }: { action: () => Promise<unknown> }) {
  const [run, pending] = useAction(action);
  return (
    <button type="button" onClick={() => void run()} disabled={pending}>
      {pending ? "Working" : "Idle"}
    </button>
  );
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useAction", () => {
  it("ignores clicks in the same tick as the first", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    render(<Harness action={action} />);
    const button = screen.getByRole("button");

    // Three clicks before React has re-rendered anything. This is what a person
    // does to a button that appears not to have responded.
    await act(async () => {
      button.click();
      button.click();
      button.click();
    });

    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => { gate.resolve(); });
  });

  it("ignores a later click while the first is still running", async () => {
    const gate = deferred();
    const action = vi.fn(() => gate.promise);
    render(<Harness action={action} />);
    const button = screen.getByRole("button");

    await act(async () => { button.click(); });
    expect(screen.getByRole("button")).toHaveTextContent("Working");

    await act(async () => { button.click(); });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => { gate.resolve(); });
  });

  it("says it is working, because silence is what invites the second click", async () => {
    const gate = deferred();
    render(<Harness action={() => gate.promise} />);

    expect(screen.getByRole("button")).toHaveTextContent("Idle");
    await act(async () => { screen.getByRole("button").click(); });
    expect(screen.getByRole("button")).toHaveTextContent("Working");
    expect(screen.getByRole("button")).toBeDisabled();

    await act(async () => { gate.resolve(); });
    expect(screen.getByRole("button")).toHaveTextContent("Idle");
  });

  it("accepts a second run once the first has finished", async () => {
    const action = vi.fn(() => Promise.resolve());
    render(<Harness action={action} />);
    const button = screen.getByRole("button");

    await act(async () => { button.click(); });
    await act(async () => { button.click(); });

    expect(action).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when the action rejects", async () => {
    // A failed request must not wedge the button. This is why the reset lives
    // in a finally rather than after the await.
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    render(<Harness action={action} />);
    const button = screen.getByRole("button");

    await act(async () => { button.click(); });
    expect(screen.getByRole("button")).not.toBeDisabled();

    await act(async () => { button.click(); });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("calls the latest closure, not the one from the first render", async () => {
    // Handlers are written inline and capture state. Holding the first one
    // would submit whatever the form contained when the component mounted.
    const seen: string[] = [];
    function Form() {
      const [value, setValue] = useState("first");
      const [run] = useAction(async () => { seen.push(value); });
      return (
        <>
          <button type="button" onClick={() => setValue("second")}>change</button>
          <button type="button" onClick={() => void run()}>submit</button>
        </>
      );
    }
    render(<Form />);

    await act(async () => { screen.getByText("change").click(); });
    await act(async () => { screen.getByText("submit").click(); });

    expect(seen).toEqual(["second"]);
  });
});
