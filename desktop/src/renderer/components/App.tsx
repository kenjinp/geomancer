import { NextUIProvider } from "@nextui-org/react";
import { HashRouter } from "react-router-dom";
import "../styles/app.css";
import { AppRouter, NavigationBar } from "./Router";

/**
 * Wrapper for the entire application.
 *
 * @component
 */
export function App() {
  return (
    <NextUIProvider>
      <HashRouter>
        <AppRouter />
        <div
          id="navigation-bar"
          className="drag-region fixed top-0 left-0 w-full border-b border-dark bg-background"
        >
          <NavigationBar />
        </div>
      </HashRouter>
    </NextUIProvider>
  );
}
