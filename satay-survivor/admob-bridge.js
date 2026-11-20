/* AdMob bridge for the SATAY SURVIVOR Android app.
 * No-op in a plain browser (e.g. the itch.io web version): everything is
 * guarded on the Capacitor runtime + AdMob plugin being present.
 * Behavior: initialize AdMob on load, prepare an interstitial, show it on
 * game over (throttled to at most one show per 60s and once per game over),
 * then re-prepare after each show/close. */
(function () {
  'use strict';

  var INTERSTITIAL_ID = 'ca-app-pub-7439834688426902/1671632634';
  var MIN_SHOW_INTERVAL_MS = 60000; // throttle: never show more often than this

  var AdMob = null;
  var ready = false;       // plugin initialized
  var prepared = false;    // an interstitial is loaded and ready to show
  var preparing = false;   // a prepare call is in flight
  var lastShownAt = 0;

  function hasPlugin() {
    try {
      return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob);
    } catch (e) {
      return false;
    }
  }

  function prepare() {
    if (!AdMob || !ready || prepared || preparing) return;
    preparing = true;
    AdMob.prepareInterstitial({ adId: INTERSTITIAL_ID, isTesting: false })
      .then(function () { prepared = true; preparing = false; })
      .catch(function () { preparing = false; /* retry on next game over */ });
  }

  function init() {
    if (!hasPlugin()) return; // plain browser: stay a no-op
    AdMob = window.Capacitor.Plugins.AdMob;

    // Event names per @capacitor-community/admob v7 (InterstitialAdPluginEvents).
    try {
      AdMob.addListener('interstitialAdLoaded', function () { prepared = true; preparing = false; });
      AdMob.addListener('interstitialAdFailedToLoad', function () { prepared = false; preparing = false; });
      AdMob.addListener('interstitialAdDismissed', function () { prepared = false; prepare(); });
      AdMob.addListener('interstitialAdFailedToShow', function () { prepared = false; prepare(); });
    } catch (e) { /* plugin without events: promise flow still works */ }

    AdMob.initialize({ initializeForTesting: false })
      .then(function () { ready = true; prepare(); })
      .catch(function () { /* ads unavailable; game continues without them */ });
  }

  window.SatayAds = {
    onGameOver: function () {
      if (!AdMob || !ready) return;
      var now = Date.now();
      if (now - lastShownAt < MIN_SHOW_INTERVAL_MS) { prepare(); return; }
      if (!prepared) { prepare(); return; }
      AdMob.showInterstitial()
        .then(function () { lastShownAt = Date.now(); prepared = false; })
        .catch(function () { prepared = false; prepare(); });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
