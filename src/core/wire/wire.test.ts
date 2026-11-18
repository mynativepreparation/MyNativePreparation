import { describe, expect, it, vi } from 'vitest';
import { Wire } from './wire';

describe('Wire', () => {
  it('delivers the payload to a handler', () => {
    const wire = new Wire();
    const handler = vi.fn();
    wire.on('ui.toast', handler);
    wire.emit('ui.toast', { message: 'hi' });
    expect(handler).toHaveBeenCalledWith({ message: 'hi' });
  });

  it('stops delivering after unsubscribe', () => {
    const wire = new Wire();
    const handler = vi.fn();
    const off = wire.on('ui.toast', handler);
    off();
    wire.emit('ui.toast', { message: 'hi' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps going when one handler throws', () => {
    const wire = new Wire();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    wire.on('ui.toast', () => {
      throw new Error('boom');
    });
    wire.on('ui.toast', second);
    wire.emit('ui.toast', { message: 'hi' });
    expect(second).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
