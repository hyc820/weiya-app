// 管理员视角：盲盒显示「盲盒N（真实名称）」
export function adminItemLabel(item) {
  if (!item) return ''
  return item.is_blind ? `盲盒${item.blind_no}（${item.item_name}）` : item.item_name
}

// 已结标视角：盲盒显示「盲盒N-真实名称」
export function settledItemLabel(item) {
  if (!item) return ''
  return item.is_blind ? `盲盒${item.blind_no}-${item.item_name}` : item.item_name
}
