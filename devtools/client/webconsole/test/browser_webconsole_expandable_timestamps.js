/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test for the message timestamps option: check if the preference toggles the
// display of messages in the console output. See bug 722267.

"use strict";

const TEST_URI = "data:text/html;charset=utf-8,Web Console test for " +
                 "bug 722267 - preference for toggling timestamps in messages";
const PREF_MESSAGE_TIMESTAMP = "devtools.webconsole.timestampMessages";
var hud;

add_task(function* () {
  yield loadTab(TEST_URI);

  hud = yield openConsole();
  let panel = yield consoleOpened();

  yield onOptionsPanelSelected(panel);
  onPrefChanged();

  Services.prefs.clearUserPref(PREF_MESSAGE_TIMESTAMP);
  hud = null;
});

function consoleOpened() {
  info("console opened");
  let prefValue = Services.prefs.getBoolPref(PREF_MESSAGE_TIMESTAMP);
  ok(!prefValue, "messages have no timestamp by default (pref check)");
  ok(hud.outputNode.classList.contains("hideTimestamps"),
     "messages have no timestamp (class name check)");

  let toolbox = gDevTools.getToolbox(hud.target);
  return toolbox.selectTool("options");
}

function onOptionsPanelSelected(panel) {
  info("options panel opened");

  let prefChanged = gDevTools.once("pref-changed", onPrefChanged);

  let checkbox = panel.panelDoc.getElementById("webconsole-timestamp-messages");
  checkbox.click();

  return prefChanged;
}

function onPrefChanged() {
  info("pref changed");
  let prefValue = Services.prefs.getBoolPref(PREF_MESSAGE_TIMESTAMP);
  ok(prefValue, "messages have timestamps (pref check)");
  ok(!hud.outputNode.classList.contains("hideTimestamps"),
     "messages have timestamps (class name check)");
}
