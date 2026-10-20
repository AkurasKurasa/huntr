const NEEDED = { origins: chrome.runtime.getManifest().host_permissions };
const ok = document.getElementById('ok');
const err = document.getElementById('err');
const btn = document.getElementById('allow');

async function show() {
  const has = await chrome.permissions.contains(NEEDED);
  ok.style.display = has ? 'block' : 'none';
  btn.style.display = has ? 'none' : 'inline-block';
}

btn.addEventListener('click', async () => {
  err.style.display = 'none';
  try {
    const granted = await chrome.permissions.request(NEEDED);
    if (!granted) {
      err.textContent = 'Access wasn’t allowed. Press the button again and choose Allow.';
      err.style.display = 'block';
    }
  } catch (e) {
    err.textContent = e.message;
    err.style.display = 'block';
  }
  show();
});

show();
