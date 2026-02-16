package ui

import (
	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/model"
)

// StatusColor returns a gocui attribute color for a VM status.
func StatusColor(status model.VMStatus) gocui.Attribute {
	switch status {
	case model.VMStatusConnected:
		return gocui.ColorGreen
	case model.VMStatusConnecting:
		return gocui.ColorYellow
	case model.VMStatusError:
		return gocui.ColorRed
	default:
		return gocui.ColorDefault
	}
}
