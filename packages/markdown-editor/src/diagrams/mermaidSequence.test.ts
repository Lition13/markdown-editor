import { describe, expect, it } from "vitest";
import { sequenceBoxText, sequenceNumber, sequenceNotes, sequenceLiteralText, type SequenceDatabase } from "./mermaidSequence";

describe("sequence diagram labels", () => {
  const valid = (value: string) => ["transparent", "Yellow", "rgb(230, 240, 255)", "rgba(1, 2, 3, 0.5)"].includes(value);
  it("retains uncolored titles instead of consuming the first word as a color", () => {
    expect(sequenceBoxText("工作区", valid)).toEqual({ color: "transparent", title: "工作区" });
    expect(sequenceBoxText("Local Workspace", valid)).toEqual({ color: "transparent", title: "Local Workspace" });
    expect(sequenceBoxText("Yellow 归档区", valid)).toEqual({ color: "Yellow", title: "归档区" });
  });
  it("keeps function colors, transparency and wrap prefixes separate from titles", () => {
    expect(sequenceBoxText("rgb(230, 240, 255) wrap:完整分组", valid)).toEqual({ color: "rgb(230, 240, 255)", title: "wrap:完整分组" });
    expect(sequenceBoxText("transparent Yellow", valid)).toEqual({ color: "transparent", title: "Yellow" });
    expect(sequenceBoxText("rgba(1, 2, 3, 0.5) 半透明分组", valid)).toEqual({ color: "rgba(1, 2, 3, 0.5)", title: "半透明分组" });
  });
  it("prints fractional sequence indices without accumulating floating point tails", () => {
    expect(sequenceNumber(.1 + .2)).toBe("0.3");
    expect(sequenceNumber(1.25 + .25)).toBe("1.5");
    expect(() => sequenceNumber(Infinity)).toThrow("无效数值");
  });
  it("retains empty groups and static actor metadata, including zero and false", () => {
    const database: SequenceDatabase = { getBoxes: () => [{ name: "未开始的工作区", actorKeys: [] }, { name: "有成员", actorKeys: ["A"] }], getActors: () => new Map([["A", {
      name: "A", description: "入口", links: { "帮助": "https://example.invalid?q=<T>" }, properties: { "数量": 0, "启用": false, "资料": { label: "<script>literal</script>" } },
    }]]) };
    const notes = sequenceNotes(database, (value) => value);
    expect(notes).toContainEqual({ context: "参与者分组", label: "未开始的工作区（暂无参与者）" });
    expect(notes.map((note) => note.label)).toEqual(["未开始的工作区（暂无参与者）", "https://example.invalid?q=<T>", "0", "false", '{"label":"<script>literal</script>"}']);
    expect(sequenceNotes(database, (value) => value, false)).toHaveLength(4);
    const encoded: string[] = []; sequenceLiteralText("ﬂ°lt¶ßliteralﬂ°gt¶ß <script> ﬂ°°9829¶ß", (value) => { encoded.push(value); return value; });
    expect(encoded).toEqual(["&lt;literal&gt; &lt;script&gt; &#9829;"]);
  });
});
