const $ = (id) => document.getElementById(id);
const form = $('listingForm');
const settingsDialog = $('settingsDialog');
const howDialog = $('howDialog');
let toastTimer;

function settings() {
  return { url: localStorage.getItem('lls-ollama-url') || 'http://localhost:11434', model: localStorage.getItem('lls-model') || 'qwen2.5:3b' };
}
function notify(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}
function words(text) { return text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || []; }
function fallbackWrite(data) {
  const raw = data.details.trim().replace(/\s+/g, ' ').replace(/[. ]+$/, '');
  const title = `${data.productName} | ${data.category} by an independent maker`;
  const audience = data.audience ? ` Made for ${data.audience}.` : '';
  const description = `${data.productName}\n\n${raw}.${audience}\n\nThoughtfully made in small batches, with the little details that make everyday use feel special. Please read the care and sizing notes above before ordering.\n\nA lovely choice for your own home or as a considered gift.`;
  const stop = new Set('about above after again also and any are because been before being between both but can carefully crafted each every from have into its made make more most other over product than that the their them there these this those through using with your you'.split(' '));
  const counts = new Map();
  for (const token of words(`${data.productName} ${raw} ${data.category}`)) if (token.length > 2 && !stop.has(token)) counts.set(token, (counts.get(token) || 0) + 1);
  const tags = [...counts].sort((a,b) => b[1] - a[1]).map(([w]) => w).slice(0, 13);
  if (tags.length < 5) tags.push(...['handmade gift','small batch','maker made'].filter(t => !tags.includes(t)));
  return { title: title.slice(0, 140), description, tags: tags.slice(0, 13) };
}
function promptFor(d) {
  return `You write accurate, appealing ecommerce listings for independent makers. Use only facts supplied; do not invent dimensions, materials, origin, certifications, or shipping promises. Use a ${d.tone} voice. Platform: ${d.platform}. Category: ${d.category}. Intended buyer: ${d.audience || 'not specified'}. Product: ${d.productName}. Product facts: ${d.details}. Return ONLY valid JSON with string keys "title", "description" and array-of-strings key "tags" (13 short search phrases, each under 20 characters). Title max 140 characters. Description: warm, specific, easy to scan, 2-3 short paragraphs. No markdown fences.`;
}
async function writeWithOllama(data) {
  const s = settings();
  const response = await fetch(`${s.url.replace(/\/$/, '')}/api/generate`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ model: s.model, prompt: promptFor(data), stream: false, format: 'json', options: { temperature: 0.7 } })
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const result = await response.json();
  const parsed = JSON.parse(result.response);
  if (!parsed.title || !parsed.description || !Array.isArray(parsed.tags)) throw new Error('The model response was incomplete');
  return { title: String(parsed.title).slice(0, 140), description: String(parsed.description), tags: parsed.tags.slice(0, 13).map(String) };
}
function readForm() {
  return { productName: $('productName').value.trim(), category: $('category').value, platform: $('platform').value, details: $('details').value.trim(), audience: $('audience').value.trim(), tone: $('tone').value };
}
function showResult(result, mode) {
  $('emptyState').classList.add('hidden'); $('output').classList.remove('hidden');
  $('titleOut').textContent = result.title; $('descriptionOut').textContent = result.description;
  $('tagsOut').replaceChildren(...result.tags.map(tag => { const span = document.createElement('span'); span.className = 'tag'; span.textContent = tag; return span; }));
  $('modeBadge').textContent = mode === 'local-model' ? 'OPEN MODEL · LOCAL' : 'BUILT-IN WRITER';
  $('modelStatus').textContent = mode === 'local-model' ? `Generated with ${settings().model} on your Ollama instance` : 'Offline writer · Your details never leave this browser';
  $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!form.reportValidity()) return;
  const button = $('generateBtn'); button.disabled = true; button.innerHTML = '<span>✦</span> Writing…';
  const data = readForm();
  try { const result = await writeWithOllama(data); showResult(result, 'local-model'); }
  catch (error) { showResult(fallbackWrite(data), 'fallback'); $('modelStatus').textContent = 'Built-in writer · Start/check Ollama in Model settings for open-model copy'; }
  finally { button.disabled = false; button.innerHTML = '<span>✦</span> Write my listing <span class="arrow">↗</span>'; }
});
$('details').addEventListener('input', e => $('charCount').textContent = `${e.target.value.length} / 900`);
function copyText(text) { navigator.clipboard?.writeText(text).then(() => notify('Copied to clipboard')).catch(() => notify('Select and copy the text')); }
document.querySelectorAll('.copy').forEach(button => button.addEventListener('click', () => copyText($(button.dataset.copy).innerText)));
$('copyAll').addEventListener('click', () => copyText(`TITLE\n${$('titleOut').innerText}\n\nDESCRIPTION\n${$('descriptionOut').innerText}\n\nTAGS\n${[...$('tagsOut').children].map(x => x.innerText).join(', ')}`));
$('saveBtn').addEventListener('click', () => {
  const drafts = JSON.parse(localStorage.getItem('lls-drafts') || '[]');
  drafts.unshift({ ...readForm(), title: $('titleOut').innerText, description: $('descriptionOut').innerText, tags: [...$('tagsOut').children].map(x => x.innerText), savedAt: new Date().toISOString() });
  localStorage.setItem('lls-drafts', JSON.stringify(drafts.slice(0, 30))); notify('Draft saved on this device');
});
function openSettings() { const s = settings(); $('ollamaUrl').value = s.url; $('modelName').value = s.model; $('settingsStatus').textContent = ''; settingsDialog.showModal(); }
$('settingsBtn').addEventListener('click', openSettings); $('modelLink').addEventListener('click', openSettings);
$('settingsDialog').addEventListener('close', () => { if (settingsDialog.returnValue === 'save') { localStorage.setItem('lls-ollama-url', $('ollamaUrl').value.trim() || 'http://localhost:11434'); localStorage.setItem('lls-model', $('modelName').value.trim() || 'qwen2.5:3b'); $('modelStatus').textContent = `Ready to use ${settings().model} through local Ollama`; notify('Model settings saved'); } });
$('testModel').addEventListener('click', async () => {
  const status = $('settingsStatus'); status.textContent = 'Checking local model…';
  try { const response = await fetch(`${$('ollamaUrl').value.trim().replace(/\/$/, '')}/api/tags`); if (!response.ok) throw new Error('Could not reach Ollama'); const data = await response.json(); const found = data.models?.some(m => m.name === $('modelName').value.trim() || m.name.startsWith(`${$('modelName').value.trim()}:`)); status.textContent = found ? `Connected. ${$('modelName').value.trim()} is ready.` : 'Ollama is connected. Pull this model first, then try again.'; }
  catch { status.textContent = 'Could not connect. Check Ollama is running and allows this page as an origin.'; }
});
$('howBtn').addEventListener('click', () => howDialog.showModal()); $('howDialog').querySelector('.modal-done').addEventListener('click', () => howDialog.close());
