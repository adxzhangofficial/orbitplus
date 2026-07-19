import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { App } from "@/app";
import { AuthProvider } from "@/contexts/auth-context";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#171717",
              border: "1px solid rgba(255,255,255,.1)",
              color: "#fafafa",
              fontSize: "11px",
            },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
