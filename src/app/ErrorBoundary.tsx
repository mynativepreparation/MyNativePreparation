import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../core/i18n';

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

// One crashing screen must never blank the whole app.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <p role="alert">{t('error.generic')}</p>;
    return this.props.children;
  }
}
