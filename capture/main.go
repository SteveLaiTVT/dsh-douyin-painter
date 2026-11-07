// Package main is the app-owned capture bridge. It opens no local listener.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	douyin "github.com/jwwsjlm/douyinLive/v2"
	"github.com/jwwsjlm/douyinlive-proto/generated/new_douyin"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var outputMu sync.Mutex

func emit(value any) {
	outputMu.Lock()
	defer outputMu.Unlock()
	_ = json.NewEncoder(os.Stdout).Encode(value)
}
func status(state, message string) {
	emit(map[string]any{"type": "status", "state": state, "message": message})
}

func stringAt(input map[string]any, names ...string) string {
	for _, name := range names {
		if v, exists := input[name]; exists && v != nil {
			return fmt.Sprint(v)
		}
	}
	return ""
}
func objectAt(input map[string]any, name string) map[string]any {
	result, _ := input[name].(map[string]any)
	return result
}
func comment(message *douyin.LiveMessage) bool {
	if message == nil {
		return false
	}
	parsed := message.Parsed
	if parsed == nil {
		if message.GetMethod() != douyin.WebcastChatMessage {
			return false
		}
		chat := &new_douyin.Webcast_Im_ChatMessage{}
		if err := proto.Unmarshal(message.GetPayload(), chat); err != nil {
			return false
		}
		parsed = chat
	}
	bytes, err := protojson.Marshal(parsed)
	if err != nil {
		return false
	}
	var input map[string]any
	if json.Unmarshal(bytes, &input) != nil {
		return false
	}
	text := stringAt(input, "content", "text")
	if strings.TrimSpace(text) == "" {
		return false
	}
	common := objectAt(input, "common")
	user := objectAt(input, "user")
	emit(map[string]any{"type": "comment", "id": stringAt(common, "msgId", "msg_id"), "text": text,
		"nickname": stringAt(user, "nickname", "nickName"), "userId": stringAt(user, "idStr", "id", "id_str"),
		"receivedAt": message.ReceivedAt.UnixMilli()})
	return true
}
func wait(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
func run(ctx context.Context, room, cookie string) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	for ctx.Err() == nil {
		live, err := douyin.NewDouyinLiveWithSlog(room, logger, cookie)
		if err != nil {
			status("error", "无法创建直播间采集，请核对直播间号")
			return
		}
		probeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		probe, err := live.CheckLiveStatus(probeCtx)
		cancel()
		if ctx.Err() != nil {
			live.Dispose()
			return
		}
		if err != nil || probe.Live == nil || !*probe.Live {
			switch {
			case errors.Is(err, douyin.ErrRoomNotFound):
				status("not_found", "没有找到该直播间，请核对直播间链接")
			case err != nil:
				status("error", "无法确认直播间，请核对 live.douyin.com 网页房间号；分享短码、内部 room_id 或上游访问限制都可能导致失败")
			default:
				status("offline", "直播间未开播，正在等待开播…")
			}
			live.Dispose()
			if !wait(ctx, 30*time.Second) {
				return
			}
			continue
		}
		monitor := newCaptureMonitor(time.Now, emit)
		subscription := live.SubscribeMessage(monitor.observe)
		done := make(chan error, 1)
		status("connecting", "直播间已开播，正在建立弹幕连接…")
		ready := live.Ready()
		go func() { done <- live.Start() }()
		select {
		case <-ready:
			monitor.ready()
		case <-ctx.Done():
			monitor.stop()
			live.Unsubscribe(subscription)
			live.Close()
			<-done
			return
		case <-done:
			monitor.stop()
			live.Unsubscribe(subscription)
			live.Dispose()
			status("reconnecting", "弹幕连接失败，稍后重连；如反复失败，请检查抖音登录验证")
			if !wait(ctx, 5*time.Second) {
				return
			}
			continue
		}
		select {
		case <-ctx.Done():
			monitor.stop()
			live.Unsubscribe(subscription)
			live.Close()
			<-done
			return
		case <-done:
			monitor.stop()
			live.Unsubscribe(subscription)
			live.Dispose()
			status("reconnecting", "弹幕连接已断开，正在重连…")
			if !wait(ctx, 5*time.Second) {
				return
			}
		}
	}
}
func main() {
	room := flag.String("room", "", "Douyin live room ID")
	version := flag.Bool("version", false, "Show bridge version")
	flag.Parse()
	if *version {
		fmt.Println("dsh-douyin-painter capture bridge; douyinLive v2.3.2")
		return
	}
	if *room == "" {
		status("error", "缺少直播间号")
		os.Exit(2)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	status("connecting", "正在查询抖音直播间…")
	run(ctx, *room, os.Getenv("PAINTER_CAPTURE_COOKIE"))
	status("stopped", "弹幕采集已停止")
}
