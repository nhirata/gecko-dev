/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-console.html";

var tab1, tab2, win1, win2;
var noErrors = true;

function tab1Loaded() {
  win2 = OpenBrowserWindow();
  whenDelayedStartupFinished(win2, win2Loaded);
}

function win2Loaded() {
  tab2 = win2.gBrowser.addTab(TEST_URI);
  win2.gBrowser.selectedTab = tab2;
  tab2.linkedBrowser.addEventListener("load", tab2Loaded, true);
}

function tab2Loaded(aEvent) {
  tab2.linkedBrowser.removeEventListener(aEvent.type, tab2Loaded, true);

  let consolesOpened = 0;
  function onWebConsoleOpen() {
    consolesOpened++;
    if (consolesOpened == 2) {
      executeSoon(closeConsoles);
    }
  }

  function openConsoles() {
    try {
      let target1 = TargetFactory.forTab(tab1);
      gDevTools.showToolbox(target1, "webconsole").then(onWebConsoleOpen);
    } catch (ex) {
      ok(false, "gDevTools.showToolbox(target1) exception: " + ex);
      noErrors = false;
    }

    try {
      let target2 = TargetFactory.forTab(tab2);
      gDevTools.showToolbox(target2, "webconsole").then(onWebConsoleOpen);
    } catch (ex) {
      ok(false, "gDevTools.showToolbox(target2) exception: " + ex);
      noErrors = false;
    }
  }

  function closeConsoles() {
    try {
      let target1 = TargetFactory.forTab(tab1);
      gDevTools.closeToolbox(target1).then(function() {
        try {
          let target2 = TargetFactory.forTab(tab2);
          gDevTools.closeToolbox(target2).then(testEnd);
        } catch (ex) {
          ok(false, "gDevTools.closeToolbox(target2) exception: " + ex);
          noErrors = false;
        }
      });
    } catch (ex) {
      ok(false, "gDevTools.closeToolbox(target1) exception: " + ex);
      noErrors = false;
    }
  }

  function testEnd() {
    ok(noErrors, "there were no errors");

    win1.gBrowser.removeTab(tab1);

    Array.forEach(win2.gBrowser.tabs, function(aTab) {
      win2.gBrowser.removeTab(aTab);
    });

    executeSoon(function() {
      win2.close();
      tab1 = tab2 = win1 = win2 = null;
      finishTest();
    });
  }

  waitForFocus(openConsoles, tab2.linkedBrowser.contentWindow);
}

function test() {
  loadTab(TEST_URI).then(() => {
    tab1 = gBrowser.selectedTab;
    win1 = window;
    tab1Loaded();
  });
}
