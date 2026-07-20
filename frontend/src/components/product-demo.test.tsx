import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductDemo } from "./product-demo";
import { SECTIONS } from "./product-demo-sections";

/**
 * The preview is what a visitor judges the product by before signing up, and
 * none of it is covered by the app's own tests because none of it talks to the
 * API. The risk worth guarding is a sidebar entry that leads nowhere: it
 * renders an empty panel, which reads as a broken product.
 */

const SIDEBAR_LABELS = [
  "Overview", "Servers", "Transfers",
  "Deployments", "Backups & restore", "Terminal", "Runbooks", "Automations",
  "Monitoring", "Activity & audit", "Notifications",
  "Team", "Integrations", "API keys", "Usage", "Plan & billing", "Settings",
];

describe("Every sidebar entry goes somewhere", () => {
  it("has a section for every label except Servers, which is the default view", () => {
    const missing = SIDEBAR_LABELS.filter((label) => label !== "Servers" && !SECTIONS[label]);
    // A label renamed on one side and not the other would silently render an
    // empty panel rather than failing.
    expect(missing).toEqual([]);
  });

  it("renders real content for each one", () => {
    for (const [label, section] of Object.entries(SECTIONS)) {
      const { container, unmount } = render(<>{section.render()}</>);
      expect(container.textContent?.trim().length, `${label} rendered nothing`).toBeGreaterThan(40);
      unmount();
    }
  });

  it("is reachable from the sidebar", () => {
    render(<ProductDemo />);
    const nav = within(screen.getByRole("complementary", { name: "Workspace navigation" }));
    for (const label of SIDEBAR_LABELS) {
      expect(nav.getByRole("button", { name: new RegExp(label.replace("&", "\\&")) })).toBeInTheDocument();
    }
  });
});

describe("The preview responds", () => {
  // Several labels appear in both the sidebar and the main panel — Deployments
  // is a sidebar entry and a tab — so queries are scoped to one of them.
  const sidebar = () => within(screen.getByRole("complementary", { name: "Workspace navigation" }));
  const tabs = () => within(screen.getByRole("navigation", { name: "Server sections" }));

  it("opens on the server view", () => {
    render(<ProductDemo />);
    expect(screen.getByRole("heading", { name: "Production API" })).toBeInTheDocument();
  });

  it("switches server when one is picked", () => {
    render(<ProductDemo />);
    fireEvent.click(sidebar().getByRole("button", { name: /Staging/ }));
    expect(screen.getByRole("heading", { name: "Staging" })).toBeInTheDocument();
    expect(screen.getByText(/root@staging\.acme\.internal:2222/)).toBeInTheDocument();
  });

  it("navigates to another section from the sidebar", () => {
    render(<ProductDemo />);
    fireEvent.click(sidebar().getByRole("button", { name: /Team/ }));
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(screen.getByText("maya@acme.com")).toBeInTheDocument();
  });

  it("returns to the server view when a server is picked from another section", () => {
    render(<ProductDemo />);
    fireEvent.click(sidebar().getByRole("button", { name: /Usage/ }));
    expect(screen.getByRole("heading", { name: "Usage" })).toBeInTheDocument();

    fireEvent.click(sidebar().getByRole("button", { name: /Frontend Cluster/ }));
    expect(screen.getByRole("heading", { name: "Frontend Cluster" })).toBeInTheDocument();
  });

  it("shows dashes rather than zeros once disconnected", () => {
    render(<ProductDemo />);
    expect(screen.queryAllByText("—")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));

    // The product's own rule: unmeasured is not the same fact as measured at
    // zero, and the preview must not teach the opposite.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("button", { name: /Connect/ })).toBeInTheDocument();
  });

  it("opens a folder and comes back", () => {
    render(<ProductDemo />);
    expect(screen.getByText("/var/www/api")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^src/ }));
    expect(screen.getByText("/var/www/api/src")).toBeInTheDocument();
    expect(screen.getByText("config.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Up one level"));
    expect(screen.getByText("/var/www/api")).toBeInTheDocument();
  });

  it("switches tabs within the server view", () => {
    render(<ProductDemo />);
    fireEvent.click(tabs().getByRole("button", { name: "Deployments" }));
    expect(screen.getByText("release-2026.07.19")).toBeInTheDocument();
  });
});

describe("The sidebar keeps its original styling", () => {
  it("uses the exact row classes the design specifies", () => {
    render(<ProductDemo />);
    const overview = within(screen.getByRole("complementary", { name: "Workspace navigation" }))
      .getByRole("button", { name: /Overview/ });

    // Asserted as the exact string rather than a set of tokens. The sizing
    // drifted twice during rebuilds — once by shrinking the row, once by adding
    // layout utilities to make a button behave like the div — and both were
    // visible immediately. A token check would have passed for the second.
    expect(overview.className).toBe(
      "flex h-7 items-center gap-2 rounded px-2 text-[8px] text-zinc-600 cursor-pointer hover:bg-white/[0.03]",
    );
  });
});
