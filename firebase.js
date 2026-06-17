import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

  // ⚠️ SECURITY: This API key is restricted to Firestore read/write for this project only.
  // Protect your Firestore data by setting Security Rules in Firebase Console:
  //   rules_version = '2';
  //   service cloud.firestore {
  //     match /databases/{database}/documents {
  //       match /users/{userId} {
  //         allow read: if request.auth == null; // allow unauthenticated read for login
  //         allow write: if false; // block all client writes (use Admin SDK or REST with API key only)
  //       }
  //     }
  //   }
  const firebaseConfig = {
    apiKey: "AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs",
    authDomain: "empwppconvert.firebaseapp.com",
    projectId: "empwppconvert",
    storageBucket: "wppempconvert-5d5ca.firebasestorage.app",
    messagingSenderId: "799152841324",
    appId: "1:799152841324:web:de016d8b6e83925a60ee49"
  };

  const app = initializeApp(firebaseConfig);
  const db  = getFirestore(app);

  // ── Login checker with cooldown enforcement ──
  window._firestoreLogin = async function(inputUser, inputPass){
    try{
      const snap = await getDocs(collection(db, "users"));
      let matched = null;
      let matchedDocId = null;
      snap.forEach(function(docSnap){
        const u = docSnap.data();
        if(u.username && u.username.toUpperCase() === inputUser && u.password === inputPass){
          matched = u;
          matchedDocId = docSnap.id;
        }
      });
      if(!matched) return { status: 'invalid' };

      // ── Cooldown check (test role only) ──
      if((matched.role||'').toLowerCase() === 'test'){
        const cooldownUntil = matched.cooldownuntil || '';
        if(cooldownUntil !== ''){
          const until = new Date(cooldownUntil);
          const now   = new Date();
          if(until > now){
            // Still locked — calculate remaining time
            const diffMs   = until - now;
            const diffHrs  = Math.floor(diffMs / (1000*60*60));
            const diffMins = Math.floor((diffMs % (1000*60*60)) / (1000*60));
            return { status: 'cooldown', hours: diffHrs, mins: diffMins, cooldownUntil: until.toISOString(), username: matched.username || inputUser, cooldownhours: matched.cooldownhours || 24 };
          }
        }
      }

      // Store doc ID so session expiry can write cooldownuntil back
      matched._docId = matchedDocId;

      return { status: 'ok', user: matched };
    } catch(e){
      return { status: 'error' };
    }
  };

  // _firestoreSetCooldown is defined below in a regular script (not module) for reliable window attachment

  // ── Write session token to Firestore ──
  window._firestoreWriteToken = async function(docId, token){
    try{
      var apiKey  = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
      var project = 'empwppconvert';
      var url = 'https://firestore.googleapis.com/v1/projects/' + project
              + '/databases/(default)/documents/users/' + docId
              + '?key=' + apiKey
              + '&updateMask.fieldPaths=activeSessionToken';
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { activeSessionToken: { stringValue: token } } })
      });
    } catch(e){ console.warn('Token write failed', e); }
  };

  // ── Poll every 6s — if token changed, someone else logged in → kick this session ──
  window._startSessionWatch = function(docId, myToken){
    var apiKey  = 'AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs';
    var project = 'empwppconvert';
    var interval = setInterval(async function(){
      try{
        var url = 'https://firestore.googleapis.com/v1/projects/' + project
                + '/databases/(default)/documents/users/' + docId
                + '?key=' + apiKey;
        var res = await fetch(url);

        // ── User deleted: Firestore returns 404 when document no longer exists ──
        if(res.status === 404){
          clearInterval(interval);
          sessionStorage.clear();
          localStorage.removeItem('nesto_logged_in');
          localStorage.removeItem('nesto_role');
          localStorage.removeItem('nesto_sessiontime');
          localStorage.removeItem('nesto_cooldownhours');
          localStorage.removeItem('nesto_docid');
          localStorage.removeItem('nesto_session_start');
          localStorage.removeItem('nesto_session_totalsecs');
          document.getElementById('appWrap').style.display = 'none';
          var removedScreen = document.createElement('div');
          removedScreen.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0a1628;display:flex;align-items:center;justify-content:center;font-family:inherit;';
          removedScreen.innerHTML =
            '<div style="background:#1a2540;border:2px solid rgba(220,38,38,.4);border-radius:18px;padding:44px 48px;max-width:420px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.8);">' +
              '<div style="font-size:52px;margin-bottom:16px;">🚫</div>' +
              '<div style="font-size:17px;font-weight:800;color:#ff6b6b;margin-bottom:10px;">Account Removed</div>' +
              '<div style="font-size:13px;color:#8090b0;line-height:1.9;margin-bottom:28px;">' +
                'Your username has been removed<br>by the administrator.<br>' +
                '<span style="color:#6080a0;font-size:12px;">Please contact your admin for access.</span>' +
              '</div>' +
              '<button onclick="location.reload()" style="background:linear-gradient(135deg,#7f1d1d,#991b1b);border:none;color:#fff;border-radius:8px;padding:12px 36px;font-size:13px;font-weight:800;cursor:pointer;letter-spacing:.5px;">← Back to Login</button>' +
            '</div>';
          document.body.appendChild(removedScreen);
          return;
        }

        if(!res.ok) return;
        var data = await res.json();
        var currentToken = (data.fields && data.fields.activeSessionToken && data.fields.activeSessionToken.stringValue) || '';
        if(currentToken !== myToken){
          clearInterval(interval);
          // Clear all session data
          sessionStorage.clear();
          localStorage.removeItem('nesto_logged_in');
          localStorage.removeItem('nesto_role');
          localStorage.removeItem('nesto_sessiontime');
          localStorage.removeItem('nesto_cooldownhours');
          localStorage.removeItem('nesto_docid');
          localStorage.removeItem('nesto_session_start');
          localStorage.removeItem('nesto_session_totalsecs');
          // Show kicked screen
          document.getElementById('appWrap').style.display = 'none';
          var screen = document.createElement('div');
          screen.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0a1628;display:flex;align-items:center;justify-content:center;font-family:inherit;';
          screen.innerHTML =
            '<div style="background:#1a2540;border:2px solid rgba(232,80,50,.4);border-radius:18px;padding:44px 48px;max-width:400px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.8);">' +
              '<div style="font-size:52px;margin-bottom:16px;">🔒</div>' +
              '<div style="font-size:17px;font-weight:800;color:#ff8888;margin-bottom:10px;">You have been logged out</div>' +
              '<div style="font-size:13px;color:#8090b0;line-height:1.9;margin-bottom:28px;">' +
                'Another person logged in<br>using the same account.' +
              '</div>' +
              '<button onclick="location.reload()" style="background:linear-gradient(135deg,#2e5aac,#1a3d8f);border:none;color:#fff;border-radius:8px;padding:12px 36px;font-size:13px;font-weight:800;cursor:pointer;letter-spacing:.5px;">🔐 Login Again</button>' +
            '</div>';
          document.body.appendChild(screen);
        }
      } catch(e){}
    }, 6000);
  };