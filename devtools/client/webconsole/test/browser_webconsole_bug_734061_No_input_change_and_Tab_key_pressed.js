/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/browser/test-console.html";

add_task(function* () {
  yield loadTab(TEST_URI);

  let hud = yield openConsole();

  let jsterm = hud.jsterm;
  let input = jsterm.inputNode;

  is(input.getAttribute("focused"), "true", "input has focus");
  EventUtils.synthesizeKey("VK_TAB", {});
  is(input.getAttribute("focused"), "", "focus moved away");

  // Test user changed something
  input.focus();
  EventUtils.synthesizeKey("A", {});
  EventUtils.synthesizeKey("VK_TAB", {});
  is(input.getAttribute("focused"), "true", "input is still focused");

  // Test non empty input but not changed since last focus
  input.blur();
  input.focus();
  EventUtils.synthesizeKey("VK_RIGHT", {});
  EventUtils.synthesizeKey("VK_TAB", {});
  is(input.getAttribute("focused"), "", "input moved away");
});
