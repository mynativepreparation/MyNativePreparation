import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WebpEncoder } from '../../core/admin/image';
import type { DraftImage } from '../../core/admin/model';
import { t, tf } from '../../core/i18n';
import { CoverField } from './CoverField';

// The cover field is controlled: a small parent keeps `{cover, images}` and reports every change.

const noEncoder: WebpEncoder = () => Promise.resolve(null);
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(seed = 0): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set(PNG_HEAD);
  bytes[12] = seed;
  return bytes;
}

interface State {
  cover: string | undefined;
  images: DraftImage[];
}

function Harness({ initial, onState }: { initial: State; onState: (s: State) => void }) {
  const [state, setState] = useState(initial);
  return (
    <CoverField
      cover={state.cover}
      images={state.images}
      encodeWebp={noEncoder}
      onChange={(cover, images) => {
        const next = { cover, images };
        onState(next);
        setState(next);
      }}
    />
  );
}

function setup(initial: State = { cover: undefined, images: [] }) {
  const seen = { latest: initial, calls: 0 };
  render(
    <Harness
      initial={initial}
      onState={(s) => {
        seen.latest = s;
        seen.calls += 1;
      }}
    />,
  );
  return seen;
}

function chooseFile(bytes: Uint8Array, fileName: string) {
  const file = new File([bytes.slice()], fileName);
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(bytes.slice().buffer) });
  fireEvent.change(screen.getByLabelText(t('admin.cover.fileLabel')), { target: { files: [file] } });
}

describe('CoverField', () => {
  it('starts with no cover and a Choose button', () => {
    setup();
    expect(screen.getByText(t('admin.cover.none'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.cover.choose') })).toBeEnabled();
    expect(screen.queryByRole('button', { name: t('admin.cover.remove') })).toBeNull();
  });

  it('takes a chosen picture as the cover', async () => {
    const seen = setup();
    chooseFile(pngBytes(), 'cover.png');
    await waitFor(() => expect(seen.calls).toBe(1));
    expect(seen.latest.images).toHaveLength(1);
    expect(seen.latest.images.map((i) => i.mime)).toEqual(['image/png']);
    expect([seen.latest.cover]).toEqual(seen.latest.images.map((i) => i.path));
    expect(await screen.findByRole('button', { name: t('admin.cover.replace') })).toBeInTheDocument();
  });

  it('refuses a file that is not a picture and keeps the old cover', async () => {
    const old: DraftImage = { path: 'images/1.png', mime: 'image/png', bytes: pngBytes(1) };
    const seen = setup({ cover: old.path, images: [old] });
    chooseFile(new TextEncoder().encode('%PDF-1.7'), 'a.pdf');
    expect(await screen.findByText(t('admin.blocks.err.unsupported'))).toBeInTheDocument();
    expect(seen.calls).toBe(0);
    expect(seen.latest.cover).toBe('images/1.png');
  });

  it('replaces the cover with a new path and keeps the old picture in the list', async () => {
    const old: DraftImage = { path: 'images/1.png', mime: 'image/png', bytes: pngBytes(1) };
    const seen = setup({ cover: old.path, images: [old] });
    chooseFile(pngBytes(2), 'new.png');
    await waitFor(() => expect(seen.calls).toBe(1));
    expect(seen.latest.images.map((i) => i.path)).toContain('images/1.png');
    expect(seen.latest.images).toHaveLength(2);
    expect(seen.latest.cover).not.toBe('images/1.png');
  });

  it('removes the cover but keeps the pictures (they are pruned on Save)', () => {
    const old: DraftImage = { path: 'images/1.png', mime: 'image/png', bytes: pngBytes(1) };
    const seen = setup({ cover: old.path, images: [old] });
    fireEvent.click(screen.getByRole('button', { name: t('admin.cover.remove') }));
    expect(seen.latest.cover).toBeUndefined();
    expect(seen.latest.images).toHaveLength(1);
    expect(screen.getByText(t('admin.cover.none'))).toBeInTheDocument();
  });

  it('says so when the cover path has no picture in the draft', () => {
    setup({ cover: 'images/9.png', images: [] });
    expect(screen.getByText(tf('admin.cover.missing', { path: 'images/9.png' }))).toBeInTheDocument();
  });
});
