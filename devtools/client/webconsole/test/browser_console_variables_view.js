/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Check that variables view works as expected in the web console.

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-eval-in-stackframe.html";

var gWebConsole, gJSTerm, gVariablesView;

var hud;

add_task(function* () {
  yield loadTab(TEST_URI);

  hud = yield openConsole();

  gWebConsole = hud;
  gJSTerm = hud.jsterm;
  let msg = yield gJSTerm.execute("fooObj");

  ok(msg, "output message found");
  ok(msg.textContent.includes('{ testProp: "testValue" }'),
                              "message text check");

  let anchor = msg.querySelector("a");
  ok(anchor, "object link found");

  let fetched = gJSTerm.once("variablesview-fetched");

  // executeSoon
  EventUtils.synthesizeMouse(anchor, 2, 2, {}, gWebConsole.iframeWindow);

  let view = yield fetched;

  let results = yield onFooObjFetch(view);

  let vView = yield onTestPropFound(results);
  let results2 = yield onFooObjFetchAfterUpdate(vView);

  let vView2 = yield onUpdatedTestPropFound(results2);
  let results3 = yield onFooObjFetchAfterPropRename(vView2);

  let vView3 = yield onRenamedTestPropFound(results3);
  let results4 = yield onPropUpdateError(vView3);

  yield onRenamedTestPropFoundAgain(results4);

  let prop = results4[0].matchedProp;
  yield testPropDelete(prop);

  gWebConsole = gJSTerm = gVariablesView = null;
});

function onFooObjFetch(aVar) {
  gVariablesView = aVar._variablesView;
  ok(gVariablesView, "variables view object");

  return findVariableViewProperties(aVar, [
    { name: "testProp", value: "testValue" },
  ], { webconsole: gWebConsole });
}

function onTestPropFound(aResults) {
  let prop = aResults[0].matchedProp;
  ok(prop, "matched the |testProp| property in the variables view");

  is("testValue", aResults[0].value,
     "|fooObj.testProp| value is correct");

  // Check that property value updates work and that jsterm functions can be
  // used.
  return updateVariablesViewProperty({
    property: prop,
    field: "value",
    string: "document.title + window.location + $('p')",
    webconsole: gWebConsole
  });
}

function onFooObjFetchAfterUpdate(aVar) {
  info("onFooObjFetchAfterUpdate");
  let expectedValue = content.document.title + content.location +
                      "[object HTMLParagraphElement]";

  return findVariableViewProperties(aVar, [
    { name: "testProp", value: expectedValue },
  ], { webconsole: gWebConsole });
}

function onUpdatedTestPropFound(aResults) {
  let prop = aResults[0].matchedProp;
  ok(prop, "matched the updated |testProp| property value");

  is(content.wrappedJSObject.fooObj.testProp, aResults[0].value,
     "|fooObj.testProp| value has been updated");

  // Check that property name updates work.
  return updateVariablesViewProperty({
    property: prop,
    field: "name",
    string: "testUpdatedProp",
    webconsole: gWebConsole
  });
}

function onFooObjFetchAfterPropRename(aVar) {
  info("onFooObjFetchAfterPropRename");

  let para = content.wrappedJSObject.document.querySelector("p");
  let expectedValue = content.document.title + content.location + para;

  // Check that the new value is in the variables view.
  return findVariableViewProperties(aVar, [
    { name: "testUpdatedProp", value: expectedValue },
  ], { webconsole: gWebConsole });
}

function onRenamedTestPropFound(aResults) {
  let prop = aResults[0].matchedProp;
  ok(prop, "matched the renamed |testProp| property");

  ok(!content.wrappedJSObject.fooObj.testProp,
     "|fooObj.testProp| has been deleted");
  is(content.wrappedJSObject.fooObj.testUpdatedProp, aResults[0].value,
     "|fooObj.testUpdatedProp| is correct");

  // Check that property value updates that cause exceptions are reported in
  // the web console output.
  return updateVariablesViewProperty({
    property: prop,
    field: "value",
    string: "foobarzFailure()",
    webconsole: gWebConsole
  });
}

function onPropUpdateError(aVar) {
  info("onPropUpdateError");

  let para = content.wrappedJSObject.document.querySelector("p");
  let expectedValue = content.document.title + content.location + para;

  // Make sure the property did not change.
  return findVariableViewProperties(aVar, [
    { name: "testUpdatedProp", value: expectedValue },
  ], { webconsole: gWebConsole });
}

function onRenamedTestPropFoundAgain(aResults) {
  let prop = aResults[0].matchedProp;
  ok(prop, "matched the renamed |testProp| property again");

  return waitForMessages({
    webconsole: gWebConsole,
    messages: [{
      name: "exception in property update reported in the web console output",
      text: "foobarzFailure",
      category: CATEGORY_OUTPUT,
      severity: SEVERITY_ERROR,
    }],
  });
}

function testPropDelete(aProp) {
  gVariablesView.window.focus();
  aProp.focus();

  executeSoon(() => {
    EventUtils.synthesizeKey("VK_DELETE", {}, gVariablesView.window);
  });

  return waitForSuccess({
    name: "property deleted",
    timeout: 60000,
    validator: () => !("testUpdatedProp" in content.wrappedJSObject.fooObj)
  });
}
