/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that exceptions thrown by content don't show up twice in the Web
// Console.

"use strict";

const INIT_URI = "data:text/html;charset=utf8,hello world";
const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-duplicate-error.html";

add_task(function* () {
  yield loadTab(INIT_URI);

  let hud = yield openConsole();

  // On e10s, the exception is triggered in child process
  // and is ignored by test harness
  if (!Services.appinfo.browserTabsRemoteAutostart) {
    expectUncaughtException();
  }

  content.location = TEST_URI;

  yield waitForMessages({
    webconsole: hud,
    messages: [{
      text: "fooDuplicateError1",
      category: CATEGORY_JS,
      severity: SEVERITY_ERROR,
    },
    {
      text: "test-duplicate-error.html",
      category: CATEGORY_NETWORK,
      severity: SEVERITY_LOG,
    }],
  });

  let text = hud.outputNode.textContent;
  let error1pos = text.indexOf("fooDuplicateError1");
  ok(error1pos > -1, "found fooDuplicateError1");
  if (error1pos > -1) {
    ok(text.indexOf("fooDuplicateError1", error1pos + 1) == -1,
      "no duplicate for fooDuplicateError1");
  }
});
