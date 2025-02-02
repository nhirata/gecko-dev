/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that the Web Console CSP messages are displayed

"use strict";

const TEST_URI = "data:text/html;charset=utf8,Web Console CSP violation test";
const TEST_VIOLATION = "https://example.com/browser/devtools/client/" +
                       "webconsole/test/test_bug_770099_violation.html";
const CSP_VIOLATION_MSG = "Content Security Policy: The page's settings " +
                          "blocked the loading of a resource at " +
                          "http://some.example.com/test.png (\"default-src " +
                            "https://example.com\").";

add_task(function* () {
  let { browser } = yield loadTab(TEST_URI);

  let hud = yield openConsole();

  hud.jsterm.clearOutput();

  let loaded = loadBrowser(browser);
  content.location = TEST_VIOLATION;
  yield loaded;

  yield waitForSuccess({
    name: "CSP policy URI warning displayed successfully",
    validator: function() {
      return hud.outputNode.textContent.indexOf(CSP_VIOLATION_MSG) > -1;
    }
  });
});
