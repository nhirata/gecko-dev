/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A for-of loop in Web Console code can loop over a content NodeList.

"use strict";

const TEST_URI = "http://example.com/browser/devtools/client/webconsole/" +
                 "test/test-for-of.html";

add_task(function* () {
  yield loadTab(TEST_URI);

  let hud = yield openConsole();
  yield testForOf(hud);
});

function testForOf(hud) {
  let deferred = promise.defer();

  let jsterm = hud.jsterm;
  jsterm.execute("{ let _nodes = []; for (let x of document.body.childNodes) { if (x.nodeType === 1) { _nodes.push(x.tagName); } } _nodes.join(' '); }",
    (node) => {
      ok(/H1 DIV H2 P/.test(node.textContent),
        "for-of loop should find all top-level nodes");
      deferred.resolve();
    });

  return deferred.promise;
}
