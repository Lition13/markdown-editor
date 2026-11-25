import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).freeze();
