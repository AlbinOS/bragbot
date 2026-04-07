import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { Electroview } from "electrobun/view";
import App from "../App";

const rpc = Electroview.defineRPC({
  handlers: {
    requests: {},
    messages: {},
  },
});

const electroview = new Electroview({ rpc });
(window as any).__electrobun = electroview;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
