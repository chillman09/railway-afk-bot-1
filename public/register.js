document.querySelector('#register-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#reg-message');
  const button = event.target.querySelector('button[type="submit"]');
  const payload = {
    username: document.querySelector('#reg-username').value.trim(),
    password: document.querySelector('#reg-password').value
  };

  button.disabled = true;
  button.classList.add('is-loading');
  message.textContent = '';
  message.className = 'form-message';

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      message.textContent = data.error || 'Could not create the account.';
      message.className = 'form-message error';
      const card = document.querySelector('.login-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      window.sfx?.('error');
      return;
    }
    document.querySelector('.login-card').classList.add('leaving');
    await new Promise(r => setTimeout(r, 220));
    window.location.replace('/');
  } catch {
    message.textContent = 'Could not reach the server. Try again.';
    message.className = 'form-message error';
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
  }
});
