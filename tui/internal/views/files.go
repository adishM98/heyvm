package views

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/awesome-gocui/gocui"
	"github.com/adishm/heyvm/tui/internal/ipc"
	"github.com/adishm/heyvm/tui/internal/model"
)

const visibleRows = 15

// FilesView manages the Files tab (dual-pane SFTP browser).
type FilesView struct {
	client *ipc.Client
	state  *model.AppState
	gui    *gocui.Gui

	mu            sync.Mutex
	lastClickTime map[string]time.Time
	searchBuf     string
	searching     bool
}

func NewFilesView(client *ipc.Client, state *model.AppState, gui *gocui.Gui) *FilesView {
	return &FilesView{
		client:        client,
		state:         state,
		gui:           gui,
		lastClickTime: make(map[string]time.Time),
	}
}

func (f *FilesView) BindKeys(g *gocui.Gui) {
	g.SetKeybinding(viewDetail, 'p', gocui.ModNone, f.upload)
	g.SetKeybinding(viewDetail, 'g', gocui.ModNone, f.download)
	g.SetKeybinding(viewDetail, 'D', gocui.ModNone, f.deleteFile)
	g.SetKeybinding(viewDetail, '/', gocui.ModNone, f.startSearch)
	g.SetKeybinding(viewDetail, gocui.KeyTab, gocui.ModNone, f.togglePane)
	g.SetKeybinding(viewDetail, 'j', gocui.ModNone, f.navDown)
	g.SetKeybinding(viewDetail, 'k', gocui.ModNone, f.navUp)
	g.SetKeybinding(viewDetail, gocui.KeyEnter, gocui.ModNone, f.enterDir)
	g.SetKeybinding(viewDetail, gocui.KeyBackspace, gocui.ModNone, f.goUp)
	g.SetKeybinding(viewDetail, gocui.KeyBackspace2, gocui.ModNone, f.goUp)
}

// LoadBoth loads both local and remote file listings.
func (f *FilesView) LoadBoth(vmID string) {
	f.state.Mu.Lock()
	localPath := f.state.LocalPath
	remotePath := f.state.RemotePath
	f.state.Mu.Unlock()

	// Load local files.
	localFiles := listLocal(localPath)
	f.state.Mu.Lock()
	f.state.LocalFiles = localFiles
	f.state.Mu.Unlock()

	// Load remote files.
	resp, err := f.client.Request(ipc.ActionListFiles, map[string]interface{}{
		"vm_id": vmID,
		"path":  remotePath,
	})
	if err == nil && resp.Status == "success" {
		var files []model.FileInfo
		if b, e := marshalJSON(resp.Data); e == nil {
			unmarshalJSON(b, &files)
		}
		f.state.Mu.Lock()
		f.state.RemoteFiles = files
		f.state.Mu.Unlock()
	}

	f.gui.Update(func(*gocui.Gui) error { return nil })
}

func (f *FilesView) Render(g *gocui.Gui, state *model.AppState) {
	v, err := g.View(viewDetail)
	if err != nil {
		return
	}
	v.Clear()
	v.Title = " Files "

	state.Mu.Lock()
	localFiles := state.LocalFiles
	remoteFiles := state.RemoteFiles
	localIdx := state.LocalIdx
	remoteIdx := state.RemoteIdx
	focusLeft := state.FileFocusLeft
	localPath := state.LocalPath
	remotePath := state.RemotePath
	transferFile := state.TransferFile
	transferPct := state.TransferPercent
	transferDir := state.TransferDirection
	state.Mu.Unlock()

	w, _ := v.Size()
	half := w / 2

	// Header.
	fmt.Fprintf(v, "%-*s  %s\n", half, "LOCAL: "+localPath, "REMOTE: "+remotePath)
	fmt.Fprintln(v, strings.Repeat("─", w))

	maxRows := visibleRows
	localStart := scrollStart(localIdx, maxRows)
	remoteStart := scrollStart(remoteIdx, maxRows)

	for i := 0; i < maxRows; i++ {
		var leftLine, rightLine string

		li := localStart + i
		if li < len(localFiles) {
			fi := localFiles[li]
			name := fileIcon(fi) + fi.Name
			selected := li == localIdx && focusLeft
			leftLine = fmt.Sprintf("%-*s", half, truncate(name, half))
			if selected {
				leftLine = "\x1b[7m" + leftLine + "\x1b[m"
			}
		} else {
			leftLine = strings.Repeat(" ", half)
		}

		ri := remoteStart + i
		if ri < len(remoteFiles) {
			fi := remoteFiles[ri]
			name := fileIcon(fi) + fi.Name
			selected := ri == remoteIdx && !focusLeft
			rightLine = truncate(name, half)
			if selected {
				rightLine = "\x1b[7m" + rightLine + "\x1b[m"
			}
		}

		fmt.Fprintf(v, "%s  %s\n", leftLine, rightLine)
	}

	// Separator and footer.
	fmt.Fprintln(v, strings.Repeat("─", w))
	if transferFile != "" {
		fmt.Fprintf(v, " %s %s %.0f%%\n", transferDir, transferFile, transferPct)
	} else {
		fmt.Fprintln(v, " p:upload  g:download  D:delete  /:search  Tab:switch pane  j/k:nav  Enter:open")
	}
}

func (f *FilesView) togglePane(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	f.state.FileFocusLeft = !f.state.FileFocusLeft
	f.state.Mu.Unlock()
	return nil
}

func (f *FilesView) navDown(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	if f.state.FileFocusLeft {
		if f.state.LocalIdx < len(f.state.LocalFiles)-1 {
			f.state.LocalIdx++
		}
	} else {
		if f.state.RemoteIdx < len(f.state.RemoteFiles)-1 {
			f.state.RemoteIdx++
		}
	}
	f.state.Mu.Unlock()
	return nil
}

func (f *FilesView) navUp(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	if f.state.FileFocusLeft {
		if f.state.LocalIdx > 0 {
			f.state.LocalIdx--
		}
	} else {
		if f.state.RemoteIdx > 0 {
			f.state.RemoteIdx--
		}
	}
	f.state.Mu.Unlock()
	return nil
}

func (f *FilesView) enterDir(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	focusLeft := f.state.FileFocusLeft
	vmID := f.state.VMID
	f.state.Mu.Unlock()

	if focusLeft {
		f.state.Mu.Lock()
		idx := f.state.LocalIdx
		files := f.state.LocalFiles
		f.state.Mu.Unlock()
		if idx < len(files) && files[idx].IsDir {
			f.state.Mu.Lock()
			f.state.LocalPath = files[idx].Path
			f.state.LocalIdx = 0
			f.state.Mu.Unlock()
			go f.LoadBoth(vmID)
		}
	} else {
		f.state.Mu.Lock()
		idx := f.state.RemoteIdx
		files := f.state.RemoteFiles
		f.state.Mu.Unlock()
		if idx < len(files) && files[idx].IsDir {
			f.state.Mu.Lock()
			f.state.RemotePath = files[idx].Path
			f.state.RemoteIdx = 0
			f.state.Mu.Unlock()
			go f.LoadBoth(vmID)
		}
	}
	return nil
}

func (f *FilesView) goUp(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	focusLeft := f.state.FileFocusLeft
	vmID := f.state.VMID
	f.state.Mu.Unlock()

	if focusLeft {
		f.state.Mu.Lock()
		f.state.LocalPath = filepath.Dir(f.state.LocalPath)
		f.state.LocalIdx = 0
		f.state.Mu.Unlock()
	} else {
		f.state.Mu.Lock()
		parts := strings.Split(strings.TrimRight(f.state.RemotePath, "/"), "/")
		if len(parts) > 1 {
			f.state.RemotePath = strings.Join(parts[:len(parts)-1], "/")
			if f.state.RemotePath == "" {
				f.state.RemotePath = "/"
			}
		}
		f.state.RemoteIdx = 0
		f.state.Mu.Unlock()
	}
	go f.LoadBoth(vmID)
	return nil
}

func (f *FilesView) upload(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	idx := f.state.LocalIdx
	localFiles := f.state.LocalFiles
	remotePath := f.state.RemotePath
	vmID := f.state.VMID
	f.state.Mu.Unlock()

	if idx >= len(localFiles) {
		return nil
	}
	fi := localFiles[idx]
	dest := remotePath
	if !strings.HasSuffix(dest, "/") {
		dest += "/"
	}
	dest += fi.Name

	go func() {
		f.client.Request(ipc.ActionUploadFile, map[string]interface{}{
			"vm_id":       vmID,
			"local_path":  fi.Path,
			"remote_path": dest,
		})
		f.LoadBoth(vmID)
	}()
	return nil
}

func (f *FilesView) download(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	idx := f.state.RemoteIdx
	remoteFiles := f.state.RemoteFiles
	localPath := f.state.LocalPath
	vmID := f.state.VMID
	f.state.Mu.Unlock()

	if idx >= len(remoteFiles) {
		return nil
	}
	fi := remoteFiles[idx]
	dest := filepath.Join(localPath, fi.Name)

	go func() {
		f.client.Request(ipc.ActionDownloadFile, map[string]interface{}{
			"vm_id":       vmID,
			"remote_path": fi.Path,
			"local_path":  dest,
		})
		f.LoadBoth(vmID)
	}()
	return nil
}

func (f *FilesView) deleteFile(g *gocui.Gui, _ *gocui.View) error {
	f.state.Mu.Lock()
	focusLeft := f.state.FileFocusLeft
	vmID := f.state.VMID
	f.state.Mu.Unlock()

	if focusLeft {
		// Local delete not supported via IPC — skip.
		return nil
	}

	f.state.Mu.Lock()
	idx := f.state.RemoteIdx
	files := f.state.RemoteFiles
	f.state.Mu.Unlock()
	if idx >= len(files) {
		return nil
	}
	fi := files[idx]

	f.state.Mu.Lock()
	f.state.ConfirmMsg = fmt.Sprintf("Delete remote %q? (y/n)", fi.Name)
	f.state.ConfirmOpen = true
	f.state.ConfirmYes = func() {
		go func() {
			f.client.Request(ipc.ActionDeleteFile, map[string]interface{}{
				"vm_id": vmID,
				"path":  fi.Path,
			})
			f.LoadBoth(vmID)
		}()
	}
	f.state.ConfirmNo = nil
	f.state.Mu.Unlock()
	return nil
}

func (f *FilesView) startSearch(g *gocui.Gui, _ *gocui.View) error {
	// TODO: implement interactive search overlay.
	return nil
}

// listLocal returns files in a local directory.
func listLocal(path string) []model.FileInfo {
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil
	}
	var files []model.FileInfo
	for _, e := range entries {
		info, _ := e.Info()
		size := int64(0)
		modTime := ""
		if info != nil {
			size = info.Size()
			modTime = info.ModTime().Format("2006-01-02 15:04")
		}
		files = append(files, model.FileInfo{
			Name:    e.Name(),
			Path:    filepath.Join(path, e.Name()),
			Size:    size,
			IsDir:   e.IsDir(),
			ModTime: modTime,
		})
	}
	return files
}

func fileIcon(fi model.FileInfo) string {
	if fi.IsDir {
		return "📁 "
	}
	return "  "
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}

func scrollStart(idx, visible int) int {
	if idx < visible {
		return 0
	}
	return idx - visible + 1
}
