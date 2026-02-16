package ipc

import "sync"

// Dispatcher fans out async events to registered subscribers.
type Dispatcher struct {
	mu   sync.RWMutex
	subs map[string][]chan Response
}

func newDispatcher() *Dispatcher {
	return &Dispatcher{subs: make(map[string][]chan Response)}
}

// Subscribe returns a buffered channel that receives events for the given event name.
func (d *Dispatcher) Subscribe(event string) chan Response {
	ch := make(chan Response, 64)
	d.mu.Lock()
	d.subs[event] = append(d.subs[event], ch)
	d.mu.Unlock()
	return ch
}

// Unsubscribe removes a previously subscribed channel.
func (d *Dispatcher) Unsubscribe(event string, ch chan Response) {
	d.mu.Lock()
	defer d.mu.Unlock()
	list := d.subs[event]
	for i, c := range list {
		if c == ch {
			d.subs[event] = append(list[:i], list[i+1:]...)
			break
		}
	}
}

// dispatch sends a response to all subscribers of its event (non-blocking).
func (d *Dispatcher) dispatch(r Response) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	for _, ch := range d.subs[r.Event] {
		select {
		case ch <- r:
		default:
		}
	}
}
