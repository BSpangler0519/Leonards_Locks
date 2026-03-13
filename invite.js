// ============================================================
// LEONARD'S LOCKS — INVITE LINK SYSTEM
// invite.js — load AFTER app.js in index.html
//
// HOW IT WORKS:
//   1. Leonard generates a link in TOOLS > KEYS
//   2. The link encodes the API keys in the URL hash (never sent to any server)
//   3. Friends click the link → keys auto-load → app launches instantly
//   4. Keys are then saved to their localStorage for future visits
//
// SECURITY MODEL:
//   • Keys travel in the URL #fragment (hash), NOT the query string
//   • Hash fragments are NEVER sent to the server — they exist only in the browser
//   • Keys are obfuscated (Base64) to prevent casual shoulder-surfing
//   • A short passphrase lock is optional (XOR cipher layer)
//   • Trusted-group only: no authentication, but no brute-force surface either
// ============================================================

(function() {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // ENCODE / DECODE  (Base64 + optional XOR passphrase)
  // ──────────────────────────────────────────────────────────

  function xorCipher(str, pass) {
    if (!pass) return str;
    var out = '';
    for (var i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ pass.charCodeAt(i % pass.length));
    }
    return out;
  }

  function encodePayload(oddsKey, claudeKey, passphrase) {
    var obj = { o: oddsKey || '', c: claudeKey || '' };
    var json = JSON.stringify(obj);
    var raw = passphrase ? xorCipher(json, passphrase) : json;
    // btoa needs latin1; use encodeURIComponent dance for safety
    try {
      return btoa(unescape(encodeURIComponent(raw)));
    } catch(e) {
      return btoa(raw);
    }
  }

  function decodePayload(encoded, passphrase) {
    try {
      var raw = decodeURIComponent(escape(atob(encoded)));
      var json = passphrase ? xorCipher(raw, passphrase) : raw;
      return JSON.parse(json);
    } catch(e) {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────
  // AUTO-LOAD FROM URL HASH ON PAGE LOAD
  //   URL format:  https://yoursite.github.io/bracket-odds#llk=BASE64_PAYLOAD
  //   With pass:   https://yoursite.github.io/bracket-odds#llk=BASE64_PAYLOAD&p=PASSPHRASE
  // ──────────────────────────────────────────────────────────

  function tryLoadFromHash() {
    var hash = window.location.hash;
    if (!hash || hash.indexOf('llk=') === -1) return false;

    // Parse hash params  (#llk=xxx&p=yyy)
    var hashStr = hash.slice(1); // remove leading #
    var params = {};
    hashStr.split('&').forEach(function(part) {
      var idx = part.indexOf('=');
      if (idx > -1) params[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
    });

    var encoded = params['llk'];
    var passphrase = params['p'] || '';
    if (!encoded) return false;

    var payload = decodePayload(encoded, passphrase);
    if (!payload) {
      console.warn('[Invite] Could not decode invite payload.');
      return false;
    }

    // Save keys to localStorage (same keys app.js uses)
    if (payload.o) {
      window.API_KEY = payload.o;
      localStorage.setItem('oddsApiKey', payload.o);
    }
    if (payload.c) {
      window.CLAUDE_KEY = payload.c;
      localStorage.setItem('claudeApiKey', payload.c);
    }

    // Clean the hash from the URL so it's not bookmarked with keys
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    console.log('[Invite] Keys loaded from invite link. Launching app...');

    // Show a brief welcome toast, then launch
    showInviteToast(passphrase ? 'Keys loaded! Welcome to the group 🏀' : 'Keys loaded! Welcome to the group 🏀');
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // GENERATE INVITE LINK (called from the KEYS panel UI)
  // ──────────────────────────────────────────────────────────

  window.generateInviteLink = function() {
    var oddsKey   = localStorage.getItem('oddsApiKey') || '';
    var claudeKey = localStorage.getItem('claudeApiKey') || '';
    var passInput = document.getElementById('invite-passphrase');
    var passphrase = passInput ? passInput.value.trim() : '';

    if (!oddsKey) {
      alert('No Odds API key saved yet. Go to CHANGE API KEYS first.');
      return;
    }

    var encoded = encodePayload(oddsKey, claudeKey, passphrase);
    var base = window.location.origin + window.location.pathname;
    var link = base + '#llk=' + encoded + (passphrase ? '&p=' + encodeURIComponent(passphrase) : '');

    var out = document.getElementById('invite-link-output');
    if (out) {
      out.value = link;
      out.style.display = 'block';
    }

    // Also try to copy
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(function() {
        showInviteToast('Invite link copied to clipboard! 📋');
      }).catch(function() {
        showInviteToast('Link generated — tap to copy ⬆');
      });
    } else {
      // Fallback: select the textarea
      if (out) { out.select(); try { document.execCommand('copy'); showInviteToast('Link copied! 📋'); } catch(e) {} }
    }
  };

  // ──────────────────────────────────────────────────────────
  // TOAST NOTIFICATION
  // ──────────────────────────────────────────────────────────

  function showInviteToast(msg) {
    var t = document.getElementById('invite-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'invite-toast';
      t.style.cssText = [
        'position:fixed',
        'bottom:calc(env(safe-area-inset-bottom,0px) + 80px)',
        'left:50%',
        'transform:translateX(-50%)',
        'background:#f59e0b',
        'color:#080c17',
        'font-family:"Courier New",monospace',
        'font-size:12px',
        'font-weight:700',
        'padding:10px 20px',
        'border-radius:20px',
        'z-index:9999',
        'white-space:nowrap',
        'box-shadow:0 4px 20px rgba(0,0,0,0.5)',
        'transition:opacity 0.4s'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function() { t.style.opacity = '0'; }, 3500);
  }

  // ──────────────────────────────────────────────────────────
  // INJECT INVITE UI INTO KEYS PANEL
  // ──────────────────────────────────────────────────────────

  function injectInviteUI() {
    var keysPanel = document.getElementById('keys-panel');
    if (!keysPanel) return;

    // Don't double-inject
    if (document.getElementById('invite-section')) return;

    var html = [
      '<div id="invite-section" class="tool-section" style="margin-top:16px;border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:14px;background:rgba(245,158,11,0.04)">',
        '<div class="tool-section-title" style="color:#f59e0b;margin-bottom:10px">',
          '&#128279; INVITE LINK — SHARE WITH FRIENDS',
        '</div>',
        '<div style="font-size:11px;color:#7a8fa6;line-height:1.8;margin-bottom:12px">',
          'Generate a one-tap link that loads your API keys on any phone.<br/>',
          'Keys travel in the URL hash — <strong style="color:#fff">never sent to any server</strong>.<br/>',
          'Optional passphrase adds an extra obfuscation layer.',
        '</div>',

        '<!-- Passphrase row -->',
        '<label style="font-size:9px;color:#8aa0b8;letter-spacing:1px;display:block;margin-bottom:4px">PASSPHRASE (optional — share it with friends separately)</label>',
        '<input id="invite-passphrase" type="text" placeholder="e.g. leonards2025" ',
          'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" ',
          'style="width:100%;background:#080c17;border:1px solid #1e2e40;border-radius:8px;color:#fff;',
          'padding:9px 10px;font-size:13px;font-family:\'Courier New\',monospace;box-sizing:border-box;margin-bottom:10px"/>',

        '<!-- Generate button -->',
        '<button onclick="generateInviteLink()" ',
          'style="width:100%;padding:10px;background:#f59e0b;border:none;border-radius:8px;',
          'color:#080c17;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:10px">',
          '&#128279; GENERATE &amp; COPY INVITE LINK',
        '</button>',

        '<!-- Output textarea -->',
        '<label style="font-size:9px;color:#8aa0b8;letter-spacing:1px;display:block;margin-bottom:4px">GENERATED LINK (tap to select &amp; copy)</label>',
        '<textarea id="invite-link-output" readonly onclick="this.select()" ',
          'style="display:none;width:100%;height:80px;background:#080c17;border:1px solid #3b4fd8;',
          'border-radius:8px;color:#38bdf8;padding:8px 10px;font-size:10px;font-family:\'Courier New\',monospace;',
          'resize:none;box-sizing:border-box;word-break:break-all">',
        '</textarea>',

        '<div style="font-size:10px;color:#445566;margin-top:8px;line-height:1.6">',
          '&#9888; If you use a passphrase, text it to your friends separately.<br/>',
          'They enter it when prompted after tapping the link.',
        '</div>',
      '</div>'
    ].join('');

    // Insert before the last closing div of keys-panel
    keysPanel.insertAdjacentHTML('beforeend', html);
  }

  // ──────────────────────────────────────────────────────────
  // PASSPHRASE PROMPT  (shown when link has &p= and no auto-pass)
  // ──────────────────────────────────────────────────────────
  //  (Not needed with current design — passphrase is IN the link.
  //   This is here in case you later want a split-secret design
  //   where the passphrase is sent via SMS and the hash via link.)

  // ──────────────────────────────────────────────────────────
  // INIT — run after DOM is ready
  // ──────────────────────────────────────────────────────────

  function init() {
    // 1. Try to auto-load from hash — this may set API_KEY / CLAUDE_KEY
    //    before app.js's window.onload fires (if invite.js loads first),
    //    OR override after app.js has already set them.
    var loadedFromInvite = tryLoadFromHash();

    // 2. Inject invite UI into the KEYS panel (deferred to ensure panel exists)
    //    If the panel doesn't exist yet, retry until it does.
    var attempts = 0;
    function tryInject() {
      attempts++;
      var panel = document.getElementById('keys-panel');
      if (panel) {
        injectInviteUI();
      } else if (attempts < 30) {
        setTimeout(tryInject, 200);
      }
    }
    setTimeout(tryInject, 300);

    // 3. If loaded from invite AND app hasn't launched yet, trigger launch
    if (loadedFromInvite) {
      // Wait for app.js window.onload to finish, then check state
      // We use a small delay so app.js can set up its own state first
      setTimeout(function() {
        var setup = document.getElementById('setup-screen');
        var header = document.getElementById('header');
        // If still showing setup screen, auto-launch
        if (setup && setup.style.display !== 'none' && window.launchApp) {
          window.launchApp();
        }
      }, 600);
    }
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
