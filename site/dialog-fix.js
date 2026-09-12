const dialog = document.querySelector('#submitDialog');
const main = document.querySelector('#content');

for (const button of dialog.querySelectorAll('button[value="cancel"]')) {
  button.type = 'button';
  button.addEventListener('click', event => {
    event.preventDefault();
    dialog.close();
  });
}

// The zero-profile home state is rendered by app.js. Strip its declarative
// inline handler before a user can activate it so the site keeps a strict CSP.
const normalizeDynamicControls = () => {
  for (const button of main.querySelectorAll('button[onclick]')) {
    const action = button.getAttribute('onclick') || '';
    if (!action.includes("#openSubmit")) continue;
    button.removeAttribute('onclick');
    button.addEventListener('click', () => document.querySelector('#openSubmit')?.click(), { once: true });
  }
};

new MutationObserver(normalizeDynamicControls).observe(main, { childList: true, subtree: true });
normalizeDynamicControls();
