import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// Mermaid's event renderer writes card labels into foreignObject, which the
// application's strict SVG sanitizer deliberately removes. Use one plain SVG
// model/layout for PC, H5, App and Mini, keeping the installed parser/validation.
export function eventModelPlugin(): Plugin {
  return {
    name: "dida-event-model-svg", enforce: "pre",
    config() {
      // Prebundling otherwise bypasses transform() and restores Mermaid's
      // foreignObject renderer during dev. Keep its nested CJS dependencies
      // optimized, while the installed ESM diagram chunks use this adapter.
      return { optimizeDeps: { exclude: ["mermaid"], include: [
        "mermaid > cytoscape", "mermaid > cytoscape-cose-bilkent", "mermaid > cytoscape-fcose",
        "mermaid > dayjs", "mermaid > elkjs/lib/elk.bundled.js", "mermaid > @braintree/sanitize-url",
        "mermaid > dayjs/plugin/isoWeek.js", "mermaid > dayjs/plugin/customParseFormat.js",
        "mermaid > dayjs/plugin/advancedFormat.js", "mermaid > dayjs/plugin/duration.js",
      ] } };
    },
    transform(code, id) {
      if (!id.replaceAll("\\", "/").includes("/node_modules/mermaid/") || code.includes("// dida-event-model-svg")) return;
      const info = code.includes("// src/diagrams/info/infoDiagram.ts");
      if (!info && !code.includes("// src/diagrams/eventmodeling/diagram.ts")) return;
      const ast = this.parse(code);
      const state = ast.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "getState");
      const draw = ast.body.find((node) => node.type === "VariableDeclaration" && node.declarations.some((item) => item.id.type === "Identifier" && item.id.name === "draw"));
      if ((!info && !state) || !draw) this.error("Cannot adapt the installed Event Modeling renderer");
      const range = (node: unknown) => {
        const value = node as { start?: unknown; end?: unknown };
        if (typeof value.start !== "number" || typeof value.end !== "number") this.error("Event Modeling source range is missing");
        return { start: value.start as number, end: value.end as number };
      };
      const helper = fileURLToPath(new URL("../src/diagrams/mermaidEventModel.ts", import.meta.url)).replaceAll("\\", "/");
      if (info) {
        const config = ast.body.find((node) => node.type === "ImportDeclaration" && node.specifiers.some((item) => item.type === "ImportSpecifier" && item.imported.type === "Identifier" && item.imported.name === "configureSvgSize"));
        if (!config || config.type !== "ImportDeclaration") this.error("Cannot locate Info renderer configuration");
        const span = range(draw);
        code = code.slice(0, span.start) + `const draw = function(_text, id, version) {
          const result = didaInfoSvg(version, String(didaModelConfig().theme).includes("dark"));
          const root = selectSvgElement(id);
          root.attr("viewBox", '0 0 ' + result.width + ' ' + result.height).attr("width", result.width).attr("height", result.height);
          root.append("g").html(result.content);
        };` + code.slice(span.end);
        return { code: `// dida-event-model-svg\nimport { infoModelSvg as didaInfoSvg } from ${JSON.stringify(helper)};\nimport { getConfig2 as didaModelConfig } from ${JSON.stringify(config.source.value)};\n` + code, map: null };
      }
      const edits = [
        { ...range(state), text: "function getState() { if (!store.ast) throw new Error('No data for EventModel'); return didaEventState(store.ast); }" },
        { ...range(draw), text: `const draw = function(text, id, _version, diagram) {
          const dark = String(getConfig2().theme).includes("dark");
          const result = didaEventSvg(diagram.db.getState(), dark, { title: diagram.db.getDiagramTitle(), description: diagram.db.getAccDescription(), source: text, id });
          const root = select('[id="' + id + '"]');
          root.attr("viewBox", '0 0 ' + result.width + ' ' + result.height).attr("width", result.width).attr("height", result.height).attr("class", "em-diagram");
          root.append("g").attr("class", "em-content").html(result.content);
        };` },
      ];
      for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
      return { code: `// dida-event-model-svg\nimport { buildEventModel as didaEventState, eventModelSvg as didaEventSvg } from ${JSON.stringify(helper)};\n` + code, map: null };
    },
  };
}
