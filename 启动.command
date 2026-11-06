#!/bin/zsh
set -u
cd -- "${0:A:h}" || exit 1

if [[ -x ./runtime/node ]]; then
  painter_node="./runtime/node"
elif command -v node >/dev/null 2>&1; then
  painter_node="$(command -v node)"
else
  print "未找到 Node.js。请安装 Node.js 24 后再次双击启动。"
  osascript -e 'display dialog "弹幕画师需要 Node.js 24。安装完成后，请再次双击 启动.command。" buttons {"打开 Node.js 官网"} default button 1' >/dev/null 2>&1
  open "https://nodejs.org/zh-cn/download"
  exit 1
fi

print "弹幕画师 · 老板模式"
print "关闭这个终端窗口即停止服务；也可按 Ctrl+C。"
print "控制页：http://127.0.0.1:7321/control"
print "舞台页：http://127.0.0.1:7321/stage"

painter_server_pid=""
painter_open_pid=""
painter_stop() {
  trap - EXIT HUP INT TERM
  if [[ -n "$painter_open_pid" ]]; then
    kill "$painter_open_pid" 2>/dev/null || true
  fi
  if [[ -n "$painter_server_pid" ]]; then
    kill -TERM "$painter_server_pid" 2>/dev/null || true
    wait "$painter_server_pid" 2>/dev/null || true
  fi
}
trap painter_stop EXIT
trap 'exit 0' HUP INT TERM

"$painter_node" server.js &
painter_server_pid=$!
(
  sleep 1
  if kill -0 "$painter_server_pid" 2>/dev/null; then
    open "http://127.0.0.1:7321/control"
  fi
) &
painter_open_pid=$!

wait "$painter_server_pid"
painter_exit_status=$?
exit "$painter_exit_status"
