import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// DOM matchers: toBeDisabled and toHaveTextContent read far better than manual
// attribute checks.
import "@testing-library/jest-dom/vitest";

// Testing-library only registers this itself when vitest globals are on, and
// they are not. Without it every render stacks up in the same document and
// queries start matching the previous test's markup.
afterEach(cleanup);
