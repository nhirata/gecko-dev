/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that the Web Console shows weak crypto warnings (SHA-1 Certificate, SSLv3, and RC4)

"use strict";

const TEST_URI = "data:text/html;charset=utf8,Web Console weak crypto " +
                 "warnings test";
const TEST_URI_PATH = "/browser/devtools/client/webconsole/test/" +
                      "test-certificate-messages.html";

var gWebconsoleTests = [
  {url: "https://sha1ee.example.com" + TEST_URI_PATH,
   name: "SHA1 warning displayed successfully",
   warning: ["SHA-1"], nowarning: ["SSL 3.0", "RC4"]},
  {url: "https://rc4.example.com" + TEST_URI_PATH,
   name: "RC4 warning displayed successfully",
   pref: [["security.tls.insecure_fallback_hosts", "rc4.example.com"]],
   warning: ["RC4"], nowarning: ["SHA-1", "SSL 3.0"]},
  {url: "https://rc4.example.com" + TEST_URI_PATH + "?",
   name: "Unrestricted RC4 fallback worked",
   pref: [["security.tls.unrestricted_rc4_fallback", true]],
   warning: ["RC4"], nowarning: ["SHA-1", "SSL 3.0"]},
  {url: "https://sha256ee.example.com" + TEST_URI_PATH,
   name: "SSL warnings appropriately not present",
   warning: [], nowarning: ["SHA-1", "SSL 3.0", "RC4"]},
];
const TRIGGER_MSG = "If you haven't seen ssl warnings yet, you won't";

var gHud = undefined, gContentBrowser;
var gCurrentTest;

function test() {
  registerCleanupFunction(function() {
    gHud = gContentBrowser = null;
  });

  loadTab(TEST_URI).then(({browser}) => {
    gContentBrowser = browser;
    openConsole().then(runTestLoop);
  });
}

function runTestLoop(theHud) {
  gCurrentTest = gWebconsoleTests.shift();
  if (!gCurrentTest) {
    finishTest();
    return;
  }
  if (!gHud) {
    gHud = theHud;
  }
  gHud.jsterm.clearOutput();
  gContentBrowser.addEventListener("load", onLoad, true);
  if (gCurrentTest.pref) {
    SpecialPowers.pushPrefEnv({"set": gCurrentTest.pref},
      function() {
        content.location = gCurrentTest.url;
      });
  } else {
    content.location = gCurrentTest.url;
  }
}

function onLoad() {
  gContentBrowser.removeEventListener("load", onLoad, true);

  waitForSuccess({
      name: gCurrentTest.name,
      validator: function() {
        if (gHud.outputNode.textContent.indexOf(TRIGGER_MSG) >= 0) {
          for (let warning of gCurrentTest.warning) {
            if (gHud.outputNode.textContent.indexOf(warning) < 0) {
              return false;
            }
          }
          for (let nowarning of gCurrentTest.nowarning) {
            if (gHud.outputNode.textContent.indexOf(nowarning) >= 0) {
              return false;
            }
          }
          return true;
        }
      }
    }).then(runTestLoop);
}
