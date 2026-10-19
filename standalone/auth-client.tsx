import { hydrateRoot } from "react-dom/client";
import Auth, { type AuthConfig } from "./auth-view";
import "./auth.css";

const root = document.getElementById("auth-root")!;
const config = JSON.parse(root.dataset.config || '{"channels":[]}') as AuthConfig;
hydrateRoot(root, <Auth account={root.dataset.account === "true"} initialConfig={config} />);
