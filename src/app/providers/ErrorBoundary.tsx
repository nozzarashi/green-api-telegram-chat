import { Component } from 'react';
import type { ReactNode } from 'react';
import { Button, EmptyState } from '@/shared/ui';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <EmptyState
          title="Не удалось открыть чат"
          description="Перезагрузите страницу и подключитесь снова."
        >
          <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
        </EmptyState>
      </main>
    ) : (
      this.props.children
    );
  }
}
