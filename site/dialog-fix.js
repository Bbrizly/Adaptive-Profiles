const dialog = document.querySelector('#submitDialog');
for (const button of dialog.querySelectorAll('button[value="cancel"]')) {
  button.type = 'button';
  button.addEventListener('click', event => {
    event.preventDefault();
    dialog.close();
  });
}
