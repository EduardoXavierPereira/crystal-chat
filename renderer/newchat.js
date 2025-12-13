export function applySuggestionToPrompt({ promptInput, autosizePrompt, text }) {
  if (!promptInput) return;
  promptInput.value = text;
  autosizePrompt(promptInput);
  promptInput.focus();
  const end = promptInput.value.length;
  try {
    promptInput.setSelectionRange(end, end);
  } catch {
    // ignore
  }
}
