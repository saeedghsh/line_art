import type {
  ChoiceParameter,
  NumberParameter,
  ParameterDefinition,
  ParameterValue,
  ParameterValues,
} from '../algorithms/types';
import { el } from './dom';

type OnChange = (id: string, value: ParameterValue) => void;

/**
 * Renders controls for `definitions`, grouped by `group`, into `form`,
 * replacing its previous content. `onChange` fires on every edit.
 */
export function renderParameterForm(
  form: HTMLElement,
  definitions: readonly ParameterDefinition[],
  values: ParameterValues,
  onChange: OnChange,
): void {
  const groups = new Map<string, ParameterDefinition[]>();
  for (const definition of definitions) {
    const group = definition.group ?? '';
    groups.set(group, [...(groups.get(group) ?? []), definition]);
  }
  form.replaceChildren(
    ...[...groups].map(([group, members]) =>
      el(
        'fieldset',
        { className: 'param-group' },
        group ? el('legend', {}, group) : '',
        ...members.map((definition) => control(definition, values[definition.id], onChange)),
      ),
    ),
  );
}

function control(
  definition: ParameterDefinition,
  value: ParameterValue | undefined,
  onChange: OnChange,
): HTMLElement {
  const inputId = `param-${definition.id}`;
  const help = el('p', { className: 'param-help', id: `${inputId}-help` }, definition.description);

  if (definition.type === 'boolean') {
    const input = el('input', {
      type: 'checkbox',
      id: inputId,
      checked: value === true,
    });
    input.setAttribute('aria-describedby', help.id);
    input.addEventListener('change', () => {
      onChange(definition.id, input.checked);
    });
    return el(
      'div',
      { className: 'param param-boolean' },
      el('label', { className: 'param-label', htmlFor: inputId }, input, definition.label),
      help,
    );
  }

  if (definition.type === 'choice') {
    return choiceControl(definition, String(value), help, onChange);
  }
  return numberControl(definition, Number(value), help, onChange);
}

function numberControl(
  definition: NumberParameter,
  value: number,
  help: HTMLElement,
  onChange: OnChange,
): HTMLElement {
  const inputId = `param-${definition.id}`;
  const attributes = {
    min: String(definition.min),
    max: String(definition.max),
    step: String(definition.step),
    value: String(value),
  };
  const slider = el('input', { type: 'range', id: inputId, ...attributes });
  const box = el('input', { type: 'number', className: 'param-number', ...attributes });
  slider.setAttribute('aria-describedby', help.id);
  box.setAttribute('aria-label', `${definition.label} value`);

  const commit = (raw: number, from: HTMLInputElement) => {
    if (!Number.isFinite(raw)) return;
    const clamped = Math.min(definition.max, Math.max(definition.min, raw));
    const next = definition.type === 'int' ? Math.round(clamped) : clamped;
    if (from !== slider) slider.value = String(next);
    if (from !== box) box.value = String(next);
    onChange(definition.id, next);
  };
  slider.addEventListener('input', () => {
    commit(slider.valueAsNumber, slider);
  });
  box.addEventListener('change', () => {
    commit(box.valueAsNumber, box);
    box.value = slider.value;
  });

  return el(
    'div',
    { className: 'param param-number-row' },
    el('label', { className: 'param-label', htmlFor: inputId }, definition.label),
    el('div', { className: 'param-inputs' }, slider, box),
    help,
  );
}

function choiceControl(
  definition: ChoiceParameter,
  value: string,
  help: HTMLElement,
  onChange: OnChange,
): HTMLElement {
  const name = `param-${definition.id}`;
  const options = definition.options.map((option) => {
    const radio = el('input', {
      type: 'radio',
      name,
      value: option.value,
      checked: option.value === value,
    });
    radio.addEventListener('change', () => {
      if (radio.checked) onChange(definition.id, option.value);
    });
    return el('label', { className: 'segment' }, radio, el('span', {}, option.label));
  });
  const group = el('div', { className: 'segmented', role: 'radiogroup' }, ...options);
  group.setAttribute('aria-label', definition.label);
  group.setAttribute('aria-describedby', help.id);
  return el(
    'div',
    { className: 'param param-choice' },
    el('span', { className: 'param-label' }, definition.label),
    group,
    help,
  );
}
