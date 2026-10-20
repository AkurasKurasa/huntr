const auto = document.getElementById('auto');
const status = document.getElementById('status');

chrome.storage.local.get('quiet').then(({ quiet = true }) => {
  auto.checked = quiet;
});
auto.addEventListener('change', () => chrome.storage.local.set({ quiet: auto.checked }));

document.getElementById('cancel').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'CANCEL_ALL' });
  refresh();
});

async function refresh() {
  const s = await chrome.runtime.sendMessage({ type: 'STATUS' });
  if (!s?.current) status.textContent = s?.queued ? `${s.queued} waiting.` : 'Nothing in progress.';
  else status.textContent = `Working on: ${s.current.title} (${s.current.stage})${s.queued ? ` · ${s.queued} more waiting` : ''}`;
}
refresh();

// Site access (Firefox asks for it separately)
const NEEDED = { origins: chrome.runtime.getManifest().host_permissions };
const accessBox = document.getElementById('access');
async function checkAccess() {
  accessBox.style.display = (await chrome.permissions.contains(NEEDED)) ? 'none' : 'block';
}
document.getElementById('allow').addEventListener('click', async () => {
  await chrome.permissions.request(NEEDED).catch(() => false);
  checkAccess();
});
checkAccess();
