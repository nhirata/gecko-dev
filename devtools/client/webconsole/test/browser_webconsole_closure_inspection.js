/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that inspecting a closure in the variables view sidebar works when
// execution is paused.

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-closures.html";

var gWebConsole, gJSTerm, gVariablesView;

function test() {
  registerCleanupFunction(() => {
    gWebConsole = gJSTerm = gVariablesView = null;
  });

  function fetchScopes(hud, toolbox, panelWin, deferred) {
    panelWin.once(panelWin.EVENTS.FETCHED_SCOPES, () => {
      ok(true, "Scopes were fetched");
      toolbox.selectTool("webconsole").then(() => consoleOpened(hud));
      deferred.resolve();
    });
  }

  loadTab(TEST_URI).then(() => {
    openConsole().then((hud) => {
      openDebugger().then(({ toolbox, panelWin }) => {
        let deferred = promise.defer();
        fetchScopes(hud, toolbox, panelWin, deferred);

        let button = content.document.querySelector("button");
        ok(button, "button element found");
        EventUtils.synthesizeMouseAtCenter(button, {}, content);

        return deferred.promise;
      });
    });
  });
}

function consoleOpened(hud) {
  gWebConsole = hud;
  gJSTerm = hud.jsterm;
  gJSTerm.execute("window.george.getName");

  waitForMessages({
    webconsole: gWebConsole,
    messages: [{
      text: "function _pfactory/<.getName()",
      category: CATEGORY_OUTPUT,
      objects: true,
    }],
  }).then(onExecuteGetName);
}

function onExecuteGetName(results) {
  let clickable = results[0].clickableElements[0];
  ok(clickable, "clickable object found");

  gJSTerm.once("variablesview-fetched", onGetNameFetch);
  let contextMenu =
      gWebConsole.iframeWindow.document.getElementById("output-contextmenu");
  waitForContextMenu(contextMenu, clickable, () => {
    let openInVarView = contextMenu.querySelector("#menu_openInVarView");
    ok(openInVarView.disabled === false,
       "the \"Open In Variables View\" context menu item should be clickable");
    // EventUtils.synthesizeMouseAtCenter seems to fail here in Mac OSX
    openInVarView.click();
  });
}

function onGetNameFetch(evt, view) {
  gVariablesView = view._variablesView;
  ok(gVariablesView, "variables view object");

  findVariableViewProperties(view, [
    { name: /_pfactory/, value: "" },
  ], { webconsole: gWebConsole }).then(onExpandClosure);
}

function onExpandClosure(results) {
  let prop = results[0].matchedProp;
  ok(prop, "matched the name property in the variables view");

  gVariablesView.window.focus();
  gJSTerm.once("sidebar-closed", finishTest);
  EventUtils.synthesizeKey("VK_ESCAPE", {});
}
