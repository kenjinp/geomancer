import React from "react";

import { BUILD_INFO, COMMIT_INFO } from "@constants";

export const Footer: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <footer className="text-shadow text-xs flex w-screen justify-between fixed bottom-0 z-[999] p-4">
      <div>
        <a
          className="opacity-50 hover:opacity-100 transition-opacity duration-200 ease-in-out"
          title="commit hash"
          href={`https://github.com/kenjinp/geomancer/commit/${COMMIT_INFO.hash}`}
        >
          Version {COMMIT_INFO.shortHash}{" "}
          <span title="build date">
            {new Date(BUILD_INFO.buildTime).toLocaleDateString()} WIP
          </span>{" "}
        </a>
      </div>
      <div>
        <a
          href="https://github.com/kenjinp/geomancer"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>Support this project, star the repo on github!</span>
        </a>
      </div>
      {children}
      <div className="mr-20">
        <a
          href="https://ko-fi.com/kennywtf"
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-50 hover:opacity-100 transition-opacity duration-200 ease-in-out"
        >
          Buy me a coffee
        </a>
      </div>
    </footer>
  );
};
