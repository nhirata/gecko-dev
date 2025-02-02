/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 // Check if console provides the right column number alongside line number

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-console-column.html";

var hud;

function test() {
  loadTab(TEST_URI).then(() => {
    openConsole().then(consoleOpened);
  });
}

function consoleOpened(aHud) {
  hud = aHud;

  waitForMessages({
    webconsole: hud,
    messages: [{
      text: "Error Message",
      category: CATEGORY_WEBDEV,
      severity: SEVERITY_ERROR
    }]
  }).then(testLocationColumn);
}

function testLocationColumn() {
  let messages = hud.outputNode.children;
  let expected = ["10:7", "10:39", "11:9", "12:11", "13:9", "14:7"];

  for (let i = 0, len = messages.length; i < len; i++) {
    let msg = messages[i].textContent;

    is(msg.includes(expected[i]), true, "Found expected line:column of " +
                    expected[i]);
  }

  finishTest();
}
