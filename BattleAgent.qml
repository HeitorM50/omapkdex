import QtQuick
import Quickshell.Io

QtObject {
  id: root
  property string pluginDir: ""
  property bool active: false
  property var data: ({})
  property string error: ""
  property bool initialized: false
  property var queue: []
  readonly property bool busy: ensureProc.running || commandProc.running || setupProc.running

  onActiveChanged: if (active) ensure()
  function parse(raw) {
    try {
      var value = JSON.parse(String(raw || ""))
      if (value.error) { error = value.error; return false }
      data = value
      return true
    } catch (e) { error = "Battle service unavailable. Install the battle runtime or try again."; return false }
  }
  function ensure() {
    if (busy) return
    if (!initialized) ensureProc.running = true
    else poll()
  }
  function poll() { if (!busy && !pollProc.running && initialized) pollProc.running = true }
  function command(op, args) {
    queue = queue.concat([{op: op, args: args || {}}])
    if (!initialized) ensure()
    else pump()
  }
  function pump() {
    if (busy || !initialized || queue.length === 0) return
    error = ""
    commandProc.operation = queue[0].op
    commandProc.payload = JSON.stringify(queue[0].args)
    commandProc.running = true
  }
  function install() { if (!busy) { error = ""; setupProc.running = true } }

  property Timer pollTimer: Timer {
    interval: 1000; running: root.active && root.initialized; repeat: true
    onTriggered: root.poll()
  }
  property Process ensureProc: Process {
    command: ["node", root.pluginDir + "/battle/cli.mjs", "ensure"]
    stdout: StdioCollector { id: ensureOut; waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(code) { root.initialized = code === 0 && root.parse(ensureOut.text); if (root.initialized) root.pump() }
  }
  property Process pollProc: Process {
    command: ["node", root.pluginDir + "/battle/cli.mjs", "status"]
    stdout: StdioCollector { id: pollOut; waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(code) { if (code === 0) root.parse(pollOut.text); else { root.initialized = false; root.parse(pollOut.text); if (root.active) Qt.callLater(root.ensure) } }
  }
  property Process commandProc: Process {
    property string operation: "status"
    property string payload: "{}"
    command: ["node", root.pluginDir + "/battle/cli.mjs", operation, payload]
    stdout: StdioCollector { id: commandOut; waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(code) { root.parse(commandOut.text); root.queue = root.queue.slice(1); root.pump() }
  }
  property Process setupProc: Process {
    command: ["node", root.pluginDir + "/battle/setup.mjs"]
    stdout: StdioCollector { id: setupOut; waitForEnd: true }
    stderr: StdioCollector { waitForEnd: true }
    onExited: function(code) { if (code === 0) { root.initialized = false; root.ensure() } else root.parse(setupOut.text) }
  }
}
