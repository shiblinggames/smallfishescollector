class_name Bridge
extends RefCounted

## THE ONE MESSAGE OUT.
##
## The entire contract between this scene and the web app around it: when a
## captain docks, tell the page where. Everything else the app already knows.
##
## Kept behind a helper so the JavaScript only exists in one place and the rest
## of the scene stays testable. Running in the editor there is no browser, so
## this prints instead of failing, which is also what makes headless harnesses
## able to exercise docking.

static func dock(route: String) -> void:
	if route.is_empty():
		return
	if OS.has_feature("web"):
		# postMessage rather than touching parent.location directly: the page
		# owns routing, and Next.js needs to do it through its own router or
		# the client-side navigation and all its state are thrown away.
		var js := "parent.postMessage({type:'dock',to:'%s'},'*')" % route.c_escape()
		JavaScriptBridge.eval(js, true)
	else:
		print("[bridge] dock -> ", route)
