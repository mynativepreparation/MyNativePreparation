// Every message that modules may send to each other through the wire.
// Add new events here; never import one module from another.
export interface WireEvents {
  'ui.toast': { message: string };
  'course.open': { courseId: string };
  'test.finished': { courseId: string; testId: string; score: number; total: number };
}
