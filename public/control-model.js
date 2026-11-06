export function warningText(state) {
  return (
    [
      state.stage?.warning,
      state.error,
      state.budget?.stopped ? state.budget.reason : null,
    ]
      .filter(Boolean)
      .join("\n") || "控制连接正常；请核对实际观众画面"
  );
}
