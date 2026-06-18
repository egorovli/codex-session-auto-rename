package rename

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

type appServerClient struct {
	cancel  context.CancelFunc
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	pending map[int]chan jsonRPCResponse
	mu      sync.Mutex
	nextID  int
}

type jsonRPCResponse struct {
	ID     int             `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func ReadThread(config Config, threadID string) (*ThreadRecord, error) {
	var lastErr error
	for _, mode := range []string{"proxy", "stdio"} {
		client, err := startAppServerClient(config, mode)
		if err != nil {
			lastErr = err
			continue
		}
		result, err := client.request("thread/read", map[string]any{
			"threadId":     threadID,
			"includeTurns": false,
		}, time.Duration(config.AppServerTimeoutMs)*time.Millisecond)
		client.close()
		if err != nil {
			lastErr = err
			continue
		}
		return parseThreadReadResult(result), nil
	}
	if lastErr == nil {
		lastErr = errors.New("app-server unavailable")
	}
	return nil, lastErr
}

func SetThreadName(config Config, threadID, name string) error {
	var lastErr error
	for _, mode := range []string{"proxy", "stdio"} {
		client, err := startAppServerClient(config, mode)
		if err != nil {
			lastErr = err
			continue
		}
		_, err = client.request("thread/name/set", map[string]any{
			"threadId": threadID,
			"name":     name,
		}, time.Duration(config.AppServerTimeoutMs)*time.Millisecond)
		client.close()
		if err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("app-server unavailable")
	}
	return lastErr
}

func startAppServerClient(config Config, mode string) (*appServerClient, error) {
	args := []string{"app-server", "proxy"}
	if mode == "stdio" {
		args = []string{"app-server", "--stdio"}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, config.CodexPath, args...)
	cmd.Env = append(os.Environ(), "CODEX_AUTO_RENAME_HOOK=1")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return nil, err
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}
	client := &appServerClient{
		cancel:  cancel,
		cmd:     cmd,
		stdin:   stdin,
		pending: map[int]chan jsonRPCResponse{},
		nextID:  1,
	}
	go client.readLoop(stdout)
	if _, err := client.request("initialize", map[string]any{
		"clientInfo": map[string]any{
			"name":    "codex_auto_thread_title",
			"title":   "Codex Session Auto Rename",
			"version": "0.1.0",
		},
		"capabilities": map[string]any{
			"experimentalApi": true,
		},
	}, time.Duration(config.AppServerTimeoutMs)*time.Millisecond); err != nil {
		client.close()
		return nil, err
	}
	_ = client.send(map[string]any{"method": "initialized", "params": map[string]any{}})
	return client, nil
}

func (client *appServerClient) request(method string, params any, timeout time.Duration) (json.RawMessage, error) {
	client.mu.Lock()
	id := client.nextID
	client.nextID++
	responseCh := make(chan jsonRPCResponse, 1)
	client.pending[id] = responseCh
	client.mu.Unlock()

	if err := client.send(map[string]any{"method": method, "id": id, "params": params}); err != nil {
		client.deletePending(id)
		return nil, err
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case response := <-responseCh:
		if response.Error != nil {
			return nil, errors.New(response.Error.Message)
		}
		return response.Result, nil
	case <-timer.C:
		client.deletePending(id)
		return nil, errors.New("app-server request timed out: " + method)
	}
}

func (client *appServerClient) send(message any) error {
	raw, err := json.Marshal(message)
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	_, err = client.stdin.Write(raw)
	return err
}

func (client *appServerClient) readLoop(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		var response jsonRPCResponse
		if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
			continue
		}
		client.mu.Lock()
		ch := client.pending[response.ID]
		delete(client.pending, response.ID)
		client.mu.Unlock()
		if ch != nil {
			ch <- response
		}
	}
	client.mu.Lock()
	for id, ch := range client.pending {
		delete(client.pending, id)
		ch <- jsonRPCResponse{Error: &struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		}{Code: -1, Message: "app-server process exited"}}
	}
	client.mu.Unlock()
}

func (client *appServerClient) deletePending(id int) {
	client.mu.Lock()
	delete(client.pending, id)
	client.mu.Unlock()
}

func (client *appServerClient) close() {
	client.cancel()
	_ = client.stdin.Close()
	_ = client.cmd.Wait()
}

func parseThreadReadResult(raw json.RawMessage) *ThreadRecord {
	if len(raw) == 0 {
		return nil
	}
	var direct ThreadRecord
	if err := json.Unmarshal(raw, &direct); err == nil && direct.ID != "" {
		return &direct
	}
	var wrapped struct {
		Thread ThreadRecord `json:"thread"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil && wrapped.Thread.ID != "" {
		return &wrapped.Thread
	}
	return nil
}
