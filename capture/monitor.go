package main

import (
	"fmt"
	douyin "github.com/jwwsjlm/douyinLive/v2"
	"sync"
	"time"
)

type captureStatus struct {
	Type             string `json:"type"`
	State            string `json:"state"`
	Message          string `json:"message"`
	ReceivedMessages int64  `json:"receivedMessages"`
	ReceivedComments int64  `json:"receivedComments"`
	DecodedComments  int64  `json:"decodedComments"`
	LastMessageAt    int64  `json:"lastMessageAt"`
	LastCommentAt    int64  `json:"lastCommentAt"`
	DecodeErrors     int64  `json:"decodeErrors"`
}
type captureMonitor struct {
	mu         sync.Mutex
	clock      func() time.Time
	publish    func(any)
	decode     func(*douyin.LiveMessage) bool
	counters   captureStatus
	lastReport time.Time
	dirty      bool
	stopped    bool
	timer      *time.Timer
}

func newCaptureMonitor(clock func() time.Time, publish func(any)) *captureMonitor {
	return &captureMonitor{clock: clock, publish: publish, decode: comment, counters: captureStatus{Type: "status"}}
}
func (m *captureMonitor) observe(message *douyin.LiveMessage) {
	if message == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopped {
		return
	}
	now := m.clock()
	m.counters.ReceivedMessages++
	m.counters.LastMessageAt = now.UnixMilli()
	if message.GetMethod() == douyin.WebcastChatMessage {
		m.counters.ReceivedComments++
		m.counters.LastCommentAt = now.UnixMilli()
		if m.decode(message) {
			m.counters.DecodedComments++
		} else {
			m.counters.DecodeErrors++
		}
	}
	m.dirty = true
	m.reportLocked(now)
}
func (m *captureMonitor) ready() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopped || m.counters.ReceivedMessages > 0 || !m.lastReport.IsZero() {
		return
	}
	m.dirty = true
	m.reportLocked(m.clock())
}
func (m *captureMonitor) flush() { m.mu.Lock(); defer m.mu.Unlock(); m.reportLocked(m.clock()) }
func (m *captureMonitor) reportLocked(now time.Time) {
	if m.stopped || !m.dirty {
		return
	}
	if !m.lastReport.IsZero() && now.Sub(m.lastReport) < time.Second {
		if m.timer == nil {
			m.timer = time.AfterFunc(time.Second-now.Sub(m.lastReport), func() { m.mu.Lock(); m.timer = nil; m.reportLocked(m.clock()); m.mu.Unlock() })
		}
		return
	}
	m.lastReport = now
	m.dirty = false
	result := m.counters
	switch {
	case result.DecodedComments > 0:
		result.State = "receiving"
		result.Message = fmt.Sprintf("上游收到 %d 条消息，已解析 %d 条评论", result.ReceivedMessages, result.DecodedComments)
		if result.DecodeErrors > 0 {
			result.Message += fmt.Sprintf("；%d 条评论解析失败", result.DecodeErrors)
		}
	case result.ReceivedComments > 0:
		result.State = "error"
		result.Message = fmt.Sprintf("上游收到 %d 条消息，其中 %d 条评论解析失败，暂时无法展示", result.ReceivedMessages, result.DecodeErrors)
	case result.ReceivedMessages > 0:
		result.State = "running"
		result.Message = fmt.Sprintf("上游已收到 %d 条消息，暂无评论弹幕；采集仍在运行", result.ReceivedMessages)
	default:
		result.State = "running"
		result.Message = "采集运行中，等待弹幕；连接中断时会自动重连"
	}
	m.publish(result)
}
func (m *captureMonitor) stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopped = true
	if m.timer != nil {
		m.timer.Stop()
		m.timer = nil
	}
}
