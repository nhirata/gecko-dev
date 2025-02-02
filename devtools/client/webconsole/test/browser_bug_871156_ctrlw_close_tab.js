/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that Ctrl-W closes the Browser Console and that Ctrl-W closes the
// current tab when using the Web Console - bug 871156.

"use strict";

add_task(function* () {
  const TEST_URI = "data:text/html;charset=utf8,<title>bug871156</title>\n" +
                   "<p>hello world";
  let firstTab = gBrowser.selectedTab;

  Services.prefs.setBoolPref("browser.tabs.animate", false);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.tabs.animate");
  });

  yield loadTab(TEST_URI);

  let hud = yield openConsole();
  ok(hud, "Web Console opened");

  let tabClosed = promise.defer();
  let toolboxDestroyed = promise.defer();
  let tabSelected = promise.defer();

  let target = TargetFactory.forTab(gBrowser.selectedTab);
  let toolbox = gDevTools.getToolbox(target);

  gBrowser.tabContainer.addEventListener("TabClose", function onTabClose() {
    gBrowser.tabContainer.removeEventListener("TabClose", onTabClose);
    info("tab closed");
    tabClosed.resolve(null);
  });

  gBrowser.tabContainer.addEventListener("TabSelect", function onTabSelect() {
    gBrowser.tabContainer.removeEventListener("TabSelect", onTabSelect);
    if (gBrowser.selectedTab == firstTab) {
      info("tab selected");
      tabSelected.resolve(null);
    }
  });

  toolbox.once("destroyed", () => {
    info("toolbox destroyed");
    toolboxDestroyed.resolve(null);
  });

  // Get out of the web console initialization.
  executeSoon(() => {
    EventUtils.synthesizeKey("w", { accelKey: true });
  });

  yield promise.all([tabClosed.promise, toolboxDestroyed.promise,
                     tabSelected.promise]);
  info("promise.all resolved. start testing the Browser Console");

  hud = yield HUDService.toggleBrowserConsole();
  ok(hud, "Browser Console opened");

  let deferred = promise.defer();

  Services.obs.addObserver(function onDestroy() {
    Services.obs.removeObserver(onDestroy, "web-console-destroyed");
    ok(true, "the Browser Console closed");

    deferred.resolve(null);
  }, "web-console-destroyed", false);

  waitForFocus(() => {
    EventUtils.synthesizeKey("w", { accelKey: true }, hud.iframeWindow);
  }, hud.iframeWindow);

  yield deferred.promise;
});
