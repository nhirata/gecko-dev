/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "data:text/html;charset=utf-8,<p>bug 660806 - history " +
                 "navigation must not show the autocomplete popup";

add_task(function* () {
  yield loadTab(TEST_URI);

  let hud = yield openConsole();

  yield consoleOpened(hud);
});

function consoleOpened(HUD) {
  let deferred = promise.defer();

  let jsterm = HUD.jsterm;
  let popup = jsterm.autocompletePopup;
  let onShown = function() {
    ok(false, "popup shown");
  };

  jsterm.execute("window.foobarBug660806 = {\
    'location': 'value0',\
    'locationbar': 'value1'\
  }");

  popup._panel.addEventListener("popupshown", onShown, false);

  ok(!popup.isOpen, "popup is not open");

  ok(!jsterm.lastInputValue, "no lastInputValue");
  jsterm.setInputValue("window.foobarBug660806.location");
  is(jsterm.lastInputValue, "window.foobarBug660806.location",
     "lastInputValue is correct");

  EventUtils.synthesizeKey("VK_RETURN", {});
  EventUtils.synthesizeKey("VK_UP", {});

  is(jsterm.lastInputValue, "window.foobarBug660806.location",
     "lastInputValue is correct, again");

  executeSoon(function() {
    ok(!popup.isOpen, "popup is not open");
    popup._panel.removeEventListener("popupshown", onShown, false);
    executeSoon(deferred.resolve);
  });
  return deferred.promise;
}
