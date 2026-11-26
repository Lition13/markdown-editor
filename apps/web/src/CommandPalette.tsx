import { Terminal } from "lucide-react";
import { useCallback, type Ref } from "react";
import { matchRank } from "./fileSearch";
import { useWebText } from "./locale";
import PickerDialog, { type PickerDialogHandle } from "./PickerDialog";

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string | null;
  keywords?: string;
  run: () => void;
}

const normalize = (text: string) => text.normalize("NFKC").toLowerCase();

export default function CommandPalette({ ref, commands, onClose }: {
  ref?: Ref<PickerDialogHandle>;
  commands: readonly PaletteCommand[];
  onClose: () => void;
}) {
  const t = useWebText();
  const find = useCallback((query: string) => {
    const terms = normalize(query).replace(/^\s*>/, "").trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return commands;
    return commands.map(command => {
      const label = normalize(command.label);
      const keywords = normalize([command.keywords, command.shortcut].filter(Boolean).join(" "));
      const score = terms.reduce((sum, term) => sum + Math.min(matchRank(label, term), 4 + matchRank(keywords, term)), 0);
      return { command, score };
    }).filter(item => Number.isFinite(item.score)).sort((left, right) => left.score - right.score).map(item => item.command);
  }, [commands]);

  return <PickerDialog ref={ref} id="command-palette" title={t("命令面板")} placeholder={t("搜索命令")} closeLabel={t("关闭命令面板")}
    resultsLabel={t("命令搜索结果")} emptyLabel={t("没有匹配的命令")} searchIcon={<Terminal size={18} aria-hidden="true" />}
    find={find} onClose={onClose} onPick={(command, close) => { close(); command.run(); }}
    render={command => <>
      <span className="palette-command-name" title={command.label}>{command.label}</span>
      {command.shortcut && <kbd className="palette-command-key">{command.shortcut}</kbd>}
    </>} />;
}
