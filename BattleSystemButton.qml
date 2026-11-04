import QtQuick
import qs.Commons
import qs.Commons as Commons

// O único botão para ligar o sistema de batalha: sobe o serviço e, se faltar o
// runtime, instala antes. Some assim que o serviço responde.
BattleButton {
  id: root
  property var agent: null

  primary: true
  visible: !!agent && !agent.initialized
  enabled: !!agent && !agent.busy
  text: agent && agent.busy ? "Turning on…" : "Turn On Battle System"
  onClicked: agent.turnOn()
}
