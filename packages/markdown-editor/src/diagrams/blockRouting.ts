export interface BlockPoint { x: number; y: number }
export interface BlockBounds extends BlockPoint { width: number; height: number }
export interface BlockPort { point: BlockPoint; outside: BlockPoint; direction: 0 | 1 }
export interface BlockObstacle extends BlockBounds { ports: BlockPort[]; container: boolean }
const coordinate = (value: number) => Math.round(value * 10000) / 10000;

function lower(values: number[], value: number, inclusive = true) {
  let start = 0, end = values.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (values[middle] < value || (!inclusive && values[middle] === value)) start = middle + 1;
    else end = middle;
  }
  return start;
}

export function simplifyBlockPath(points: BlockPoint[]) {
  const result: BlockPoint[] = [];
  for (const value of points) {
    const point = { x: coordinate(value.x), y: coordinate(value.y) };
    const last = result[result.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;
    if (result.length > 1) {
      const before = result[result.length - 2];
      if ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y)) result.pop();
    }
    result.push(point);
  }
  return result;
}

type Candidate = { key: number; cost: number; score: number };
class RouteQueue {
  private values: Candidate[] = [];
  push(value: Candidate) {
    let at = this.values.length;
    this.values.push(value);
    while (at > 0) {
      const parent = (at - 1) >>> 1;
      if (this.values[parent].score <= value.score) break;
      this.values[at] = this.values[parent];
      at = parent;
    }
    this.values[at] = value;
  }
  shift() {
    const first = this.values[0], last = this.values.pop();
    if (this.values.length && last) {
      let at = 0;
      while (at * 2 + 1 < this.values.length) {
        let child = at * 2 + 1;
        if (child + 1 < this.values.length && this.values[child + 1].score < this.values[child].score) child++;
        if (this.values[child].score >= last.score) break;
        this.values[at] = this.values[child];
        at = child;
      }
      this.values[at] = last;
    }
    return first;
  }
}

export function blockRouter(nodes: BlockObstacle[], width: number, height: number, label = "块图") {
  const xs = new Set([16, width - 16]), ys = new Set([16, height - 16]);
  for (const node of nodes) {
    for (const value of [node.x - 20, node.x - 10, node.x + node.width / 2, node.x + node.width + 10, node.x + node.width + 20]) xs.add(coordinate(value));
    for (const value of [node.y - 20, node.y - 10, node.y + node.height / 2, node.y + node.height + 10, node.y + node.height + 20]) ys.add(coordinate(value));
    for (const { outside } of node.ports) { xs.add(coordinate(outside.x)); ys.add(coordinate(outside.y)); }
  }
  const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b);
  const columns = x.length, rows = y.length, area = columns * rows, stride = columns + 1;
  if (area > 1_500_000) throw new Error(label + "连线过于复杂，请拆分后预览。");
  const changes = new Int16Array((columns + 1) * (rows + 1));
  // A difference grid keeps obstacle construction bounded by the mesh size,
  // without testing every grid point against every block.
  for (const node of nodes.filter((item) => !item.container)) {
    const left = lower(x, coordinate(node.x - 10), false), right = lower(x, coordinate(node.x + node.width + 10));
    const top = lower(y, coordinate(node.y - 10), false), bottom = lower(y, coordinate(node.y + node.height + 10));
    changes[top * stride + left]++;
    changes[top * stride + right]--;
    changes[bottom * stride + left]--;
    changes[bottom * stride + right]++;
  }
  const blocked = new Uint8Array(area);
  for (let row = 0; row < rows; row++) {
    let sum = 0;
    for (let column = 0; column < columns; column++) {
      const at = row * stride + column;
      sum += changes[at];
      changes[at] = sum + (row ? changes[at - stride] : 0);
      blocked[row * columns + column] = changes[at] > 0 ? 1 : 0;
    }
  }
  const at = (point: BlockPoint) => lower(y, coordinate(point.y)) * columns + lower(x, coordinate(point.x));
  const point = (index: number): BlockPoint => ({ x: x[index % columns], y: y[Math.floor(index / columns)] });
  const distance = (a: BlockPoint, b: BlockPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const used = new Map<number, number>();
  const segmentKey = (a: number, b: number) => Math.min(a, b) * area + Math.max(a, b);

  return (source: BlockObstacle, target: BlockObstacle) => {
    const same = source === target;
    const starts = same ? source.ports.slice(1, 2) : source.ports;
    const ends = same ? target.ports.slice(0, 1) : target.ports;
    const goals = new Map(ends.map((port) => [at(port.outside), port]));
    const heuristic = (index: number) => Math.min(...ends.map((port) => distance(point(index), port.outside)));
    const valid = (index: number) => {
      if (blocked[index]) return false;
      const current = point(index);
      return !same || !source.container || current.x <= source.x - 10 || current.x >= source.x + source.width + 10 ||
        current.y <= source.y - 10 || current.y >= source.y + source.height + 10;
    };
    const queue = new RouteQueue(), costs = new Map<number, number>(), previous = new Map<number, number>();
    const origins = new Map<number, BlockPort>();
    for (const port of starts) {
      const index = at(port.outside);
      if (!valid(index)) continue;
      const key = index * 2 + port.direction;
      costs.set(key, 0); origins.set(key, port);
      queue.push({ key, cost: 0, score: heuristic(index) });
    }
    let expanded = 0;
    for (let current = queue.shift(); current; current = queue.shift()) {
      if (current.cost !== costs.get(current.key)) continue;
      const index = current.key >>> 1;
      const goal = goals.get(index);
      if (goal) {
        const indices = [index];
        let key = current.key;
        while (previous.has(key)) { key = previous.get(key)!; indices.push(key >>> 1); }
        indices.reverse();
        for (let i = 1; i < indices.length; i++) {
          const segment = segmentKey(indices[i - 1], indices[i]);
          used.set(segment, (used.get(segment) ?? 0) + 1);
        }
        return simplifyBlockPath([origins.get(key)!.point, ...indices.map(point), goal.point]);
      }
      if (++expanded > 20000) break;
      const column = index % columns, row = Math.floor(index / columns);
      const neighbors = [column ? index - 1 : -1, column + 1 < columns ? index + 1 : -1,
        row ? index - columns : -1, row + 1 < rows ? index + columns : -1];
      for (let direction = 0; direction < neighbors.length; direction++) {
        const next = neighbors[direction];
        if (next < 0 || !valid(next)) continue;
        const orientation = direction < 2 ? 0 : 1, key = next * 2 + orientation;
        const cost = current.cost + distance(point(index), point(next)) +
          (orientation !== (current.key & 1) ? 12 : 0) + (used.get(segmentKey(index, next)) ?? 0) * 20;
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, cost); previous.set(key, current.key);
        queue.push({ key, cost, score: cost + heuristic(next) });
      }
    }
    throw new Error(label + "未能找到清晰的连线路径，请增加留白或拆分后预览。");
  };
}
