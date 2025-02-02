/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "data:text/html;charset=utf8,<p>test Scratchpad panel " +
                 "linking</p>";

var { Task } = Cu.import("resource://gre/modules/Task.jsm", {});
var { Tools } = require("devtools/client/main");
var { isTargetSupported } = Tools.scratchpad;

Tools.scratchpad.isTargetSupported = () => true;

add_task(function*() {
  waitForExplicitFinish();
  yield loadTab(TEST_URI);

  info("Opening toolbox with Scratchpad panel");

  let target = TargetFactory.forTab(gBrowser.selectedTab);
  let toolbox = yield gDevTools.showToolbox(target, "scratchpad", "window");

  let scratchpadPanel = toolbox.getPanel("scratchpad");
  let { scratchpad } = scratchpadPanel;
  is(toolbox.getCurrentPanel(), scratchpadPanel,
    "Scratchpad is currently selected panel");

  info("Switching to webconsole panel");

  let webconsolePanel = yield toolbox.selectTool("webconsole");
  let { hud } = webconsolePanel;
  is(toolbox.getCurrentPanel(), webconsolePanel,
    "Webconsole is currently selected panel");

  info("console.log()ing from Scratchpad");

  scratchpad.setText("console.log('foobar-from-scratchpad')");
  scratchpad.run();
  let messages = yield waitForMessages({
    webconsole: hud,
    messages: [{ text: "foobar-from-scratchpad" }]
  });

  info("Clicking link to switch to and focus Scratchpad");

  let [matched] = [...messages[0].matched];
  ok(matched, "Found logged message from Scratchpad");
  let anchor = matched.querySelector("a.message-location");

  toolbox.on("scratchpad-selected", function selected() {
    toolbox.off("scratchpad-selected", selected);

    is(toolbox.getCurrentPanel(), scratchpadPanel,
      "Clicking link switches to Scratchpad panel");

    is(Services.ww.activeWindow, toolbox.frame.ownerGlobal,
       "Scratchpad's toolbox is focused");

    Tools.scratchpad.isTargetSupported = isTargetSupported;
    finish();
  });

  EventUtils.synthesizeMouse(anchor, 2, 2, {}, hud.iframeWindow);
});
