/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "data:text/html;charset=utf-8,<p>test for bug 642615";

XPCOMUtils.defineLazyServiceGetter(this, "clipboardHelper",
                                   "@mozilla.org/widget/clipboardhelper;1",
                                   "nsIClipboardHelper");
var WebConsoleUtils = require("devtools/shared/webconsole/utils").Utils;

add_task(function* () {
  yield loadTab(TEST_URI);

  let hud = yield openConsole();

  yield consoleOpened(hud);
});

function consoleOpened(HUD) {
  let deferred = promise.defer();

  let jsterm = HUD.jsterm;
  let stringToCopy = "foobazbarBug642615";

  jsterm.clearOutput();

  ok(!jsterm.completeNode.value, "no completeNode.value");

  jsterm.setInputValue("doc");

  let completionValue;

  // wait for key "u"
  function onCompletionValue() {
    completionValue = jsterm.completeNode.value;

    // Arguments: expected, setup, success, failure.
    waitForClipboard(
      stringToCopy,
      function() {
        clipboardHelper.copyString(stringToCopy);
      },
      onClipboardCopy,
      finishTest);
  }

  function onClipboardCopy() {
    testSelfXss();

    jsterm.setInputValue("docu");
    info("wait for completion update after clipboard paste");
    updateEditUIVisibility();
    jsterm.once("autocomplete-updated", onClipboardPaste);
    goDoCommand("cmd_paste");
  }

  // Self xss prevention tests (bug 994134)
  function testSelfXss() {
    info("Self-xss paste tests");
    WebConsoleUtils.usageCount = 0;
    is(WebConsoleUtils.usageCount, 0, "Test for usage count getter");
    // Input some commands to check if usage counting is working
    for (let i = 0; i <= 3; i++) {
      jsterm.setInputValue(i);
      jsterm.execute();
    }
    is(WebConsoleUtils.usageCount, 4, "Usage count incremented");
    WebConsoleUtils.usageCount = 0;
    updateEditUIVisibility();

    let oldVal = jsterm.getInputValue();
    goDoCommand("cmd_paste");
    let notificationbox = jsterm.hud.document.getElementById("webconsole-notificationbox");
    let notification = notificationbox.getNotificationWithValue("selfxss-notification");
    ok(notification, "Self-xss notification shown");
    is(oldVal, jsterm.getInputValue(), "Paste blocked by self-xss prevention");

    // Allow pasting
    jsterm.setInputValue("allow pasting");
    let evt = document.createEvent("KeyboardEvent");
    evt.initKeyEvent("keyup", true, true, window,
                     0, 0, 0, 0,
                     0, " ".charCodeAt(0));
    jsterm.inputNode.dispatchEvent(evt);
    jsterm.setInputValue("");
    goDoCommand("cmd_paste");
    isnot("", jsterm.getInputValue(), "Paste works");
  }
  function onClipboardPaste() {
    ok(!jsterm.completeNode.value, "no completion value after paste");

    info("wait for completion update after undo");
    jsterm.once("autocomplete-updated", onCompletionValueAfterUndo);

    // Get out of the webconsole event loop.
    executeSoon(() => {
      goDoCommand("cmd_undo");
    });
  }

  function onCompletionValueAfterUndo() {
    is(jsterm.completeNode.value, completionValue,
       "same completeNode.value after undo");

    info("wait for completion update after clipboard paste (ctrl-v)");
    jsterm.once("autocomplete-updated", () => {
      ok(!jsterm.completeNode.value,
         "no completion value after paste (ctrl-v)");

      // using executeSoon() to get out of the webconsole event loop.
      executeSoon(deferred.resolve);
    });

    // Get out of the webconsole event loop.
    executeSoon(() => {
      EventUtils.synthesizeKey("v", {accelKey: true});
    });
  }

  info("wait for completion value after typing 'docu'");
  jsterm.once("autocomplete-updated", onCompletionValue);

  EventUtils.synthesizeKey("u", {});

  return deferred.promise;
}
