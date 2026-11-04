import { el } from './dom';

type Kind = 'info' | 'success' | 'warning' | 'error';

/** The single status line under the previews. */
export class Status {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly element: HTMLElement) {}

  /** Shows a spinner, `message` and the time elapsed since `startedAt`. */
  busy(message: string, startedAt: number): void {
    this.stopTimer();
    const elapsed = el('span', { className: 'elapsed' });
    const tick = () => {
      elapsed.textContent = `${((performance.now() - startedAt) / 1000).toFixed(0)} s`;
    };
    tick();
    this.timer = setInterval(tick, 500);
    this.element.dataset.kind = 'busy';
    this.element.replaceChildren(
      el('span', { className: 'spinner' }),
      el('span', { className: 'status-message' }, sentence(message)),
      elapsed,
    );
  }

  show(kind: Kind, message: string, details?: string): void {
    this.stopTimer();
    this.element.dataset.kind = kind;
    this.element.replaceChildren(el('span', { className: 'status-message' }, message));
    if (details) {
      this.element.append(
        el('details', {}, el('summary', {}, 'Technical details'), el('pre', {}, details)),
      );
    }
  }

  private stopTimer(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Formats raw progress output such as "finding edges..." for display. */
function sentence(message: string): string {
  const trimmed = message.trim().replace(/\.\.\.$/, '…');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
