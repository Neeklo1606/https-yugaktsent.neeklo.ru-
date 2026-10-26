import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  children: ReactNode;
  scope: string;
  diagnosticId?: string;
  fallbackTitle?: string;
  fallbackMessage?: string;
};

type State = { error: Error | null; diagnosticId: string };

let boundaryCounter = 0;

function nextDiagnosticId(scope: string): string {
  boundaryCounter += 1;
  return `rb-${scope.replace(/\W+/g, '-').slice(0, 24)}-${boundaryCounter}`;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null, diagnosticId: this.props.diagnosticId ?? nextDiagnosticId(this.props.scope) };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error(`[RouteErrorBoundary:${this.state.diagnosticId}]`, error, info.componentStack);
    }
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const title = this.props.fallbackTitle ?? 'Раздел временно недоступен';
      const message =
        this.props.fallbackMessage ??
        'Произошла ошибка при загрузке страницы. Остальные разделы сайта работают.';

      return (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-warning mb-3" aria-hidden />
          <h2 className="text-lg font-semibold mb-1">{title}</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-2">{message}</p>
          <p className="text-[10px] text-muted-foreground font-mono mb-4">
            ID: {this.state.diagnosticId}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={this.retry}>
              Повторить
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => window.location.assign('/')}>
              На главную
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
