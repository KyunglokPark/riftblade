import { defineConfig } from "vite";

// GitHub Pages(https://<user>.github.io/riftblade/) 배포용 — 빌드에서만 하위 경로 적용,
// 로컬 dev는 기존처럼 루트(http://localhost:5180/)에서 열린다.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/riftblade/" : "/",
  server: { port: 5180, host: true },
  build: { target: "es2020" },
}));
