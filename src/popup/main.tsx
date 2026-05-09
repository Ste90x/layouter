import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LayouterCommand, LayouterResponse, LayouterStatus } from "../shared/messages";
import "./styles.css";

const unavailableStatus: LayouterStatus = {
  editModeEnabled: false,
  canUndo: false,
  canRedo: false,
  moveCount: 0
};

function App() {
  const [status, setStatus] = useState<LayouterStatus>(unavailableStatus);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendCommand({ type: "GET_STATUS" }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reach this page."));
  }, []);

async function sendCommand(command: LayouterCommand): Promise<void> {
    setError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id || !tab.url?.startsWith("http")) {
      setStatus(unavailableStatus);
      setError("Open a regular http(s) page to use Layouter.");
      return;
    }

    let response: LayouterResponse;
    try {
      response = await chrome.tabs.sendMessage<LayouterCommand, LayouterResponse>(tab.id, command);
    } catch {
      await chrome.runtime.sendMessage({ type: "INJECT_CONTENT_SCRIPT", tabId: tab.id });
      response = await chrome.tabs.sendMessage<LayouterCommand, LayouterResponse>(tab.id, command);
    }
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setStatus(response.status);
  }

  return (
    <main className="popup" data-layouter-extension-root>
      <header>
        <div>
          <h1>Layouter</h1>
          <p>{status.editModeEnabled ? "Edit Mode on" : "Edit Mode off"}</p>
        </div>
        <label className="switch">
          <input
            aria-label="Toggle Edit Mode"
            checked={status.editModeEnabled}
            onChange={(event) => sendCommand({ type: "SET_EDIT_MODE", enabled: event.target.checked })}
            type="checkbox"
          />
          <span />
        </label>
      </header>

      <section className="controls">
        <button disabled={!status.canUndo} onClick={() => sendCommand({ type: "UNDO" })} type="button">
          Undo
        </button>
        <button disabled={!status.canRedo} onClick={() => sendCommand({ type: "REDO" })} type="button">
          Redo
        </button>
        <button disabled={status.moveCount === 0} onClick={() => sendCommand({ type: "RESET" })} type="button">
          Reset
        </button>
      </section>

      <footer>
        <span>{status.moveCount} moves</span>
        <span>Alt/Option + drag</span>
      </footer>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
