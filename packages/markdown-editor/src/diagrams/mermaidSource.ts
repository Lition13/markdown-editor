export function mermaidSource(code: string) {
  return code
    .replace(/^\s*---\s*\n[\s\S]*?\n---\s*\n/, "")
    .replace(/%%\{[\s\S]*?\}%%/g, "");
}
