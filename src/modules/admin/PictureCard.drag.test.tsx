import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PicturePatch } from '../../core/admin/chapterSlots';
import type { DraftImage } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { PictureCard, type PictureCardProps } from './PictureCard';

// P10 T11o O4b: the drag handles of the picture card. jsdom has no layout, so the measuring is mocked: the stage (the column) starts at
// x = 100 and is 400 px wide, the frame (the picture) is 200 px high. Events are plain MouseEvents with a pointer-event name (jsdom has
// no PointerEvent everywhere; the card only reads clientX / clientY / button).

const IMAGE: DraftImage = { path: 'images/a.png', mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) };
const BLOCK: Block = { id: 'blk-a1', type: 'image', src: 'images/a.png', alt: '' };

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('np-picture__stage')) return rect(100, 0, 400, 300);
    if (this.classList.contains('np-picture__frame')) return rect(100, 0, 400, 200);
    return rect(0, 0, 0, 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(block: Block = BLOCK, extra: Partial<PictureCardProps> = {}) {
  const onChange = vi.fn<(patch: PicturePatch) => void>();
  const view = render(<PictureCard block={block} image={IMAGE} onChange={onChange} onRemove={() => undefined} {...extra} />);
  return { onChange, ...view };
}

const card = () => screen.getByRole('region', { name: t('admin.picture.cardLabel') });
const frame = () => card().querySelector('.np-picture__frame') as HTMLElement;
const handle = (kind: 'width' | 'height') => card().querySelector(`[data-np-handle="${kind}"]`) as HTMLElement;
const widthBox = () => screen.getByLabelText(t('admin.picture.widthLabel'));
const heightBox = () => screen.getByLabelText(t('admin.picture.heightLabel'));
const patches = (fn: { mock: { calls: Array<[PicturePatch]> } }): PicturePatch[] => fn.mock.calls.map(([patch]) => patch);

function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', target: Element | Window, x: number, y = 0, button = 0) {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button }));
  });
}

describe('PictureCard: the picture is drawn at its real size and place', () => {
  it('a picture without numbers fills the column and sits in the middle', () => {
    setup();
    expect(frame().style.width).toBe('100%');
    expect(frame()).toHaveClass('np-picture__frame--center');
  });

  it('the frame has the width and the position of the picture', () => {
    setup({ ...BLOCK, width: 40, align: 'right' });
    expect(frame().style.width).toBe('40%');
    expect(frame()).toHaveClass('np-picture__frame--right');
    expect(frame()).not.toHaveClass('np-picture__frame--center');
  });

  it('shows the hint and two handles that screen readers and the Tab key leave alone', () => {
    setup();
    expect(screen.getByText(t('admin.picture.dragHint'))).toBeInTheDocument();
    for (const kind of ['width', 'height'] as const) {
      expect(handle(kind).tagName).toBe('DIV');
      expect(handle(kind)).toHaveAttribute('aria-hidden', 'true');
      expect(handle(kind)).not.toHaveAttribute('tabindex');
    }
  });

  it('the width handle is on the right edge, but on the left edge of a picture on the right', () => {
    const { rerender } = setup({ ...BLOCK, align: 'left' });
    expect(handle('width')).toHaveClass('np-picture__handle--right');
    rerender(<PictureCard block={{ ...BLOCK, align: 'right' }} image={IMAGE} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(handle('width')).toHaveClass('np-picture__handle--left');
    rerender(<PictureCard block={BLOCK} image={IMAGE} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(handle('width')).toHaveClass('np-picture__handle--right');
  });

  it('a picture that is not in the draft has no frame and no handles', () => {
    setup(BLOCK, { image: undefined });
    expect(frame()).toBeNull();
    expect(card().querySelector('[data-np-handle]')).toBeNull();
    expect(screen.queryByText(t('admin.picture.dragHint'))).toBeNull();
  });
});

describe('PictureCard: dragging the width handle', () => {
  it('follows the pointer while it is down and reports ONE patch when it is released', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    expect(frame()).toHaveAttribute('data-np-dragging', 'width');
    pointer('pointermove', window, 340);
    pointer('pointermove', window, 400); // 100 px of 400 = +25 percent
    expect(frame().style.width).toBe('75%');
    expect(widthBox()).toHaveValue('75');
    expect(onChange).not.toHaveBeenCalled();
    pointer('pointerup', window, 400);
    expect(patches(onChange)).toEqual([{ width: 75 }]);
    expect(frame()).not.toHaveAttribute('data-np-dragging');
  });

  it('a picture in the middle grows to both sides, so twice as fast', () => {
    const { onChange } = setup({ ...BLOCK, width: 50 });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 340); // 40 px of 400 = 10 percent, doubled
    pointer('pointerup', window, 340);
    expect(patches(onChange)).toEqual([{ width: 70 }]);
  });

  it('a picture on the right grows when the pointer moves to the left', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'right' });
    pointer('pointerdown', handle('width'), 200);
    pointer('pointermove', window, 100);
    pointer('pointerup', window, 100);
    expect(patches(onChange)).toEqual([{ width: 75 }]);
  });

  it('never goes outside the allowed range', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 9000);
    pointer('pointerup', window, 9000);
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, -9000);
    pointer('pointerup', window, -9000);
    expect(patches(onChange)).toEqual([{ width: 100 }, { width: 10 }]);
  });

  it('a picture without a width starts from 100 percent', () => {
    const { onChange } = setup({ ...BLOCK, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 200); // -25 percent
    pointer('pointerup', window, 200);
    expect(patches(onChange)).toEqual([{ width: 75 }]);
  });

  it('the handle press does not also start the slide of the whole picture', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 480); // far to the right: would be the "right" third if it were a slide
    pointer('pointerup', window, 480);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(patches(onChange)).toEqual([{ width: 95 }]);
  });
});

describe('PictureCard: dragging the height handle', () => {
  it('the picture grows by the same share as its height on the screen (200 px high here)', () => {
    const { onChange } = setup({ ...BLOCK, height: 100 });
    pointer('pointerdown', handle('height'), 300, 200);
    pointer('pointermove', window, 300, 300); // 100 px down = +50 percent
    expect(heightBox()).toHaveValue('150');
    pointer('pointerup', window, 300, 300);
    expect(patches(onChange)).toEqual([{ height: 150 }]);
  });

  it('a picture without a height starts from 100 percent and can get shorter', () => {
    const { onChange } = setup();
    pointer('pointerdown', handle('height'), 300, 200);
    pointer('pointermove', window, 300, 100);
    pointer('pointerup', window, 300, 100);
    expect(patches(onChange)).toEqual([{ height: 50 }]);
  });

  it('never goes outside the allowed range', () => {
    const { onChange } = setup({ ...BLOCK, height: 100 });
    pointer('pointerdown', handle('height'), 300, 200);
    pointer('pointermove', window, 300, 99999);
    pointer('pointerup', window, 300, 99999);
    pointer('pointerdown', handle('height'), 300, 200);
    pointer('pointermove', window, 300, -99999);
    pointer('pointerup', window, 300, -99999);
    expect(patches(onChange)).toEqual([{ height: 300 }, { height: 10 }]);
  });

  it('stretches the picture on the screen once its natural size is known', () => {
    setup({ ...BLOCK, height: 150 });
    const img = card().querySelector('img') as HTMLImageElement;
    expect(img).not.toHaveClass('np-picture__thumb--stretched'); // not loaded yet
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);
    expect(img).toHaveClass('np-picture__thumb--stretched');
    expect(img.style.getPropertyValue('--np-pic-aspect')).toBe('400 / 300');
  });

  it('a picture without a height keeps its own proportions', () => {
    setup();
    const img = card().querySelector('img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 200, configurable: true });
    fireEvent.load(img);
    expect(img).not.toHaveClass('np-picture__thumb--stretched');
  });
});

describe('PictureCard: sliding the picture', () => {
  it('the left, middle and right third of the column give Left, Centre and Right', () => {
    const { onChange } = setup({ ...BLOCK, width: 50 });
    pointer('pointerdown', frame(), 300);
    pointer('pointermove', window, 150);
    expect(frame()).toHaveClass('np-picture__frame--left');
    pointer('pointerup', window, 150);
    pointer('pointerdown', frame(), 300);
    pointer('pointermove', window, 480);
    expect(frame()).toHaveClass('np-picture__frame--right');
    pointer('pointerup', window, 480);
    expect(patches(onChange)).toEqual([{ align: 'left' }, { align: 'right' }]);
  });

  it('sliding back to the middle removes the position (Centre has no field)', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', frame(), 150);
    pointer('pointermove', window, 300);
    pointer('pointerup', window, 300);
    expect(patches(onChange)).toEqual([{ align: null }]);
  });

  it('shows the position on the buttons while sliding', () => {
    setup({ ...BLOCK, width: 50 });
    pointer('pointerdown', frame(), 300);
    pointer('pointermove', window, 480);
    expect(screen.getByRole('button', { name: t('admin.picture.alignRight') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: t('admin.picture.alignCenter') })).toHaveAttribute('aria-pressed', 'false');
    pointer('pointerup', window, 480);
  });

  it('a press without movement, or ending in the same third, changes nothing', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', frame(), 150);
    pointer('pointerup', window, 150);
    pointer('pointerdown', frame(), 150);
    pointer('pointermove', window, 180);
    pointer('pointerup', window, 180);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PictureCard: drags that are not reported', () => {
  it('a press on a handle without movement changes nothing', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointerup', window, 300);
    pointer('pointerdown', handle('height'), 300, 200);
    pointer('pointerup', window, 300, 200);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moving away and back to the start changes nothing', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 380);
    pointer('pointermove', window, 300);
    pointer('pointerup', window, 300);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a cancelled drag (the browser took the pointer) reports nothing and the picture jumps back', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 400);
    expect(frame().style.width).toBe('75%');
    pointer('pointercancel', window, 400);
    expect(frame().style.width).toBe('50%');
    expect(frame()).not.toHaveAttribute('data-np-dragging');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('after the release the pointer no longer moves the picture', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    pointer('pointermove', window, 400);
    pointer('pointerup', window, 400);
    pointer('pointermove', window, 500);
    expect(frame().style.width).toBe('50%'); // the card is controlled: the parent decides the new number
    pointer('pointerup', window, 500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('only the main button starts a drag', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300, 0, 2);
    expect(frame()).not.toHaveAttribute('data-np-dragging');
    pointer('pointermove', window, 400);
    pointer('pointerup', window, 400);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a disabled card has no handles and cannot be slid', () => {
    const { onChange } = setup({ ...BLOCK, width: 50, align: 'left' }, { disabled: true });
    expect(card().querySelector('[data-np-handle]')).toBeNull();
    expect(screen.queryByText(t('admin.picture.dragHint'))).toBeNull();
    pointer('pointerdown', frame(), 150);
    pointer('pointermove', window, 480);
    pointer('pointerup', window, 480);
    expect(frame()).not.toHaveAttribute('data-np-dragging');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaving the screen in the middle of a drag removes the listeners without an error', () => {
    const { unmount } = setup({ ...BLOCK, width: 50, align: 'left' });
    pointer('pointerdown', handle('width'), 300);
    unmount();
    expect(() => pointer('pointermove', window, 400)).not.toThrow();
    expect(() => pointer('pointerup', window, 400)).not.toThrow();
  });
});

describe('PictureCard: the buttons and number boxes still work', () => {
  it('the number boxes show the numbers of the picture when nothing is dragged', () => {
    setup({ ...BLOCK, width: 40, height: 120 });
    expect(widthBox()).toHaveValue('40');
    expect(heightBox()).toHaveValue('120');
  });
});
