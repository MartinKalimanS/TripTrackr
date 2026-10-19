/* SUNRISE PASSPORT v2 - query-param test hooks. Include in <head> BEFORE tokens.css.
   ?theme=dark            -> <html data-theme="dark">
   ?contrast=more         -> <html data-contrast="more">
   ?scale=1.5 | 2         -> <html style="--fs:1.5" data-bigtext>  (every font size is calc(var(--fs) * Npx); bigtext when >= 1.15)
   ?platform=android      -> <html data-platform="android">   (default ios)
   ?long=1                -> <html data-long-mode="1">  (pages may swap in long strings)
   ?only=<frame>          -> core board only (index.html)                                       */
(function () {
  var q = new URLSearchParams(location.search), h = document.documentElement;
  if (q.get('theme') === 'dark') h.setAttribute('data-theme', 'dark');
  if (q.get('contrast') === 'more') h.setAttribute('data-contrast', 'more');
  var s = parseFloat(q.get('scale'));
  if (s > 0.5 && s <= 3) { h.style.setProperty('--fs', String(s)); if (s >= 1.15) h.setAttribute('data-bigtext', '1'); }   // fontScale >= 1.15: stat row, areas, dates, passport reflow
  h.setAttribute('data-platform', q.get('platform') === 'android' ? 'android' : 'ios');
  if (q.get('long') === '1') h.setAttribute('data-long-mode', '1');
})();
