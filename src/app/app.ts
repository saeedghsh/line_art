import { defaultParameters } from '../algorithms/parameters';
import { runAlgorithm } from '../algorithms/run';
import {
  AlgorithmError,
  type Algorithm,
  type AlgorithmResult,
  type ParameterValue,
} from '../algorithms/types';
import { byId, el } from './dom';
import { downloadBlob, svgBlob, svgToPng } from './export';
import { createSampleImage, loadImageFile, type LoadedImage } from './image-input';
import { renderParameterForm } from './parameter-form';
import { Status } from './status';

/** Debounce for algorithms that redraw while a slider moves. */
const LIVE_UPDATE_DELAY_MS = 120;
const PNG_SCALE = 2;
const neverAborted = new AbortController().signal;

interface Drawing {
  readonly svg: string;
  readonly url: string;
  readonly algorithm: Algorithm;
  readonly imageName: string;
}

/** Wires the static page in index.html to the given algorithms. */
export class App {
  private readonly ui = {
    fileInput: byId('file-input', HTMLInputElement),
    dropzone: byId('dropzone', HTMLLabelElement),
    imageInfo: byId('image-info', HTMLSpanElement),
    sampleButton: byId('sample-button', HTMLButtonElement),
    algorithmSelect: byId('algorithm-select', HTMLSelectElement),
    algorithmDescription: byId('algorithm-description', HTMLParagraphElement),
    algorithmCredit: byId('algorithm-credit', HTMLParagraphElement),
    runtimeNote: byId('runtime-note', HTMLParagraphElement),
    parameterForm: byId('parameter-form', HTMLFormElement),
    resetButton: byId('reset-button', HTMLButtonElement),
    generateButton: byId('generate-button', HTMLButtonElement),
    originalImage: byId('original-image', HTMLImageElement),
    originalPlaceholder: byId('original-placeholder', HTMLParagraphElement),
    resultFigure: byId('result-figure', HTMLElement),
    resultImage: byId('result-image', HTMLImageElement),
    resultPlaceholder: byId('result-placeholder', HTMLParagraphElement),
    resultStats: byId('result-stats', HTMLSpanElement),
    downloadSvg: byId('download-svg', HTMLButtonElement),
    downloadPng: byId('download-png', HTMLButtonElement),
    credits: byId('credits', HTMLDivElement),
  };
  private readonly status = new Status(byId('status', HTMLDivElement));
  /** Parameter values per algorithm id, kept when switching algorithms. */
  private readonly values: Map<string, Record<string, ParameterValue>>;
  private algorithm: Algorithm;
  private image: LoadedImage | undefined;
  private drawing: Drawing | undefined;
  private running: AbortController | undefined;
  private runId = 0;
  private liveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly algorithms: readonly [Algorithm, ...Algorithm[]]) {
    this.algorithm = algorithms[0];
    this.values = new Map(
      algorithms.map((algorithm) => [algorithm.id, { ...defaultParameters(algorithm.parameters) }]),
    );
    this.renderCredits();
    this.bindEvents();
    this.ui.algorithmSelect.replaceChildren(
      ...algorithms.map((algorithm) => el('option', { value: algorithm.id }, algorithm.name)),
    );
    this.selectAlgorithm(this.algorithm.id);
  }

  private bindEvents(): void {
    const { ui } = this;
    ui.fileInput.addEventListener('change', () => {
      const file = ui.fileInput.files?.[0];
      if (file) void this.loadImage(() => loadImageFile(file, file.name));
      ui.fileInput.value = '';
    });
    ui.sampleButton.addEventListener('click', () => {
      void this.loadImage(createSampleImage);
    });

    // Accept drops anywhere, so a near miss does not open the file instead.
    document.addEventListener('dragover', (event) => {
      event.preventDefault();
      ui.dropzone.classList.add('dragging');
    });
    document.addEventListener('dragleave', (event) => {
      if (!event.relatedTarget) ui.dropzone.classList.remove('dragging');
    });
    document.addEventListener('drop', (event) => {
      event.preventDefault();
      ui.dropzone.classList.remove('dragging');
      const file = event.dataTransfer?.files[0];
      if (file) void this.loadImage(() => loadImageFile(file, file.name));
    });

    ui.algorithmSelect.addEventListener('change', () => {
      this.selectAlgorithm(ui.algorithmSelect.value);
    });
    ui.resetButton.addEventListener('click', () => {
      this.values.set(this.algorithm.id, { ...defaultParameters(this.algorithm.parameters) });
      this.renderParameters();
      this.parametersChanged();
    });
    ui.generateButton.addEventListener('click', () => {
      if (this.running) this.running.abort();
      else void this.generate();
    });
    ui.downloadSvg.addEventListener('click', () => {
      if (this.drawing) downloadBlob(svgBlob(this.drawing.svg), this.fileName('svg'));
    });
    ui.downloadPng.addEventListener('click', () => {
      const { drawing } = this;
      if (!drawing) return;
      svgToPng(drawing.svg, PNG_SCALE).then(
        (png) => {
          downloadBlob(png, this.fileName('png'));
        },
        (error: unknown) => {
          this.status.show('error', `PNG export failed: ${errorMessage(error)}`);
        },
      );
    });
  }

  private async loadImage(load: () => Promise<LoadedImage>): Promise<void> {
    this.status.busy('Reading image…', performance.now());
    let image: LoadedImage;
    try {
      image = await load();
    } catch (error) {
      this.status.show('error', errorMessage(error));
      return;
    }
    if (this.image) URL.revokeObjectURL(this.image.url);
    this.image = image;

    const { originalWidth: w, originalHeight: h, raster } = image;
    const scaled = raster.width !== w ? ` (processed at ${raster.width}×${raster.height})` : '';
    this.ui.imageInfo.textContent = `${image.name} · ${w}×${h}${scaled}`;
    this.ui.originalImage.src = image.url;
    this.ui.originalImage.hidden = false;
    this.ui.originalPlaceholder.hidden = true;
    this.ui.generateButton.disabled = false;
    this.clearDrawing();

    if (this.algorithm.liveUpdate) void this.generate();
    else this.status.show('info', `Ready. Press Generate to draw with ${this.algorithm.name}.`);
  }

  private selectAlgorithm(id: string): void {
    const algorithm = this.algorithms.find((candidate) => candidate.id === id) ?? this.algorithm;
    this.running?.abort();
    this.algorithm = algorithm;
    this.ui.algorithmSelect.value = algorithm.id;
    this.ui.algorithmDescription.textContent = algorithm.description;
    this.ui.algorithmCredit.replaceChildren(...creditLine(algorithm));
    this.ui.runtimeNote.textContent = algorithm.runtime.note ?? '';
    this.ui.runtimeNote.hidden = !algorithm.runtime.note;
    this.renderParameters();
    this.clearDrawing();

    if (this.image && algorithm.liveUpdate) void this.generate();
    else if (this.image) this.status.show('info', `Press Generate to draw with ${algorithm.name}.`);
    else this.status.show('info', 'Choose an image, or use the sample image, to begin.');
    this.prepare(algorithm);
  }

  /** Starts loading the algorithm's runtime in the background, if it has one. */
  private prepare(algorithm: Algorithm): void {
    if (!algorithm.prepare) return;
    const relevant = () => this.algorithm === algorithm && !this.running;
    const startedAt = performance.now();
    algorithm
      .prepare(this.currentValues(), {
        onProgress: (message) => {
          if (relevant()) this.status.busy(message, startedAt);
        },
        signal: neverAborted,
      })
      .then(
        () => {
          if (!relevant()) return;
          const next = this.image ? 'Press Generate to draw.' : 'Choose an image to begin.';
          this.status.show('info', `${algorithm.name} is ready. ${next}`);
        },
        (error: unknown) => {
          // A cancelled run also aborts preparation; the next run retries.
          if (relevant() && !isAbort(error)) {
            this.status.show(
              'warning',
              `Could not prepare ${algorithm.name}: ${errorMessage(error)}`,
            );
          }
        },
      );
  }

  private renderParameters(): void {
    renderParameterForm(
      this.ui.parameterForm,
      this.algorithm.parameters,
      this.currentValues(),
      (id, value) => {
        this.currentValues()[id] = value;
        this.parametersChanged();
      },
    );
  }

  private parametersChanged(): void {
    if (!this.image) return;
    if (this.algorithm.liveUpdate) {
      clearTimeout(this.liveTimer);
      this.liveTimer = setTimeout(() => void this.generate(), LIVE_UPDATE_DELAY_MS);
    } else if (this.drawing && !this.running) {
      this.status.show('info', 'Parameters changed. Press Generate to update the drawing.');
    }
  }

  private async generate(): Promise<void> {
    const { image, algorithm } = this;
    if (!image) return;
    this.running?.abort();
    const controller = new AbortController();
    const runId = ++this.runId;
    const isCurrent = () => runId === this.runId;
    this.setRunning(controller);

    const startedAt = performance.now();
    this.status.busy('Starting…', startedAt);
    try {
      const result = await runAlgorithm(algorithm, image.raster, this.currentValues(), {
        onProgress: (message) => {
          if (isCurrent()) this.status.busy(message, startedAt);
        },
        signal: controller.signal,
      });
      if (!isCurrent()) return;
      this.showDrawing(result, algorithm, image);
      this.reportSuccess(result, performance.now() - startedAt);
    } catch (error) {
      if (!isCurrent()) return;
      if (controller.signal.aborted) {
        this.status.show('info', 'Cancelled.');
      } else if (error instanceof AlgorithmError) {
        this.status.show('error', error.message, error.details);
      } else {
        console.error(error);
        this.status.show('error', `Unexpected error: ${errorMessage(error)}`);
      }
    } finally {
      if (isCurrent()) this.setRunning(undefined);
    }
  }

  private reportSuccess(result: AlgorithmResult, milliseconds: number): void {
    const time =
      milliseconds < 1000
        ? `${Math.round(milliseconds)} ms`
        : `${(milliseconds / 1000).toFixed(1)} s`;
    if (result.stats?.strokes === 0) {
      this.status.show(
        'warning',
        `No strokes were drawn (${time}). Try other parameters or a less uniform image.`,
      );
    } else {
      this.status.show('success', `Done in ${time}.`);
    }
  }

  private setRunning(controller: AbortController | undefined): void {
    this.running = controller;
    const { generateButton } = this.ui;
    generateButton.textContent = controller ? 'Cancel' : 'Generate';
    generateButton.classList.toggle('cancel', Boolean(controller));
    this.ui.resultFigure.setAttribute('aria-busy', String(Boolean(controller)));
  }

  private showDrawing(result: AlgorithmResult, algorithm: Algorithm, image: LoadedImage): void {
    this.clearDrawing();
    const url = URL.createObjectURL(svgBlob(result.svg));
    this.drawing = { svg: result.svg, url, algorithm, imageName: image.name };
    const { ui } = this;
    ui.resultImage.src = url;
    ui.resultImage.hidden = false;
    ui.resultPlaceholder.hidden = true;
    ui.downloadSvg.disabled = false;
    ui.downloadPng.disabled = false;
    const stats = result.stats;
    ui.resultStats.textContent = stats
      ? `${stats.strokes.toLocaleString()} strokes · ${stats.points.toLocaleString()} points`
      : '';
    // On narrow screens the drawing is below the controls.
    if (!algorithm.liveUpdate && matchMedia('(max-width: 899px)').matches) {
      ui.resultFigure.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private clearDrawing(): void {
    if (this.drawing) URL.revokeObjectURL(this.drawing.url);
    this.drawing = undefined;
    const { ui } = this;
    ui.resultImage.hidden = true;
    ui.resultImage.removeAttribute('src');
    ui.resultPlaceholder.hidden = false;
    ui.resultStats.textContent = '';
    ui.downloadSvg.disabled = true;
    ui.downloadPng.disabled = true;
  }

  private currentValues(): Record<string, ParameterValue> {
    let values = this.values.get(this.algorithm.id);
    if (!values) {
      values = { ...defaultParameters(this.algorithm.parameters) };
      this.values.set(this.algorithm.id, values);
    }
    return values;
  }

  private fileName(extension: string): string {
    const base = (this.drawing?.imageName ?? 'drawing').replace(/\.[^.]*$/, '');
    const safe = base.replace(/[^\w.-]+/g, '_') || 'drawing';
    return `${safe}-${this.drawing?.algorithm.id ?? 'line-art'}.${extension}`;
  }

  private renderCredits(): void {
    this.ui.credits.replaceChildren(
      ...this.algorithms.map((algorithm) =>
        el(
          'section',
          { className: 'credit' },
          el('h3', {}, algorithm.name),
          el(
            'ul',
            {},
            ...algorithm.sources.map((source) =>
              el(
                'li',
                {},
                el('a', { href: source.url }, source.project),
                ` by ${source.authors}, ${source.license} license`,
                ...(source.commit
                  ? [
                      ', commit ',
                      el(
                        'a',
                        { href: `${source.url}/tree/${source.commit}` },
                        el('code', {}, source.commit.slice(0, 7)),
                      ),
                    ]
                  : []),
                source.note ? `. ${source.note}` : '.',
              ),
            ),
          ),
          algorithm.adaptationNotes ? el('p', {}, algorithm.adaptationNotes) : '',
          el('p', { className: 'runtime' }, `Runs in: ${algorithm.runtime.label}.`),
        ),
      ),
    );
  }
}

function creditLine(algorithm: Algorithm): (Node | string)[] {
  const [primary, ...others] = algorithm.sources;
  if (!primary) return [];
  return [
    'By ',
    primary.authors,
    ' · ',
    el('a', { href: primary.url }, primary.project),
    ` (${primary.license})`,
    ...others.flatMap((source) => [
      ', after ',
      el('a', { href: source.url }, source.project),
      ` by ${source.authors}`,
    ]),
    ' · ',
    el('a', { href: '#about' }, 'details'),
  ];
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
