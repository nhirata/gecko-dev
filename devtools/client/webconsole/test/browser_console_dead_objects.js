/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that Dead Objects do not break the Web/Browser Consoles. See bug 883649.
// This test does:
// - opens a new tab,
// - opens the Browser Console,
// - stores a reference to the content document of the tab on the chrome window object,
// - closes the tab,
// - tries to use the object that was pointing to the now-defunct content
// document. This is the dead object.

"use strict";

const TEST_URI = "data:text/html;charset=utf8,<p>dead objects!";

function test() {
  let hud = null;

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("devtools.chrome.enabled");
  });

  Task.spawn(runner).then(finishTest);

  function* runner() {
    Services.prefs.setBoolPref("devtools.chrome.enabled", true);
    yield loadTab(TEST_URI);

    info("open the browser console");

    hud = yield HUDService.toggleBrowserConsole();
    ok(hud, "browser console opened");

    let jsterm = hud.jsterm;

    jsterm.clearOutput();

    // Add the reference to the content document.
    yield jsterm.execute("Cu = Components.utils;" +
                  "Cu.import('resource://gre/modules/Services.jsm');" +
                  "chromeWindow = Services.wm.getMostRecentWindow('" +
                  "navigator:browser');" +
                  "foobarzTezt = chromeWindow.content.document;" +
                  "delete chromeWindow");

    gBrowser.removeCurrentTab();

    let msg = yield jsterm.execute("foobarzTezt");

    isnot(hud.outputNode.textContent.indexOf("[object DeadObject]"), -1,
          "dead object found");

    jsterm.setInputValue("foobarzTezt");

    for (let c of ".hello") {
      EventUtils.synthesizeKey(c, {}, hud.iframeWindow);
    }

    yield jsterm.execute();

    isnot(hud.outputNode.textContent.indexOf("can't access dead object"), -1,
          "'cannot access dead object' message found");

    // Click the second execute output.
    let clickable = msg.querySelector("a");
    ok(clickable, "clickable object found");
    isnot(clickable.textContent.indexOf("[object DeadObject]"), -1,
          "message text check");

    msg.scrollIntoView();

    executeSoon(() => {
      EventUtils.synthesizeMouseAtCenter(clickable, {}, hud.iframeWindow);
    });

    yield jsterm.once("variablesview-fetched");
    ok(true, "variables view fetched");

    msg = yield jsterm.execute("delete window.foobarzTezt; 2013-26");

    isnot(msg.textContent.indexOf("1987"), -1, "result message found");
  }
}
