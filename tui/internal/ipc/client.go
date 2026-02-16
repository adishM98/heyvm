package ipc

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"
)

const requestTimeout = 30 * time.Second

// Client manages JSON-RPC communication with the core process over stdio pipes.
type Client struct {
	enc    *json.Encoder
	mu     sync.Mutex // protects enc and pending map
	nextID int32
	pending map[int]chan Response

	dispatcher *Dispatcher
}

// NewClient creates a Client that writes to w and reads from r.
// It starts a background goroutine to drain r.
func NewClient(w io.Writer, r io.Reader) *Client {
	c := &Client{
		enc:        json.NewEncoder(w),
		pending:    make(map[int]chan Response),
		dispatcher: newDispatcher(),
	}
	go c.readLoop(r)
	return c
}

// Subscribe delegates to the internal dispatcher.
func (c *Client) Subscribe(event string) chan Response {
	return c.dispatcher.Subscribe(event)
}

// Unsubscribe removes a subscription.
func (c *Client) Unsubscribe(event string, ch chan Response) {
	c.dispatcher.Unsubscribe(event, ch)
}

// Send is fire-and-forget — it sends an action without waiting for a response.
func (c *Client) Send(action string, params map[string]interface{}) error {
	req := Request{Action: action, Params: params}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.enc.Encode(req)
}

// Request sends an action and blocks until a matching response arrives (or timeout).
// Must be called from a goroutine, not from gocui's main goroutine.
func (c *Client) Request(action string, params map[string]interface{}) (Response, error) {
	id := int(atomic.AddInt32(&c.nextID, 1))
	ch := make(chan Response, 1)

	c.mu.Lock()
	c.pending[id] = ch
	err := c.enc.Encode(Request{RequestID: id, Action: action, Params: params})
	c.mu.Unlock()

	if err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return Response{}, err
	}

	select {
	case resp := <-ch:
		return resp, nil
	case <-time.After(requestTimeout):
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return Response{}, fmt.Errorf("request timeout for action %q", action)
	}
}

// readLoop drains the core's stdout, routing responses to pending channels or the dispatcher.
func (c *Client) readLoop(r io.Reader) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 1<<20), 1<<20) // 1 MB buffer for large PTY chunks
	for scanner.Scan() {
		var resp Response
		if err := json.Unmarshal(scanner.Bytes(), &resp); err != nil {
			continue
		}

		if resp.Event != "" {
			// Async event — fan out to subscribers.
			c.dispatcher.dispatch(resp)
			continue
		}

		if resp.RequestID != 0 {
			c.mu.Lock()
			ch, ok := c.pending[resp.RequestID]
			if ok {
				delete(c.pending, resp.RequestID)
			}
			c.mu.Unlock()
			if ok {
				select {
				case ch <- resp:
				default:
				}
			}
		}
	}
}
