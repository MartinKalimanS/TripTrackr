// Bridge pages (reset-password, verify-email): hand an emailed link over to the app.
//
// Privacy contract (tests in scripts/build-site.test.mjs enforce it):
//   - the token is read from the query string, validated, put into the triptrackr:// link and
//     nowhere else: no network call, no storage, no logging, no analytics;
//   - the page's Content-Security-Policy has connect-src 'none' as a second line of defence;
//   - the token is removed from the address bar (history) once read.
(function () {
  'use strict';

  var TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,200}$/;
  var SCHEME_SHAPE = /^[a-z][a-z0-9+.-]{1,31}$/;
  var TARGETS = ['reset-password', 'verify-email'];

  // Exactly one `token` parameter of the right shape, otherwise null.
  function readToken(search) {
    var all = new URLSearchParams(search).getAll('token');
    if (all.length !== 1 || !TOKEN_SHAPE.test(all[0])) return null;
    return all[0];
  }

  function buildDeepLink(scheme, target, token) {
    if (!SCHEME_SHAPE.test(scheme) || TARGETS.indexOf(target) === -1) return null;
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return null;
    return scheme + '://' + target + '?token=' + token;
  }

  function show(doc, id) {
    var node = doc.getElementById(id);
    if (node) node.hidden = false;
  }

  function init(win, doc) {
    var root = doc.getElementById('bridge');
    if (!root) return;
    var token = readToken(win.location.search);
    var link = token && buildDeepLink(root.dataset.scheme, root.dataset.target, token);
    if (!link) {
      show(doc, 'bridge-invalid');
      return;
    }
    var button = doc.getElementById('open-app');
    if (button) button.setAttribute('href', link);
    show(doc, 'bridge-ready');
    try {
      win.history.replaceState(null, '', win.location.pathname);
    } catch (ignored) {
      // The address bar keeps the token; nothing else depends on this.
    }
    win.location.href = link;
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { readToken: readToken, buildDeepLink: buildDeepLink };
  } else {
    init(window, document);
  }
})();
