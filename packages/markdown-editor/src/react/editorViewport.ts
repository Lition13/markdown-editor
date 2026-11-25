export function editorViewport(element: HTMLElement) {
  const owner = element.ownerDocument;
  const viewport = owner.defaultView;
  if (!viewport) return null;
  const scroller = element.closest<HTMLElement>(".markdown-editor-modal .notes-editor-body");
  const bounds = scroller?.getBoundingClientRect();
  const styles = viewport.getComputedStyle(scroller ?? owner.documentElement);
  const margin = (parseFloat(styles.scrollPaddingTop) || 0) + 8;
  const bottomMargin = (parseFloat(styles.scrollPaddingBottom) || 0) + 8;
  return {
    viewport,
    scroller,
    margin,
    top: (bounds?.top ?? 0) + margin,
    bottom: (bounds?.bottom ?? viewport.innerHeight) - bottomMargin,
  };
}
