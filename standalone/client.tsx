import { createRoot } from "react-dom/client";
import Workspace from "../app/workspace";
import "../app/globals.css";

async function start() {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (response.status === 401) { window.location.replace("/login"); return; }
    if (!response.ok) throw new Error();
    const user = await response.json() as { displayName: string };
    createRoot(document.getElementById("root")!).render(<Workspace displayName={user.displayName} />);
  } catch {
    const node = document.getElementById("root")!;
    node.textContent = "暂时无法打开私人空间，请刷新页面重试。";
    node.setAttribute("role", "alert");
  }
}
void start();
