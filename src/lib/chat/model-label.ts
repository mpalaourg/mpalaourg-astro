const names: Record<string, string> = {
  'nvidia/nemotron-3-ultra-550b-a55b': 'NVIDIA Nemotron 3 Ultra 550B A55B',
  'google/gemma-4-31b-it': 'Google Gemma 4 31B',
  'z-ai/glm-5.3-flash': 'GLM 5.3 Flash',
  'openrouter/free': 'OpenRouter',
};
export function modelLabel(model: string) {
  const id = model.replace(/:free$/i, '');
  return { name: names[id] || id, id };
}
