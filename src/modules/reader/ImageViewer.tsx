import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { t } from '../../core/i18n';
import { IconButton } from '../../core/ui';
import type { OpenedImage } from './BlockView';
import './ImageViewer.css';

interface ImageViewerProps {
  image: OpenedImage;
  onClose: () => void;
}

/**
 * Full-screen image viewer (not bound to the reading area): pinch zoom, pan, double-tap, + / - / reset,
 * Close and Esc. Render it only while an image is open. Focus moves to Close and returns to the
 * element that was focused before (the image button). `react-zoom-pan-pinch` is used only here (DECISIONS Q17).
 */
export function ImageViewer({ image, onClose }: ImageViewerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // On open: remember the focused element, lock page scrolling, focus Close. On close: undo all three.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('[data-np-close]')?.focus();
    return () => {
      document.body.style.overflow = bodyOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // Esc closes; Tab and Shift+Tab stay inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const buttons = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!dialog || !first || !last) return;
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      className="np-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || t('reader.viewer.label')}
    >
      <TransformWrapper initialScale={1} minScale={1} maxScale={8} centerOnInit doubleClick={{ mode: 'toggle' }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="np-viewer-bar">
              <IconButton
                data-np-close="true"
                label={t('reader.viewer.close')}
                icon={<X size={22} aria-hidden="true" />}
                onClick={onClose}
              />
              <div className="np-viewer-zoom">
                <IconButton
                  label={t('reader.viewer.zoomOut')}
                  icon={<ZoomOut size={22} aria-hidden="true" />}
                  onClick={() => void zoomOut()}
                />
                <IconButton
                  label={t('reader.viewer.reset')}
                  icon={<RotateCcw size={22} aria-hidden="true" />}
                  onClick={() => void resetTransform()}
                />
                <IconButton
                  label={t('reader.viewer.zoomIn')}
                  icon={<ZoomIn size={22} aria-hidden="true" />}
                  onClick={() => void zoomIn()}
                />
              </div>
            </div>
            <TransformComponent wrapperClass="np-viewer-stage" contentClass="np-viewer-content">
              <img className="np-viewer-img" src={image.src} alt={image.alt} draggable={false} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
