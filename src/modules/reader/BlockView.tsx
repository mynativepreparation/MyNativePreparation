import { useState, type CSSProperties, type SyntheticEvent } from 'react';
import type { Block } from '../../core/content/types';
import { contentUrl } from '../../core/content/loader';
import { t, tf } from '../../core/i18n';
import { splitParagraphs } from './readerMath';
import { RichInline, RichParagraph } from './RichText';
import './BlockView.css';

export interface OpenedImage {
  /** Full URL of the image file. */
  src: string;
  alt: string;
}

interface BlockViewProps {
  blocks: Block[];
  courseId: string;
  /** Called when the reader taps an image. Without it the image is shown but not tappable. */
  onOpenImage?: (image: OpenedImage) => void;
}

/** Adds the font class of a block (`np-font-sans`, `np-font-serif`, `np-font-humanist`); a block without `font` keeps the app font. */
function withFont(base: string, font: Block['font']): string {
  return font ? `${base} np-font-${font}` : base;
}

/** `left` and `right` float (the next text flows beside the picture); anything else is centred, as before. */
function figureClass(align: Block['align']): string {
  return align === 'left' || align === 'right'
    ? `np-block-figure np-block-figure--${align}`
    : 'np-block-figure np-block-figure--center';
}

/**
 * The picture. `fill`: the developer gave a width, so the picture fills its figure (the figure has that share of the column).
 * `height` is a percent of the natural height at that width: once the picture is loaded its natural size is known, and the
 * stretched look is set through the custom property `--np-img-aspect` (see BlockView.css).
 */
function BlockImage({ src, alt, fill, height }: { src: string; alt: string; fill: boolean; height: number | undefined }) {
  const [aspect, setAspect] = useState<string | null>(null);

  const className = ['np-block-img', fill ? 'np-block-img--fill' : '', aspect === null ? '' : 'np-block-img--stretched']
    .filter((name) => name !== '')
    .join(' ');

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (height === undefined) return;
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setAspect(`${naturalWidth} / ${Number(((naturalHeight * height) / 100).toFixed(2))}`);
    }
  };

  const style = aspect === null ? null : ({ '--np-img-aspect': aspect } as CSSProperties);
  return (
    <img className={className} src={src} alt={alt} loading="lazy" onLoad={handleLoad} {...(style === null ? {} : { style })} />
  );
}

function BlockItem({
  block,
  courseId,
  onOpenImage,
}: {
  block: Block;
  courseId: string;
  onOpenImage?: (image: OpenedImage) => void;
}) {
  switch (block.type) {
    case 'title':
      return block.text?.trim() ? (
        <h2 className={withFont('np-block-title', block.font)}>
          <RichInline text={block.text} />
        </h2>
      ) : null;
    case 'subtitle':
      return block.text?.trim() ? (
        <h3 className={withFont('np-block-subtitle', block.font)}>
          <RichInline text={block.text} />
        </h3>
      ) : null;
    case 'text': {
      const paragraphs = splitParagraphs(block.text);
      if (paragraphs.length === 0) return null;
      return (
        <div className={withFont('np-block-text', block.font)}>
          {paragraphs.map((paragraph, index) => (
            <RichParagraph key={index} text={paragraph} />
          ))}
        </div>
      );
    }
    case 'image': {
      if (!block.src) return null;
      const alt = block.alt ?? '';
      const src = contentUrl(`courses/${courseId}/${block.src}`);
      const img = <BlockImage src={src} alt={alt} fill={block.width !== undefined} height={block.height} />;
      const style: CSSProperties | null = block.width === undefined ? null : { width: `${block.width}%` };
      return (
        <figure className={figureClass(block.align)} {...(style === null ? {} : { style })}>
          {onOpenImage ? (
            <button
              type="button"
              className="np-block-img-button"
              aria-label={alt ? tf('reader.image.openNamed', { alt }) : t('reader.image.open')}
              onClick={(event) => {
                event.currentTarget.focus(); // Safari does not focus a tapped button; the viewer returns focus here
                onOpenImage({ src, alt });
              }}
            >
              {img}
            </button>
          ) : (
            img
          )}
        </figure>
      );
    }
    default:
      return null;
  }
}

/**
 * Shows blocks in the developer's order. Titles, subtitles and text blocks may use the inline marks and spans (bold, italic, underline,
 * highlight, colour, size, boxes; text blocks also bullets and paragraph boxes); pictures can sit left, centre or right with a chosen
 * width and height. Nothing is ever HTML. Missing parts are skipped.
 */
export function BlockView({ blocks, courseId, onOpenImage }: BlockViewProps) {
  return (
    <div className="np-blocks" data-np-check>
      {blocks.map((block) => (
        <BlockItem key={block.id} block={block} courseId={courseId} onOpenImage={onOpenImage} />
      ))}
    </div>
  );
}
