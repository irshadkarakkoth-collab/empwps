// Inside your existing doLogin() function, replace the old call:
//
//   let result = { status: 'invalid' };
//   if (typeof window._firestoreLogin === 'function') {
//     result = await window._firestoreLogin(username, password);
//   }
//
// with this:

async function doLogin() {
  const email = document.getElementById('inUser').value.trim();
  const password = document.getElementById('inPass').value;
  const errBox = document.getElementById('loginErr');
  const loginBtn = document.querySelector('.login-btn');

  loginBtn.textContent = 'Signing in...';
  loginBtn.disabled = true;

  const result = await window._firebaseLogin(email, password);

  loginBtn.textContent = 'LOG IN';
  loginBtn.disabled = false;

  if (result.status === 'ok') {
    // success -- show the app, same as your existing post-login code
    document.getElementById('appWrap').classList.add('on');
    sessionStorage.setItem('nesto_logged_in', '1');
    document.getElementById('loginOvl').style.display = 'none';
  } else {
    // failure -- show Firebase's message (handles wrong password,
    // too many attempts, invalid email, etc. automatically)
    errBox.textContent = result.message;
    errBox.classList.add('on');
    document.getElementById('inPass').value = '';
    document.getElementById('inPass').focus();
    shakeLoginBox();
  }
}

// On page load, restore session if the browser tab was just refreshed
// (Firebase Auth persists login across refreshes by default):
window._firebaseOnAuthChange(function (user) {
  if (user) {
    document.getElementById('appWrap').classList.add('on');
    document.getElementById('loginOvl').style.display = 'none';
  }
});
