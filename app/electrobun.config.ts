import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json";

export default {
  app: {
    name: "BragBot",
    identifier: "com.bragbot.app",
    version: pkg.version,
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  release: {
    baseUrl: "https://github.com/AlbinOS/bragbot/releases/latest/download/",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      mainview: {
        entrypoint: "src/mainview/index.tsx",
      },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
  },
} satisfies ElectrobunConfig;
