/**
 * Model configuration options
 */

import { formatModelName } from '../formatModelName.js';

export const MODEL_OPTIONS = [
  'qwen3-vl:2b-instruct',
  'qwen3-vl:4b-instruct',
  'qwen3-vl:8b-instruct',
  // Optional reasoning-enabled variants (download on selection)
  'qwen3-vl:2b',
  'qwen3-vl:4b',
  'qwen3-vl:8b'
].map((m) => ({
  value: m,
  label: formatModelName(m)
}));
