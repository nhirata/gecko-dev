/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Test copying of the entire console message when right-clicked
// with no other text selected. See Bug 1100562.

function test() {
  let hud;
  let outputNode;
  let contextMenu;

  const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                   "test/test-console.html";

  Task.spawn(runner).then(finishTest);

  function* runner() {
    const {tab} = yield loadTab(TEST_URI);
    hud = yield openConsole(tab);
    outputNode = hud.outputNode;
    contextMenu = hud.iframeWindow.document.getElementById("output-contextmenu");

    registerCleanupFunction(() => {
      hud = outputNode = contextMenu = null;
    });

    hud.jsterm.clearOutput();
    content.console.log("bug 1100562");

    let [results] = yield waitForMessages({
      webconsole: hud,
      messages: [{
        text: "bug 1100562",
        category: CATEGORY_WEBDEV,
        severity: SEVERITY_LOG,
      }]
    });

    outputNode.focus();
    let message = [...results.matched][0];
    message.scrollIntoView();

    yield waitForContextMenu(contextMenu, message, copyFromPopup,
                             testContextMenuCopy);

    function copyFromPopup() {
      let copyItem = contextMenu.querySelector("#cMenu_copy");
      copyItem.doCommand();

      let controller = top.document.commandDispatcher
                                   .getControllerForCommand("cmd_copy");
      is(controller.isCommandEnabled("cmd_copy"), true, "cmd_copy is enabled");
    }

    function testContextMenuCopy() {
      waitForClipboard((str) => {
        return message.textContent.trim() == str.trim();
      }, () => {
        goDoCommand("cmd_copy");
      }, () => {}, () => {}
      );
    }

    yield closeConsole(tab);
  }
}
