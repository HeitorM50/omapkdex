import QtQuick
import qs.Commons
import qs.Commons as Commons

// Os efeitos de um golpe além do dano, sempre à mostra. Laranja = custo para
// quem usa (trava, recuo, recarga...), verde = vantagem, cinza = regra a saber.
Flow {
  id: root
  property var effects: []
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  spacing: Style.space(3)
  visible: !!effects && effects.length > 0

  Repeater {
    model: root.effects

    Rectangle {
      id: tag
      required property var modelData
      readonly property color tone: modelData.kind === "cost" ? "#e0a060"
                                    : modelData.kind === "bonus" ? "#7cc47c" : Qt.darker(root.foreground, 1.3)

      width: Math.min(label.implicitWidth + Style.space(10), root.width)
      height: label.implicitHeight + Style.space(4)
      radius: Style.space(3)
      color: Qt.rgba(tone.r, tone.g, tone.b, 0.14)
      border.color: Qt.rgba(tone.r, tone.g, tone.b, 0.45)

      Accessible.role: Accessible.StaticText
      Accessible.name: (modelData.kind === "cost" ? "Drawback: " : modelData.kind === "bonus" ? "Bonus: " : "Note: ") + modelData.text

      Text {
        id: label
        anchors.centerIn: parent
        width: parent.width - Style.space(8)
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: (tag.modelData.kind === "cost" ? "! " : tag.modelData.kind === "bonus" ? "+ " : "") + tag.modelData.text
        color: tag.tone
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }
}
