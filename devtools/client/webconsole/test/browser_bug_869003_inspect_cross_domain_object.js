/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that users can inspect objects logged from cross-domain iframes -
// bug 869003.

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-bug-869003-top-window.html";

add_task(function* () {
  // This test is slightly more involved: it opens the web console, then the
  // variables view for a given object, it updates a property in the view and
  // checks the result. We can get a timeout with debug builds on slower
  // machines.
  requestLongerTimeout(2);

  yield loadTab("data:text/html;charset=utf8,<p>hello");
  let hud = yield openConsole();

  content.location = TEST_URI;

  let [result] = yield waitForMessages({
    webconsole: hud,
    messages: [{
      name: "console.log message",
      text: "foobar",
      category: CATEGORY_WEBDEV,
      severity: SEVERITY_LOG,
      objects: true,
    }],
  });

  let msg = [...result.matched][0];
  ok(msg, "message element");

  let body = msg.querySelector(".message-body");
  ok(body, "message body");

  let clickable = result.clickableElements[0];
  ok(clickable, "clickable object found");
  ok(body.textContent.includes('{ hello: "world!",'), "message text check");

  executeSoon(() => {
    EventUtils.synthesizeMouse(clickable, 2, 2, {}, hud.iframeWindow);
  });

  let aVar = yield hud.jsterm.once("variablesview-fetched");
  ok(aVar, "variables view fetched");
  ok(aVar._variablesView, "variables view object");

  [result] = yield findVariableViewProperties(aVar, [
    { name: "hello", value: "world!" },
    { name: "bug", value: 869003 },
  ], { webconsole: hud });

  let prop = result.matchedProp;
  ok(prop, "matched the |hello| property in the variables view");

  // Check that property value updates work.
  aVar = yield updateVariablesViewProperty({
    property: prop,
    field: "value",
    string: "'omgtest'",
    webconsole: hud,
  });

  info("onFetchAfterUpdate");

  yield findVariableViewProperties(aVar, [
    { name: "hello", value: "omgtest" },
    { name: "bug", value: 869003 },
  ], { webconsole: hud });
});

