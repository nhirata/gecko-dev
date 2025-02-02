/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-bug-632275-getters.html";

var getterValue = null;

function test() {
  loadTab(TEST_URI).then(() => {
    openConsole().then(consoleOpened);
  });
}

function consoleOpened(hud) {
  let doc = content.wrappedJSObject.document;
  getterValue = doc.foobar._val;
  hud.jsterm.execute("console.dir(document)");

  let onOpen = onViewOpened.bind(null, hud);
  hud.jsterm.once("variablesview-fetched", onOpen);
}

function onViewOpened(hud, event, view) {
  let doc = content.wrappedJSObject.document;

  findVariableViewProperties(view, [
    { name: /^(width|height)$/, dontMatch: 1 },
    { name: "foobar._val", value: getterValue },
    { name: "foobar.val", isGetter: true },
  ], { webconsole: hud }).then(function() {
    is(doc.foobar._val, getterValue, "getter did not execute");
    is(doc.foobar.val, getterValue + 1, "getter executed");
    is(doc.foobar._val, getterValue + 1, "getter executed (recheck)");

    let textContent = hud.outputNode.textContent;
    is(textContent.indexOf("document.body.client"), -1,
       "no document.width/height warning displayed");

    getterValue = null;
    finishTest();
  });
}
