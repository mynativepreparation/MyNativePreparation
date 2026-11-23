import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PicturePatch } from '../../core/admin/chapterSlots';
import type { DraftImage } from '../../core/admin/model';
import type { Block } from '../../core/content/types';
import { t } from '../../core/i18n';
import { PictureCard, type PictureCardProps } from './PictureCard';

// The card of one picture (P10 T11o O2): thumbnail, position, width and height, description, Remove. The card is controlled and only
// REPORTS patches; core/admin/chapterSlots.ts (updatePicture) clamps the numbers.

const IMAGE: DraftImage = { path: 'images/a.png', mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) };
const BLOCK: Block = { id: 'blk-a1', type: 'image', src: 'images/a.png', alt: '' };

function setup(block: Block = BLOCK, extra: Partial<PictureCardProps> = {}) {
  const onChange = vi.fn<(patch: PicturePatch) => void>();
  const onRemove = vi.fn<() => void>();
  render(<PictureCard block={block} image={IMAGE} onChange={onChange} onRemove={onRemove} {...extra} />);
  return { onChange, onRemove };
}

const card = () => screen.getByRole('region', { name: t('admin.picture.cardLabel') });
const button = (name: string) => screen.getByRole('button', { name });
const widthBox = () => screen.getByLabelText(t('admin.picture.widthLabel'));
const heightBox = () => screen.getByLabelText(t('admin.picture.heightLabel'));
const altBox = () => screen.getByLabelText(t('admin.picture.altLabel'));
const patches = (fn: { mock: { calls: Array<[PicturePatch]> } }): PicturePatch[] => fn.mock.calls.map(([patch]) => patch);

describe('PictureCard: what it shows', () => {
  it('shows the thumbnail of the picture', () => {
    setup();
    const img = card().querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('says so when the file of the picture is not in the draft', () => {
    setup(BLOCK, { image: undefined });
    expect(card().querySelector('img')).toBeNull();
    expect(screen.getByText(t('admin.picture.missing'))).toBeInTheDocument();
  });

  it('shows the numbers and the description of the picture, and Centre when there is no position', () => {
    setup({ ...BLOCK, width: 40, height: 120, alt: 'A cat' });
    expect(widthBox()).toHaveValue('40');
    expect(heightBox()).toHaveValue('120');
    expect(altBox()).toHaveValue('A cat');
    expect(button(t('admin.picture.alignCenter'))).toHaveAttribute('aria-pressed', 'true');
    expect(button(t('admin.picture.alignLeft'))).toHaveAttribute('aria-pressed', 'false');
    expect(button(t('admin.picture.alignRight'))).toHaveAttribute('aria-pressed', 'false');
  });

  it('empty number boxes mean natural size', () => {
    setup();
    expect(widthBox()).toHaveValue('');
    expect(heightBox()).toHaveValue('');
    expect(widthBox()).toHaveAttribute('placeholder', t('admin.picture.autoPlaceholder'));
  });

  it('marks the position that the picture has', () => {
    setup({ ...BLOCK, align: 'right' });
    expect(button(t('admin.picture.alignRight'))).toHaveAttribute('aria-pressed', 'true');
    expect(button(t('admin.picture.alignCenter'))).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PictureCard: position, description, remove', () => {
  it('Left and Right report the position, Centre removes it', () => {
    const { onChange } = setup({ ...BLOCK, align: 'left' });
    fireEvent.click(button(t('admin.picture.alignRight')));
    fireEvent.click(button(t('admin.picture.alignLeft')));
    fireEvent.click(button(t('admin.picture.alignCenter')));
    expect(patches(onChange)).toEqual([{ align: 'right' }, { align: 'left' }, { align: null }]);
  });

  it('typing a description reports it', () => {
    const { onChange } = setup();
    fireEvent.change(altBox(), { target: { value: 'A cat' } });
    expect(patches(onChange)).toEqual([{ alt: 'A cat' }]);
  });

  it('Remove reports the removal', () => {
    const { onRemove, onChange } = setup();
    fireEvent.click(button(t('admin.picture.remove')));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PictureCard: width and height', () => {
  it('Wider and Narrower change the width by 10', () => {
    const { onChange } = setup({ ...BLOCK, width: 40 });
    fireEvent.click(button(t('admin.picture.wider')));
    fireEvent.click(button(t('admin.picture.narrower')));
    expect(patches(onChange)).toEqual([{ width: 50 }, { width: 30 }]);
  });

  it('Taller and Shorter change the height by 10', () => {
    const { onChange } = setup({ ...BLOCK, height: 100 });
    fireEvent.click(button(t('admin.picture.taller')));
    fireEvent.click(button(t('admin.picture.shorter')));
    expect(patches(onChange)).toEqual([{ height: 110 }, { height: 90 }]);
  });

  it('with no number yet the buttons start from 100', () => {
    const { onChange } = setup();
    fireEvent.click(button(t('admin.picture.narrower')));
    expect(patches(onChange)).toEqual([{ width: 90 }]);
  });

  it('Narrower is off at the smallest width and Wider at the biggest', () => {
    const { rerender } = render(<PictureCard block={{ ...BLOCK, width: 10 }} image={IMAGE} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(button(t('admin.picture.narrower'))).toBeDisabled();
    expect(button(t('admin.picture.wider'))).toBeEnabled();
    rerender(<PictureCard block={{ ...BLOCK, width: 100 }} image={IMAGE} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(button(t('admin.picture.wider'))).toBeDisabled();
    expect(button(t('admin.picture.narrower'))).toBeEnabled();
  });

  it('a typed number is applied when the box loses the focus, not on every key', () => {
    const { onChange } = setup();
    fireEvent.change(widthBox(), { target: { value: '5' } });
    fireEvent.change(widthBox(), { target: { value: '55' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(widthBox());
    expect(patches(onChange)).toEqual([{ width: 55 }]);
  });

  it('Enter applies a typed number too', () => {
    const { onChange } = setup();
    fireEvent.change(heightBox(), { target: { value: '120' } });
    fireEvent.keyDown(heightBox(), { key: 'Enter' });
    expect(patches(onChange)).toEqual([{ height: 120 }]);
  });

  it('an emptied box means natural size again', () => {
    const { onChange } = setup({ ...BLOCK, width: 40 });
    fireEvent.change(widthBox(), { target: { value: '' } });
    fireEvent.blur(widthBox());
    expect(patches(onChange)).toEqual([{ width: null }]);
  });

  it('text that is not a number changes nothing', () => {
    const { onChange } = setup({ ...BLOCK, width: 40 });
    fireEvent.change(widthBox(), { target: { value: 'wide' } });
    fireEvent.blur(widthBox());
    expect(onChange).not.toHaveBeenCalled();
    expect(widthBox()).toHaveValue('40');
  });

  it('leaving a box that was not typed in reports nothing', () => {
    const { onChange } = setup({ ...BLOCK, width: 40 });
    fireEvent.blur(widthBox());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PictureCard: disabled', () => {
  it('turns every control off', () => {
    setup({ ...BLOCK, width: 40 }, { disabled: true });
    for (const name of [
      t('admin.picture.alignLeft'),
      t('admin.picture.alignCenter'),
      t('admin.picture.alignRight'),
      t('admin.picture.narrower'),
      t('admin.picture.wider'),
      t('admin.picture.shorter'),
      t('admin.picture.taller'),
      t('admin.picture.remove'),
    ]) {
      expect(button(name)).toBeDisabled();
    }
    expect(widthBox()).toBeDisabled();
    expect(heightBox()).toBeDisabled();
    expect(altBox()).toBeDisabled();
  });
});
