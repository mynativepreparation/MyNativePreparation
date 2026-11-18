// Layout self-check (developer tool, used by the gallery). Reports:
//  (a) sideways scrolling: the page is wider than the window,
//  (b) overlap: any two DIRECT children of an element marked `data-np-check` whose boxes overlap.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// True when the boxes share an area larger than `tolerance` px on both axes (touching edges are fine).
export function boxesOverlap(a: Box, b: Box, tolerance = 1): boolean {
  return (
    a.left < b.right - tolerance &&
    b.left < a.right - tolerance &&
    a.top < b.bottom - tolerance &&
    b.top < a.bottom - tolerance
  );
}

// Index pairs (i, j) with i < j of every overlapping couple.
export function findOverlappingPairs(boxes: Box[], tolerance = 1): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j], tolerance)) pairs.push([i, j]);
    }
  }
  return pairs;
}

function describe(el: Element): string {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '';
  return `<${el.tagName.toLowerCase()}${cls}> "${text}"`;
}

// Returns a list of problems; an empty list means OK.
export function runLayoutCheck(doc: Document = document, win: Window = window): string[] {
  const problems: string[] = [];

  if (doc.documentElement.scrollWidth > win.innerWidth) {
    problems.push(
      `Sideways scroll: page is ${doc.documentElement.scrollWidth}px wide, window is ${win.innerWidth}px.`,
    );
  }

  doc.querySelectorAll('[data-np-check]').forEach((group) => {
    const items = Array.from(group.children).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0; // hidden elements cannot overlap
    });
    const boxes = items.map((el) => el.getBoundingClientRect());
    findOverlappingPairs(boxes).forEach(([i, j]) => {
      problems.push(`Overlap: ${describe(items[i])} and ${describe(items[j])}`);
    });
  });

  return problems;
}
