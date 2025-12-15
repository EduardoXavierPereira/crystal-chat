export function createToggle({
  id,
  text,
  checked,
  disabled,
  className,
  switchOnRight,
  showText,
  onChange
} = {}) {
  const label = document.createElement('label');
  label.className = className ? `cc-toggle ${className}` : 'cc-toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  if (id) input.id = (id || '').toString();
  input.checked = !!checked;
  input.disabled = !!disabled;

  const knob = document.createElement('span');
  knob.className = 'cc-toggle-switch';

  const textEl = document.createElement('span');
  textEl.className = 'cc-toggle-text';
  textEl.textContent = (text || '').toString();

  input.addEventListener('change', () => {
    onChange?.(!!input.checked);
  });

  label.appendChild(input);
  const shouldShowText = showText !== false;
  if (switchOnRight) {
    if (shouldShowText) label.appendChild(textEl);
    label.appendChild(knob);
  } else {
    label.appendChild(knob);
    if (shouldShowText) label.appendChild(textEl);
  }

  return {
    el: label,
    input,
    setChecked: (v) => {
      input.checked = !!v;
    },
    setDisabled: (v) => {
      input.disabled = !!v;
    },
    setText: (v) => {
      textEl.textContent = (v || '').toString();
    }
  };
}
