import type { Block } from '../../core/content/types';
import { contentUrl } from '../../core/content/loader';
import { t, tf } from '../../core/i18n';
import { splitParagraphs } from './readerMath';
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
      return block.text?.trim() ? <h2 className="np-block-title">{block.text}</h2> : null;
    case 'subtitle':
      return block.text?.trim() ? <h3 className="np-block-subtitle">{block.text}</h3> : null;
    case 'text': {
      const paragraphs = splitParagraphs(block.text);
      if (paragraphs.length === 0) return null;
      return (
        <div className="np-block-text">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      );
    }
    case 'image': {
      if (!block.src) return null;
      const alt = block.alt ?? '';
      const src = contentUrl(`courses/${courseId}/${block.src}`);
      const img = <img className="np-block-img" src={src} alt={alt} loading="lazy" />;
      return (
        <figure className="np-block-figure">
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

/** Shows blocks in the developer's order, as plain text only (never HTML). Missing parts are skipped. */
export function BlockView({ blocks, courseId, onOpenImage }: BlockViewProps) {
  return (
    <div className="np-blocks" data-np-check>
      {blocks.map((block) => (
        <BlockItem key={block.id} block={block} courseId={courseId} onOpenImage={onOpenImage} />
      ))}
    </div>
  );
}
