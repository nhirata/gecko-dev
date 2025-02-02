/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that the autocomplete popup closes on switching tabs. See bug 900448.

"use strict";

const TEST_URI = "data:text/html;charset=utf-8,<p>bug 900448 - autocomplete " +
                 "popup closes on tab switch";

add_task(function*() {
  yield loadTab(TEST_URI);
  let hud = yield openConsole();
  let popup = hud.jsterm.autocompletePopup;
  let popupShown = onPopupShown(popup._panel);

  hud.jsterm.setInputValue("sc");
  EventUtils.synthesizeKey("r", {});

  yield popupShown;

  ok(!popup.isOpen, "Popup closes on tab switch");
});

function onPopupShown(panel) {
  let finished = promise.defer();

  panel.addEventListener("popupshown", function popupOpened() {
    panel.removeEventListener("popupshown", popupOpened, false);
    loadTab("data:text/html;charset=utf-8,<p>testing autocomplete closes")
      .then(finished.resolve);
  }, false);

  return finished.promise;
}
