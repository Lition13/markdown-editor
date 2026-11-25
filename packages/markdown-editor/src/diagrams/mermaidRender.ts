import { mermaidSource } from "./mermaidSource";
import { applyC4Theme, type C4ThemeDatabase } from "./mermaidC4Theme";
import { appendDiagramNotes, vennNotes, type CynefinDatabase, type VennDatabase } from "./mermaidDiagramNotes";
import { fitWardleyLabels, wardleyNotes, type WardleyDatabase } from "./mermaidWardley";
import { prependRailroadTitle, railroadNotes, withRailroadText, type RailroadDatabase, type RailroadData } from "./mermaidRailroad";
import { agentflowNotes, type AgentflowDatabase } from "./mermaidAgentflow";
import { withClassLayout, type ClassDatabase } from "./mermaidClass";
import { sequenceNotes, sequenceLiteralText, type SequenceDatabase } from "./mermaidSequence";
import { withErLayout, type ErDatabase } from "./mermaidEr";

let renderQueue: Promise<unknown> = Promise.resolve();

type BlockPoint = { x: number; y: number };
type BlockShape = {
  calcIntersect?: (shape: BlockShape, point: BlockPoint) => BlockPoint;
  intersect?: (point: BlockPoint) => BlockPoint;
};
type BlockDatabase = { getBlocksFlat: () => BlockShape[] };
const blockDatabases = new WeakSet<object>();
const blockShapes = new WeakSet<object>();

function fixBlockIntersections(database: BlockDatabase) {
  if (blockDatabases.has(database) || typeof database.getBlocksFlat !== "function") return;
  const getBlocks = database.getBlocksFlat;
  database.getBlocksFlat = function () {
    const blocks = getBlocks.call(this);
    for (const block of blocks) {
      if (blockShapes.has(block)) continue;
      // Mermaid's block renderer copies node.intersect onto its layout record.
      // Diamond and similar shapes call this.calcIntersect with the original
      // shape as an argument; delegate to it when that receiver has been lost.
      block.calcIntersect = (shape, point) => {
        if (typeof shape.calcIntersect !== "function" || shape === block) throw new Error("块图节点的连线计算失败");
        return shape.calcIntersect.call(shape, shape, point);
      };
      // The edge graph copies intersect again. Keep the layout receiver even
      // when the function is called from that graph's separate node record.
      let intersect = block.intersect?.bind(block);
      Object.defineProperty(block, "intersect", {
        configurable: true,
        enumerable: true,
        get: () => intersect,
        set: (value: BlockShape["intersect"]) => { intersect = value?.bind(block); },
      });
      blockShapes.add(block);
    }
    return blocks;
  };
  blockDatabases.add(database);
}

export function renderMermaid(code: string, id: string, theme: string, active: () => boolean) {
  const draw = async () => {
    const [{ default: mermaid }, { default: purify }] = await Promise.all([
      import("mermaid"),
      import("dompurify"),
    ]);
    if (!active()) return "";
    const text = mermaidSource(code);
    if (text.length > 50000) throw new Error("图表内容过长，请缩小图表后预览。");
    const header = text.replace(/\r\n?/g, "\n").split("\n").find((line) => line.trim() && !line.trimStart().startsWith("%%")) ?? "";
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      htmlLabels: false,
      theme: theme === "dark" ? "dark" : "default",
      ...(theme === "dark" && /^\s*treeView-beta\b/.test(header) ? { themeVariables: { treeView: {
        labelColor: "#eef2fc", lineColor: "#9aa9c6", iconColor: "#9eb7ff", descriptionColor: "#63dbc4",
        highlightBg: "rgba(242,185,110,0.15)", highlightStroke: "#f2b96e",
      } } } : {}),
      ...(theme === "dark" && /^\s*usecase-beta\b/.test(header) ? { themeVariables: {
        noteTextColor: "#eef2fc", noteBkgColor: "#273650", noteBorderColor: "#60769e",
      } } : {}),
      ...(/^\s*wardley-beta\b/.test(header) ? { "wardley-beta": { labelFontSize: 14, axisFontSize: 14 },
        ...(theme === "dark" ? { themeVariables: { wardley: {
          backgroundColor: "#191f2c", axisColor: "#9aa9c6", axisTextColor: "#eef2fc", gridColor: "#475777",
          componentFill: "#273650", componentStroke: "#9eb7ff", componentLabelColor: "#eef2fc", linkStroke: "#b6c3db",
          evolutionStroke: "#f2a38d", annotationStroke: "#9aa9c6", annotationTextColor: "#eef2fc", annotationFill: "#191f2c",
        } } } : {}),
      } : {}),
      maxTextSize: 50000,
      maxEdges: 500,
      suppressErrorRendering: true,
      secure: ["secure", "securityLevel", "startOnLoad", "maxTextSize", "maxEdges", "themeCSS", "htmlLabels", "flowchart"],
      flowchart: { htmlLabels: false },
    });
    let c4Database: C4ThemeDatabase | undefined;
    let vennDatabase: VennDatabase | undefined, cynefinDatabase: CynefinDatabase | undefined;
    let wardleyDatabase: WardleyDatabase | undefined;
    let railroadDatabase: RailroadDatabase | undefined, railroadData: RailroadData | undefined;
    let agentflowDatabase: AgentflowDatabase | undefined;
    let classDatabase: ClassDatabase | undefined;
    let sequenceDatabase: SequenceDatabase | undefined;
    let erDatabase: ErDatabase | undefined;
    if (/^\s*erDiagram\b/i.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      erDatabase = diagram.db as ErDatabase;
    }
    if (/^\s*sequenceDiagram\b/i.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      sequenceDatabase = diagram.db as SequenceDatabase;
    }
    if (/^\s*classDiagram\b/i.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      classDatabase = diagram.db as ClassDatabase;
    }
    if (/^\s*block(?:-beta)?\b/.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      fixBlockIntersections(diagram.db as BlockDatabase);
    }
    if (/^\s*C4(?:Context|Container|Component|Dynamic|Deployment)\b/.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      c4Database = diagram.db as C4ThemeDatabase;
    }
    if (/^\s*(?:venn-beta|cynefin-beta)\b/i.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      if (/^\s*venn-beta\b/i.test(header)) vennDatabase = diagram.db as VennDatabase;
      else cynefinDatabase = diagram.db as CynefinDatabase;
    }
    if (/^\s*wardley-beta\b/.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      wardleyDatabase = diagram.db as WardleyDatabase;
    }
    if (/^\s*railroad(?:-(?:ebnf|abnf|peg))?-beta\b/i.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      railroadDatabase = diagram.db as RailroadDatabase;
    }
    if (/^\s*agentflow-beta\b/.test(header)) {
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
      agentflowDatabase = diagram.db as AgentflowDatabase;
      agentflowDatabase.getData();
    }
    const renderId = id + "-" + Date.now().toString(36);
    const render = () => mermaid.render(renderId, text);
    let result;
    if (erDatabase) {
      const decoder = document.createElement("textarea");
      result = await withErLayout(erDatabase, renderId, render, (value) => sequenceLiteralText(value, (encoded) => {
        decoder.innerHTML = encoded; return decoder.value;
      }).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
    else if (classDatabase) result = await withClassLayout(classDatabase, render);
    else if (railroadDatabase) {
      const captured = await withRailroadText(railroadDatabase, render);
      result = captured.value; railroadData = captured.database;
    } else result = await render();
    const safe = purify.sanitize(result.svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "image", "a"],
      FORBID_ATTR: ["onload", "onclick", "onerror"],
    });
    const doc = new DOMParser().parseFromString(safe, "image/svg+xml");
    if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror"))
      throw new Error("图表未能生成有效的 SVG");
    if (c4Database) applyC4Theme(doc.documentElement, c4Database, theme === "dark");
    if (vennDatabase) appendDiagramNotes(doc.documentElement, vennNotes(vennDatabase), theme === "dark");
    if (cynefinDatabase) appendDiagramNotes(doc.documentElement, (cynefinDatabase.getDomains().get("confusion")?.items.slice(3) ?? [])
      .map((item) => ({ context: "Confusion", label: item.label })), theme === "dark");
    if (wardleyDatabase) {
      fitWardleyLabels(doc.documentElement, theme === "dark", wardleyDatabase.getWardleyData());
      appendDiagramNotes(doc.documentElement, wardleyNotes(wardleyDatabase.getWardleyData(), wardleyDatabase.getDiagramTitle(), wardleyDatabase.getAccDescription()), theme === "dark");
    }
    if (railroadData) {
      prependRailroadTitle(doc.documentElement, railroadData.getTitle(), theme === "dark");
      appendDiagramNotes(doc.documentElement, railroadNotes(railroadData, /^\s*railroad-peg-beta\b/i.test(header), code), theme === "dark");
    }
    if (agentflowDatabase) appendDiagramNotes(doc.documentElement, agentflowNotes(agentflowDatabase.getSemanticModel()), theme === "dark");
    if (sequenceDatabase) {
      const decoder = document.createElement("textarea");
      appendDiagramNotes(doc.documentElement, sequenceNotes(sequenceDatabase, (value) => sequenceLiteralText(value, (encoded) => { decoder.innerHTML = encoded; return decoder.value; })), theme === "dark");
    }
    if (/^\s*usecase-beta\b/.test(header)) {
      // Actor variants and stereotypes share their CSS class with the shape.
      // Its 2px border otherwise strokes the glyphs too, obscuring the letters.
      // Leave shape strokes and explicit text colors intact.
      doc.querySelectorAll("text,tspan").forEach((node) => (node as SVGElement).style.setProperty("stroke", "none"));
      // Mermaid's usecase CSS targets .nodeLabel, but its note renderer emits
      // .noteLabel. Set the missing inherited default on the label group only;
      // explicit colors on its text children and the note's body remain intact.
      doc.querySelectorAll(".usecase-note .noteLabel").forEach((node) => {
        const label = node as SVGElement;
        if (!label.style.fill) label.style.setProperty("fill", theme === "dark" ? "#eef2fc" : "#333333");
      });
    }
    const cleanCss = (css: string) => css.replace(/@import[^;]*;?/gi, "")
      .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, url) =>
        String(url).trim().startsWith("#") ? `url(${url})` : "none");
    doc.querySelectorAll("style").forEach((node) => { node.textContent = cleanCss(node.textContent || ""); });
    doc.querySelectorAll("[style]").forEach((node) => node.setAttribute("style", cleanCss(node.getAttribute("style") || "")));
    return new XMLSerializer().serializeToString(doc.documentElement);
  };
  const result = renderQueue.catch(() => {}).then(draw);
  renderQueue = result;
  return result;
}
