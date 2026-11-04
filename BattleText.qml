import QtQuick
import qs.Commons
import qs.Commons as Commons

// Texto corrido das abas Trainer e Battle: PlainText sempre (nomes e
// endereços vêm da rede) e a fonte do painel, não a do estilo global.
Text {
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family
  property bool dim: false
  property bool urgent: false

  textFormat: Text.PlainText
  wrapMode: Text.WordWrap
  color: urgent ? Commons.Color.urgent : (dim ? Qt.darker(foreground, 1.4) : foreground)
  font.family: fontFamily
  font.pixelSize: Style.font.caption
}
