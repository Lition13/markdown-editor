// Run against the actual SVG, after its labels and group rectangles exist.
export function erLayoutIssues(svg, name) {
  const issues = [], groups = [...svg.querySelectorAll('g.cluster')], entities = [...svg.querySelectorAll('g.node')];
  const group = (label) => groups.find((node) => node.querySelector('.cluster-label')?.textContent.trim() === label)?.querySelector(':scope > rect');
  const entity = (label) => entities.find((node) => node.querySelector('.label.name, .label')?.textContent.trim() === label);
  const inside = (child, parent, description) => {
    if (!child || !parent) { issues.push('Missing ' + description); return; }
    const a = child.getBoundingClientRect(), b = parent.getBoundingClientRect();
    if (!a.width || !a.height || a.left < b.left - .6 || a.top < b.top - .6 || a.right > b.right + .6 || a.bottom > b.bottom + .6) issues.push('Outside ' + description);
  };
  const separate = (a, b, description) => {
    if (!a || !b) { issues.push('Missing ' + description); return; }
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    if (Math.min(x.right, y.right) > Math.max(x.left, y.left) + .6 && Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top) + .6) issues.push('Overlapping ' + description);
  };
  if (name === 'collision') { inside(entity('工作实体'), group('工作域'), 'same-name entity'); separate(entity('TASK'), group('工作域'), 'external target'); }
  if (name === 'generatedCollision') { inside(entity('子实体'), group('分组恰好使用内部标识'), 'generated-ID group child'); separate(entity('实体 A'), group('分组恰好使用内部标识'), 'generated-ID entity'); }
  if (name === 'nestedCollision') { inside(group('内层模型'), group('外层模型'), 'inner group'); inside(entity('同名实体'), group('内层模型'), 'nested same-name entity'); }
  if (name === 'groupCreatedLater') { inside(entity('先声明的实体'), group('先声明的分组'), 'original owner'); inside(entity('子实体'), group('后声明的同名分组'), 'later group child'); separate(group('先声明的分组'), group('后声明的同名分组'), 'top-level groups'); }
  return issues;
}
