/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that adding text to one of the output labels doesn't cause errors.

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-console.html";

add_task(function* () {
  yield loadTab(TEST_URI);

  let hud = yield openConsole();

  yield testTextNodeInsertion(hud);
});

// Test for bug 588730: Adding a text node to an existing label element causes
// warnings
function testTextNodeInsertion(hud) {
  let deferred = promise.defer();
  let outputNode = hud.outputNode;

  let label = document.createElementNS(
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "label");
  outputNode.appendChild(label);

  let error = false;
  let listener = {
    observe: function(aMessage) {
      let messageText = aMessage.message;
      if (messageText.indexOf("JavaScript Warning") !== -1) {
        error = true;
      }
    }
  };

  Services.console.registerListener(listener);

  // This shouldn't fail.
  label.appendChild(document.createTextNode("foo"));

  executeSoon(function() {
    Services.console.unregisterListener(listener);
    ok(!error, "no error when adding text nodes as children of labels");

    return deferred.resolve();
  });
  return deferred.promise;
}
