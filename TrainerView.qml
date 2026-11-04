import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Balance.js" as Balance

// Perfil de batalha: nome, avatar, o time de até 6 e os golpes de cada um.
// Tudo salva ao clicar; não há botão de "salvar".
Column {
  id: root
  property var host: null
  property color foreground: Commons.Color.foreground
  property string fontFamily: Style.font.family

  readonly property var agent: host ? host.battles : null
  readonly property var serviceData: agent ? agent.data : ({})
  readonly property var profile: serviceData.profile || ({})
  readonly property var stats: serviceData.stats || ({})
  readonly property var roster: serviceData.roster || []
  readonly property var history: (serviceData.history || []).slice(0, 3)
  readonly property var team: serviceData.team || ({ size: 0, ok: false, error: "", members: [] })
  readonly property var editor: serviceData.editor || null
  readonly property bool ready: !!agent && agent.initialized && !agent.busy
  readonly property var avatars: [
    { key: "pokeball", label: "Poké Ball" },
    { key: "greatball", label: "Great Ball" },
    { key: "ultraball", label: "Ultra Ball" }
  ]

  // O time guardado pode citar um Pokémon que saiu da coleção; ele some daqui
  // e o próximo salvamento já grava a lista limpa.
  readonly property var teamList: (profile.team || []).filter(function (t) {
    return roster.some(function (r) { return r.companionId === t.companionId })
  })

  property string focusId: ""
  property bool editing: false
  readonly property var focused: roster.find(function (r) { return r.companionId === focusId })
                                 || (teamList.length > 0
                                     ? roster.find(function (r) { return r.companionId === teamList[0].companionId })
                                     : null)
                                 || roster[0] || null
  readonly property int focusSlot: focused ? slotOf(focused.companionId) : 0
  readonly property var focusMoves: {
    if (!focused) return []
    var m = team.members.find(function (m) { return m.companionId === focused.companionId })
    return m ? m.moves : (focused.moves || [])
  }
  readonly property bool editorLive: editing && !!editor && !!focused && editor.companionId === focused.companionId

  function slotOf(id) {
    for (var i = 0; i < teamList.length; i++)
      if (teamList[i].companionId === id) return i + 1
    return 0
  }

  // Dois indivíduos da mesma espécie são seleções diferentes (IVs próprios);
  // o sufixo só aparece quando a lista seria ambígua.
  function rosterName(entry) {
    var same = roster.filter(function (r) { return r.name === entry.name })
    return same.length > 1 ? entry.name + " #" + String(entry.companionId).slice(-4) : entry.name
  }

  function saveTeam(list) {
    if (ready) agent.command("profile", { team: list })
  }

  function plainTeam() {
    return teamList.map(function (t) { return { companionId: t.companionId, moves: t.moves || null } })
  }

  function toggleMember(id) {
    var list = plainTeam(), i = -1
    for (var n = 0; n < list.length; n++) if (list[n].companionId === id) i = n
    if (i >= 0) list.splice(i, 1)
    else list.push({ companionId: id, moves: null })
    saveTeam(list)
  }

  function setMoves(id, ids) {
    saveTeam(plainTeam().map(function (t) {
      return t.companionId === id ? { companionId: id, moves: ids } : t
    }))
  }

  function toggleMove(moveId) {
    if (!editorLive || focusSlot === 0) return
    var sel = editor.selected.slice(), i = sel.indexOf(moveId)
    if (i >= 0) {
      if (sel.length <= 1) return
      sel.splice(i, 1)
    } else {
      if (sel.length >= 4) return
      sel.push(moveId)
    }
    setMoves(focused.companionId, sel)
  }

  function openEditor() {
    if (!focused || focusSlot === 0) return
    editing = true
    agent.command("edit", { companionId: focused.companionId })
  }

  function closeEditor() {
    if (!editing) return
    editing = false
    if (agent) agent.command("edit", {})
  }

  function commitName() {
    var name = nameField.text.trim()
    if (ready && name.length > 0 && name !== (profile.displayName || ""))
      agent.command("profile", { displayName: name })
  }

  onFocusIdChanged: closeEditor()
  Component.onDestruction: if (editing && agent) agent.command("edit", {})

  spacing: Style.space(8)

  BattleSystemButton {
    width: parent.width
    agent: root.agent
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Row {
    width: parent.width
    spacing: Style.space(6)

    TextField {
      id: nameField
      width: parent.width - avatarRow.width - parent.spacing
      maximumLength: 32
      foreground: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      placeholderText: "Trainer name"
      Accessible.name: "Trainer name"
      Component.onCompleted: text = root.profile.displayName || ""
      onEditingFinished: root.commitName()
    }

    Row {
      id: avatarRow
      spacing: Style.space(2)
      anchors.verticalCenter: nameField.verticalCenter

      Repeater {
        model: root.avatars

        Rectangle {
          id: avatarChip
          required property var modelData
          readonly property bool selected: (root.profile.avatarKey || "pokeball") === modelData.key

          width: Style.space(28)
          height: width
          radius: Style.space(5)
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                         selected ? 0.14 : (avatarHover.hovered ? 0.06 : 0))
          border.color: selected ? Qt.darker(root.foreground, 1.5) : "transparent"

          Accessible.role: Accessible.RadioButton
          Accessible.name: modelData.label
          Accessible.checkable: true
          Accessible.checked: selected

          TrainerAvatar {
            anchors.centerIn: parent
            width: Style.space(20)
            height: width
            avatarKey: avatarChip.modelData.key
            Accessible.ignored: true
          }

          HoverHandler { id: avatarHover }
          TapHandler {
            enabled: root.ready
            onTapped: root.agent.command("profile", { avatarKey: avatarChip.modelData.key })
          }
        }
      }
    }
  }

  Connections {
    target: root.agent
    function onDataChanged() {
      if (!nameField.activeFocus) nameField.text = root.profile.displayName || ""
    }
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    text: root.agent && root.agent.busy && !root.agent.initialized
          ? "Connecting to the battle service…"
          : (root.stats.wins || 0) + " wins · " + (root.stats.losses || 0) + " losses · "
            + (root.stats.draws || 0) + " draws · "
            + Balance.formatTokens(root.serviceData.wallet ? root.serviceData.wallet.available : 0)
            + " available"
  }

  PanelSeparator { foreground: root.foreground }

  // ---------- Time ----------
  Item {
    width: parent.width
    height: teamTitle.implicitHeight

    PanelSectionHeader {
      id: teamTitle
      anchors.left: parent.left
      text: "Team " + root.teamList.length + "/6"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    BattleText {
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      foreground: root.foreground
      fontFamily: root.fontFamily
      dim: !(!root.team.ok && root.team.size >= 3)
      urgent: !root.team.ok && root.team.size >= 3
      wrapMode: Text.NoWrap
      text: root.team.ok ? "Ready · you bring 3 of these to each battle"
            : (root.team.size >= 3 ? root.team.error : "Pick at least 3 Pokémon")
    }
  }

  Row {
    id: slots
    width: parent.width
    spacing: Style.space(4)

    Repeater {
      model: 6

      Rectangle {
        id: slot
        required property int index
        readonly property var member: index < root.teamList.length
          ? root.roster.find(function (r) { return r.companionId === root.teamList[index].companionId }) : null

        width: (slots.width - slots.spacing * 5) / 6
        height: Style.space(52)
        radius: Style.space(5)
        color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                       member ? (member.companionId === (root.focused ? root.focused.companionId : "") ? 0.14 : 0.07) : 0)
        border.color: member ? "transparent" : Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.2)

        Accessible.role: Accessible.Button
        Accessible.name: member ? "Team slot " + (index + 1) + ", " + member.name : "Empty team slot " + (index + 1)

        Image {
          anchors.top: parent.top
          anchors.topMargin: Style.space(4)
          anchors.horizontalCenter: parent.horizontalCenter
          width: Style.space(32)
          height: width
          visible: !!slot.member
          source: slot.member ? slot.member.sprite || "" : ""
          sourceSize.width: width * 2
          sourceSize.height: height * 2
          fillMode: Image.PreserveAspectFit
          smooth: false
          Accessible.ignored: true
        }
        Text {
          anchors.centerIn: parent
          visible: !slot.member
          textFormat: Text.PlainText
          text: String(slot.index + 1)
          color: Qt.darker(root.foreground, 2)
          font.family: root.fontFamily
          font.pixelSize: Style.font.subtitle
        }
        Text {
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.space(3)
          anchors.horizontalCenter: parent.horizontalCenter
          width: parent.width - Style.space(4)
          visible: !!slot.member
          horizontalAlignment: Text.AlignHCenter
          textFormat: Text.PlainText
          text: slot.member ? slot.member.name : ""
          color: slot.member ? Balance.rarityColor(slot.member.rarity, root.foreground) : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          elide: Text.ElideRight
        }

        HoverHandler { id: slotHover }
        TapHandler { enabled: !!slot.member; onTapped: root.focusId = slot.member.companionId }
      }
    }
  }

  PanelSeparator { foreground: root.foreground }

  PanelSectionHeader {
    text: "Your Pokémon"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  // A lista de Pokémon rola por conta própria: três linhas (seis Pokémon) por vez.
  Controls.ScrollView {
    id: rosterScroll
    width: parent.width
    height: Math.min(rosterList.implicitHeight, Style.space(40) * 3 + Style.space(2) * 2)
    // Largura fixa, com a faixa da barra reservada (ver Panel.qml).
    contentWidth: width - Style.space(10)
    contentHeight: rosterList.implicitHeight
    clip: true
    visible: root.roster.length > 0
    Controls.ScrollBar.horizontal.policy: Controls.ScrollBar.AlwaysOff

    Grid {
      id: rosterList
      width: rosterScroll.width - Style.space(10)
      columns: width >= Style.space(260) ? 2 : 1
      columnSpacing: Style.space(6)
      rowSpacing: Style.space(2)

      Repeater {
        model: root.roster

        Rectangle {
          id: row
          required property var modelData
          readonly property bool focusedRow: !!root.focused && modelData.companionId === root.focused.companionId
          readonly property int slotNumber: root.slotOf(modelData.companionId)

          width: (rosterList.width - (rosterList.columns - 1) * rosterList.columnSpacing) / rosterList.columns
          height: Style.space(40)
          radius: Style.space(5)
          color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                         focusedRow ? 0.14 : (rowHover.hovered ? 0.06 : 0))

          Accessible.role: Accessible.Button
          Accessible.name: root.rosterName(modelData) + ", level " + modelData.level
                           + (slotNumber ? ", team slot " + slotNumber : "")

          HoverHandler { id: rowHover }
          TapHandler { onTapped: root.focusId = row.modelData.companionId }

          // Entra/sai do time sem tirar o foco do resumo.
          Rectangle {
            id: member
            anchors.left: parent.left
            anchors.leftMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(18)
            height: width
            radius: width / 2
            color: row.slotNumber ? Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.8) : "transparent"
            border.color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, row.slotNumber ? 0.8 : 0.35)

            Accessible.role: Accessible.CheckBox
            Accessible.name: row.slotNumber ? "Remove from team" : "Add to team"
            Accessible.checkable: true
            Accessible.checked: row.slotNumber > 0

            Text {
              anchors.centerIn: parent
              visible: row.slotNumber > 0
              textFormat: Text.PlainText
              text: String(row.slotNumber)
              color: Commons.Color.background
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            TapHandler { enabled: root.ready; onTapped: root.toggleMember(row.modelData.companionId) }
          }

          Image {
            id: icon
            anchors.left: member.right
            anchors.leftMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(24)
            height: width
            source: row.modelData.sprite || ""
            sourceSize.width: width * 2
            sourceSize.height: height * 2
            fillMode: Image.PreserveAspectFit
            smooth: false
            Accessible.ignored: true
          }

          // Nome numa linha e nível + tipos na outra: a lista continua em duas colunas
          // na largura estreita, sem cortar o nome.
          Column {
            anchors.left: icon.right
            anchors.leftMargin: Style.space(6)
            anchors.right: parent.right
            anchors.rightMargin: Style.space(4)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(1)

            Text {
              width: parent.width
              textFormat: Text.PlainText
              text: root.rosterName(row.modelData)
              color: Balance.rarityColor(row.modelData.rarity, root.foreground)
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
              font.bold: row.focusedRow
              elide: Text.ElideRight
            }
            Row {
              spacing: Style.space(4)
              Text {
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.PlainText
                text: "Lv " + row.modelData.level
                color: Qt.darker(root.foreground, 1.4)
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
              Repeater {
                model: row.modelData.types || []
                TypeBadge { required property string modelData; type: modelData; fontFamily: root.fontFamily }
              }
            }
          }
        }
      }
    }
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    visible: root.roster.length === 0
    text: "No eligible Pokémon yet. Hatch your egg first; unrevealed Ditto and released Pokémon cannot battle."
  }

  PanelSeparator { foreground: root.foreground; visible: !!root.focused }

  PokemonSummary {
    width: parent.width
    pokemon: root.focused
    moves: root.focusMoves
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Row {
    width: parent.width
    spacing: Style.space(6)
    visible: !!root.focused

    BattleButton {
      width: (parent.width - parent.spacing) / 2
      foreground: root.foreground
      fontFamily: root.fontFamily
      primary: root.focusSlot === 0
      text: root.focusSlot > 0 ? "Remove from team" : "Add to team"
      enabled: root.ready && (root.focusSlot > 0 || root.teamList.length < 6)
      onClicked: root.toggleMember(root.focused.companionId)
    }
    BattleButton {
      width: (parent.width - parent.spacing) / 2
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: root.editing ? "Done editing moves" : "Edit moves"
      enabled: root.ready && root.focusSlot > 0
      onClicked: root.editing ? root.closeEditor() : root.openEditor()
    }
  }

  Column {
    width: parent.width
    spacing: Style.space(6)
    visible: root.editorLive

    BattleText {
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      dim: true
      text: root.editorLive
            ? "Pick 1 to 4 moves. Only what it learns by Lv " + root.editor.level
              + " (level-up, Gen 5) is offered." + (root.editor.custom ? "" : " Showing the default set.")
            : ""
    }

    GridLayout {
      id: learnGrid
      width: parent.width
      columns: width >= Style.space(480) ? 3 : 2
      columnSpacing: Style.space(6)
      rowSpacing: Style.space(4)
      uniformCellWidths: true

      Repeater {
        model: root.editorLive ? root.editor.moves : []

        MoveChip {
          required property var modelData
          move: modelData
          interactive: true
          selected: root.editorLive && root.editor.selected.indexOf(modelData.id) >= 0
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: root.toggleMove(modelData.id)
        }
      }
    }

    BattleButton {
      subtle: true
      width: parent.width
      foreground: root.foreground
      fontFamily: root.fontFamily
      text: "Reset to the default moves"
      visible: root.editorLive && root.editor.custom
      enabled: root.ready
      onClicked: root.setMoves(root.focused.companionId, null)
    }
  }

  PanelSeparator { foreground: root.foreground; visible: root.history.length > 0 }

  PanelSectionHeader {
    visible: root.history.length > 0
    text: "Recent battles"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Repeater {
    model: root.history

    Item {
      id: entry
      required property var modelData
      width: root.width
      height: Style.space(24)

      Text {
        anchors.left: parent.left
        anchors.right: watch.left
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: entry.modelData.result.toUpperCase() + " · " + entry.modelData.opponent
              + (entry.modelData.stake ? " · " + Balance.formatTokens(entry.modelData.stake) : " · friendly")
        color: entry.modelData.result === "loss" ? Commons.Color.urgent : root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }

      BattleButton {
        id: watch
        anchors.right: recover.left
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(64)
        subtle: true
        text: "Replay"
        foreground: root.foreground
        fontFamily: root.fontFamily
        enabled: root.ready
        Accessible.name: "Watch the replay against " + entry.modelData.opponent
        onClicked: {
          root.agent.command("replay", { matchId: entry.modelData.matchId, step: 0 })
          if (root.host) root.host.openTab(6)
        }
      }

      BattleButton {
        id: recover
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: Style.space(64)
        subtle: true
        text: "Recover"
        foreground: root.foreground
        fontFamily: root.fontFamily
        enabled: root.ready
        Accessible.name: "Recover saved result with " + entry.modelData.opponent
        onClicked: {
          root.agent.command("recover", { matchId: entry.modelData.matchId })
          if (root.host) root.host.openTab(6)
        }
      }
    }
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    dim: true
    visible: root.roster.length > 0
    text: "Only the 6 Pokémon of your team are shared, and only after pairing."
  }

  BattleText {
    width: parent.width
    foreground: root.foreground
    fontFamily: root.fontFamily
    urgent: true
    visible: !!text
    text: root.agent ? (root.agent.error || root.serviceData.error || "") : "Battle service unavailable"
  }

}
