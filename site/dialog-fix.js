const dialog = document.querySelector('#submitDialog');
const main = document.querySelector('#content');

for (const button of dialog.querySelectorAll('button[value="cancel"]')) {
  button.type = 'button';
  button.addEventListener('click', event => {
    event.preventDefault();
    dialog.close();
  });
}

const styleClasses = new Map([
  ['grid-column:1/-1', 'full-grid'],
  ['border:0;border-radius:0', 'embedded-empty'],
  ['padding:13px 16px', 'padded-source'],
  ['grid-template-columns:1fr', 'single-column-grid'],
  ['padding:16px', 'panel-body'],
]);

// app.js renders a few conditional fragments. Normalize any declarative
// convenience attributes immediately so the final DOM is fully compatible
// with the site's strict no-inline-script/no-inline-style CSP.
const normalizeDynamicMarkup = () => {
  for (const button of main.querySelectorAll('button[onclick]')) {
    const action = button.getAttribute('onclick') || '';
    if (!action.includes("#openSubmit")) continue;
    button.removeAttribute('onclick');
    if (button.dataset.submitBound === 'true') continue;
    button.dataset.submitBound = 'true';
    button.addEventListener('click', () => document.querySelector('#openSubmit')?.click());
  }

  for (const element of main.querySelectorAll('[style]')) {
    const raw = (element.getAttribute('style') || '').replace(/\s+/g, '');
    const className = styleClasses.get(raw);
    if (!className) continue;
    element.removeAttribute('style');
    element.classList.add(className);
  }
};

new MutationObserver(normalizeDynamicMarkup).observe(main, { childList: true, subtree: true });
normalizeDynamicMarkup();
