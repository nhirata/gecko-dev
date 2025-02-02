/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that, when the user types an extraneous closing bracket, no error
// appears.

"use strict";

const TEST_URI = "data:text/html;charset=utf-8,test for bug 592442";

add_task(function*() {
  yield loadTab(TEST_URI);
  let hud = yield openConsole();
  hud.jsterm.clearOutput();
  let jsterm = hud.jsterm;

  jsterm.setInputValue("document.getElementById)");

  let error = false;
  try {
    jsterm.complete(jsterm.COMPLETE_HINT_ONLY);
  } catch (ex) {
    error = true;
  }

  ok(!error, "no error was thrown when an extraneous bracket was inserted");
});
