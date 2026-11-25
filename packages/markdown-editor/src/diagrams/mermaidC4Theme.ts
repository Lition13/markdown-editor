type Boundary = {
  x?: number; y?: number; width?: number; height?: number;
  fontColor?: string; borderColor?: string;
};
export type C4ThemeDatabase = {
  getBoundaries: () => Boundary[];
  getRels: () => { textColor?: string; lineColor?: string }[];
};
const paint = /^(?:#[a-f\d]{3,8}|[a-z]{1,24}|(?:rgb|hsl)a?\([\d.,% /-]+\))$/i;
const literalPaint = (value: unknown) => typeof value === "string" && paint.test(value) ? value : undefined;
const rectangleKey = (values: (number | undefined)[]) => values.every((value) => typeof value === "number" && Number.isFinite(value))
  ? values.map((value) => Math.round(value! * 1000) / 1000).join(":") : undefined;

export function applyC4Theme(svg: Element, database: C4ThemeDatabase, dark: boolean) {
  const ink = "#eef2fc", line = "#b6c3db", border = "#60769e";
  const boundaries = new Map(database.getBoundaries().map((boundary) =>
    [rectangleKey([boundary.x, boundary.y, boundary.width, boundary.height]), boundary]));
  const relationships = database.getRels();
  for (const group of Array.from(svg.querySelectorAll("g"))) {
    const children = Array.from(group.children);
    // C4 draws boundaries without IDs, but the database retains the exact
    // rectangle geometry. Match those records instead of guessing from text.
    const rectangle = children.find((child) => child.localName === "rect");
    if (rectangle) {
      const key = rectangleKey(["x", "y", "width", "height"].map((name) => Number(rectangle.getAttribute(name))));
      const boundary = key ? boundaries.get(key) : undefined;
      if (boundary) {
        const fill = literalPaint(boundary.fontColor) ?? (dark && !boundary.fontColor ? ink : undefined);
        if (fill) children.filter((child) => child.localName === "text").forEach((child) => child.setAttribute("fill", fill));
        if (dark && !boundary.borderColor) rectangle.setAttribute("stroke", border);
      }
    }
    if (!dark || !relationships.length) continue;
    const edges = children.filter((child) => ["line", "path"].includes(child.localName) &&
      (child.hasAttribute("marker-start") || child.hasAttribute("marker-end")));
    if (edges.length !== relationships.length) continue;
    let index = -1;
    for (const child of children) {
      if (edges.includes(child)) {
        index++;
        if (!relationships[index]?.lineColor) child.setAttribute("stroke", line);
      } else if (index >= 0 && child.localName === "text" && !relationships[index]?.textColor) child.setAttribute("fill", ink);
    }
  }
  if (dark) {
    Array.from(svg.children).filter((child) => child.localName === "text").forEach((child) => child.setAttribute("fill", ink));
    for (const marker of Array.from(svg.querySelectorAll("marker"))) {
      if (!/(?:-arrowhead|-arrowend)$/.test(marker.id)) continue;
      marker.querySelectorAll("path").forEach((child) => child.setAttribute("fill", line));
    }
  }
}
