package main

import (
	douyin "github.com/jwwsjlm/douyinLive/v2"
	"github.com/jwwsjlm/douyinlive-proto/generated/new_douyin"
	"strings"
	"testing"
	"time"
)

func TestMonitorNonchatIsVisibleAndReadyCannotOverwrite(t *testing.T) {
	now := time.UnixMilli(10000)
	var reports []captureStatus
	monitor := newCaptureMonitor(func() time.Time { return now }, func(value any) { reports = append(reports, value.(captureStatus)) })
	defer monitor.stop()
	monitor.observe(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastMemberMessage}})
	if len(reports) != 1 || reports[0].ReceivedMessages != 1 || reports[0].ReceivedComments != 0 || reports[0].LastMessageAt != 10000 || !strings.Contains(reports[0].Message, "暂无评论") {
		t.Fatalf("nonchat missing: %+v", reports)
	}
	monitor.ready()
	if len(reports) != 1 {
		t.Fatal("Ready overwrote already received state")
	}
}
func TestMonitorCountsRawChatDecodedAndDecodeFailuresWithoutRawData(t *testing.T) {
	now := time.UnixMilli(10000)
	var reports []captureStatus
	monitor := newCaptureMonitor(func() time.Time { return now }, func(value any) { reports = append(reports, value.(captureStatus)) })
	defer monitor.stop()
	decodeCalls := 0
	monitor.decode = func(message *douyin.LiveMessage) bool { decodeCalls++; return len(message.GetPayload()) > 0 }
	monitor.observe(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastChatMessage, Payload: []byte("private raw")}})
	first := reports[0]
	if first.State != "receiving" || first.ReceivedMessages != 1 || first.ReceivedComments != 1 || first.DecodedComments != 1 || first.DecodeErrors != 0 || first.LastCommentAt != 10000 {
		t.Fatalf("wrong decoded state: %+v", first)
	}
	now = now.Add(time.Second)
	monitor.observe(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastChatMessage}})
	last := reports[len(reports)-1]
	if last.ReceivedComments != 2 || last.DecodedComments != 1 || last.DecodeErrors != 1 || !strings.Contains(last.Message, "解析失败") || strings.Contains(last.Message, "private") {
		t.Fatalf("wrong error state: %+v", last)
	}
	if decodeCalls != 2 {
		t.Fatalf("wrong decoder calls: %d", decodeCalls)
	}
}
func TestMonitorFailedChatIsAnExplicitError(t *testing.T) {
	var result captureStatus
	monitor := newCaptureMonitor(time.Now, func(value any) { result = value.(captureStatus) })
	defer monitor.stop()
	monitor.decode = func(*douyin.LiveMessage) bool { return false }
	monitor.observe(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastChatMessage}})
	if result.State != "error" || result.DecodeErrors != 1 || result.ReceivedComments != 1 {
		t.Fatalf("failure hidden: %+v", result)
	}
}
func TestMonitorThrottlesAndFlushesTheFinalPendingUpdate(t *testing.T) {
	now := time.UnixMilli(10000)
	var reports []captureStatus
	monitor := newCaptureMonitor(func() time.Time { return now }, func(value any) { reports = append(reports, value.(captureStatus)) })
	defer monitor.stop()
	monitor.ready()
	monitor.decode = func(*douyin.LiveMessage) bool { return true }
	now = now.Add(100 * time.Millisecond)
	monitor.observe(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastChatMessage}})
	if len(reports) != 1 {
		t.Fatal("status exceeded once-per-second limit")
	}
	now = now.Add(900 * time.Millisecond)
	monitor.flush()
	if len(reports) != 2 || reports[1].DecodedComments != 1 {
		t.Fatalf("final count was not flushed: %+v", reports)
	}
	monitor.ready()
	if len(reports) != 2 {
		t.Fatal("Ready overwrote receiving")
	}
}
