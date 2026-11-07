package main

import (
	"encoding/json"
	"google.golang.org/protobuf/proto"
	"io"
	"os"
	"testing"
	"time"

	douyin "github.com/jwwsjlm/douyinLive/v2"
	"github.com/jwwsjlm/douyinlive-proto/generated/new_douyin"
)

func TestCommentPreservesProtoUint64Identity(t *testing.T) {
	original := os.Stdout
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = write
	defer func() { os.Stdout = original; read.Close(); write.Close() }()
	comment(&douyin.LiveMessage{
		Parsed: &new_douyin.Webcast_Im_ChatMessage{
			Content: "画一只猫", Common: &new_douyin.Webcast_Im_Common{MsgId: 1234567890123456789},
			User: &new_douyin.Webcast_Data_User{Id: 1234567890123456789, Nickname: "小猫"},
		},
		ReceivedAt: time.UnixMilli(12345),
	})
	write.Close()
	bytes, err := io.ReadAll(read)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(bytes, &result); err != nil {
		t.Fatal(err)
	}
	if result["id"] != "1234567890123456789" || result["userId"] != "1234567890123456789" || result["text"] != "画一只猫" || result["nickname"] != "小猫" {
		t.Fatalf("wrong payload: %s", bytes)
	}
}

// The upstream dispatches ordinary messages as Raw payloads with Parsed:nil.
func TestRawChatPayloadIsDecoded(t *testing.T) {
	original := os.Stdout
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = write
	defer func() { os.Stdout = original; read.Close(); write.Close() }()
	payload, err := proto.Marshal(&new_douyin.Webcast_Im_ChatMessage{Content: "真实原始弹幕路径", Common: &new_douyin.Webcast_Im_Common{MsgId: 1234567890123456789}, User: &new_douyin.Webcast_Data_User{Id: 987654321012345678, Nickname: "观众"}})
	if err != nil {
		t.Fatal(err)
	}
	comment(&douyin.LiveMessage{Raw: &new_douyin.Webcast_Im_Message{Method: douyin.WebcastChatMessage, Payload: payload}, ReceivedAt: time.UnixMilli(12345)})
	write.Close()
	bytes, err := io.ReadAll(read)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(bytes, &result); err != nil {
		t.Fatalf("raw chat was discarded: %v", err)
	}
	if result["text"] != "真实原始弹幕路径" || result["userId"] != "987654321012345678" || result["id"] != "1234567890123456789" {
		t.Fatalf("wrong raw decode: %s", bytes)
	}
}
