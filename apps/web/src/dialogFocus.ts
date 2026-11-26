export function preserveTextSelection(document: Document) {
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
  const { selectionStart: start, selectionEnd: end, selectionDirection: direction } = field;
  if (start === null || end === null) return;

  return () => {
    if (document.activeElement === field) field.setSelectionRange(start, end, direction ?? undefined);
  };
}
