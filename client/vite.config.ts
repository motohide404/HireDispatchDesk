import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "react-beautiful-dnd": path.resolve(__dirname, "src/lib/reactBeautifulDnd.tsx")
    }
  }
});
