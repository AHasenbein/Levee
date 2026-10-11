import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import LegalPage from "./components/LegalPage"

const path = window.location.pathname.replace(/\/$/, "")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path === "/privacy" ? <LegalPage kind="privacy" /> : path === "/terms" ? <LegalPage kind="terms" /> : <App />}
  </StrictMode>
)
